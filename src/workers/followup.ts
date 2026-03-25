import { Worker, Job } from 'bullmq';
import { connection } from '../config/queue';
import { prisma } from '../config/prisma';
import { AIService, AIDecisionInput } from '../services/ai.service';
import { WazzupService } from '../services/wazzup.service';
import { BitrixService } from '../services/bitrix.service';
import { followUpQueue } from '../config/queue';
import { ConfigService } from '../services/config.service';
import { BotLogger } from '../services/logger.service';

const templates: Record<string, Record<string, string>> = {
  A: {
    ru: "Здравствуйте. Скажите, пожалуйста, Вам актуален вопрос по украшениям?",
    ua: "Вітаю. Скажіть, будь ласка, Вам актуальне питання щодо прикрас?",
    en: "Hello. Kindly advise if you are still interested in jewelry.",
  },
  B: {
    ru: "Здравствуйте. Скажите, пожалуйста, возможно у Вас есть какие-либо вопросы, с радостью предоставлю Вам дополнительную информацию и предложу альтернативу с учетом всех Ваших пожеланий",
    ua: "Вітаю. Скажіть, будь ласка, можливо у Вас є якісь питання, з радістю надам Вам додаткову інформацію та запропоную альтернативу з урахуванням усіх Ваших побажань",
    en: "Hello. Kindly let me know if you have any questions, I'll be happy to provide you with additional information and offer alternatives according to your preferences.",
  }
};

export const followUpWorker = new Worker(
  'followUpQueue',
  async (job: Job) => {
    if (job.name === 'evaluate-followup') {
      const { leadId, chatId } = job.data;

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;

      await BotLogger.info('EVALUATION_START', `Starting AI evaluation for lead`, { leadId, chatId });

      const messages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      const reversedMessages = messages.reverse();
      const lastManagerMsg = reversedMessages.slice().reverse().find((m) => m.sender === 'manager');
      const lastClientMsg = reversedMessages.slice().reverse().find((m) => m.sender === 'client');
      const lastManagerTimestamp = lastManagerMsg ? lastManagerMsg.timestamp : lead.createdAt;
      const timePassedMinutes = Math.floor((new Date().getTime() - lastManagerTimestamp.getTime()) / 60000);

      await BotLogger.info('EVALUATION_CONTEXT', `Last manager msg ${timePassedMinutes} min ago. Last client msg: "${(lastClientMsg?.text || 'none').slice(0, 60)}"`, {
        leadId, chatId,
        meta: { timePassedMinutes, lastManagerMsg: lastManagerMsg?.text?.slice(0, 100), lastClientMsg: lastClientMsg?.text?.slice(0, 100) }
      });

      const aiInput: AIDecisionInput = {
        conversationHistory: reversedMessages.map((m) => ({ sender: m.sender, text: m.text, timestamp: m.timestamp })),
        lastManagerMessageTimestamp: lastManagerTimestamp,
        currentLeadStatus: lead.status,
        timePassedMinutes,
      };

      const decision = await AIService.evaluateFollowUp(aiInput);
      if (!decision) {
        await BotLogger.error('AI_FAILED', `AI evaluation returned null`, { leadId, chatId });
        throw new Error('AI Evaluation failed');
      }

      await BotLogger.decision('AI_DECISION', `AI decided: timing=${decision.timing_decision}, send=${decision.send_followup}, reason=${decision.reason_code}, lang=${decision.language}`, {
        leadId, chatId,
        meta: { ...decision }
      });

      await prisma.followUp.updateMany({
        where: { leadId, status: 'pending' },
        data: { status: 'cancelled', aiReasonCode: 'SUPERSEDED' }
      });

      if (decision.timing_decision === 'delay_more') {
        const delayMinutes = await ConfigService.getInt('followup_delay_minutes', 15);
        const delayMs = delayMinutes * 60000;

        await followUpQueue.add(
          'evaluate-followup',
          { leadId, chatId, trigger: 'delayed_check' },
          { delay: delayMs }
        );

        await prisma.followUp.create({
          data: {
            leadId,
            scheduledAt: new Date(Date.now() + delayMs),
            status: 'pending',
            language: decision.language,
            templateGroup: decision.template_group,
            aiReasonCode: decision.reason_code,
          }
        });

        await prisma.lead.update({ where: { id: leadId }, data: { status: 'FOLLOWUP_PENDING' } });
        await BotLogger.info('FOLLOWUP_SCHEDULED', `Followup queued in ${delayMinutes} min (reason: ${decision.reason_code})`, { leadId, chatId });

      } else if (decision.timing_decision === 'send_now' && decision.send_followup) {

        // ФІНАЛЬНИЙ ЗАХИСТ: Перевірка статусу IN_PROCESS в Bitrix CRM
        const bitrixLead = await BitrixService.findLeadByInstagram(chatId);
        if (!bitrixLead || bitrixLead.statusId !== 'IN_PROCESS') {
          const reason = !bitrixLead ? 'CRM_NOT_FOUND' : `CRM_BLOCKED_${bitrixLead.statusId}`;
          await BotLogger.warn('CRM_GUARD', `Send aborted — Bitrix status: ${bitrixLead?.statusId || 'NOT_FOUND'}, need IN_PROCESS`, {
            leadId, chatId, meta: { bitrixStatus: bitrixLead?.statusId }
          });
          await prisma.followUp.create({
            data: { leadId, scheduledAt: new Date(), status: 'cancelled', aiReasonCode: reason }
          });
          return;
        }

        const textToSend = templates[decision.template_group]?.[decision.language] || templates['A']['en'];
        await WazzupService.sendMessage(chatId, textToSend);

        await prisma.followUp.create({
          data: {
            leadId,
            scheduledAt: new Date(),
            status: 'sent',
            language: decision.language,
            templateGroup: decision.template_group,
            aiReasonCode: decision.reason_code,
          }
        });

        await prisma.lead.update({ where: { id: leadId }, data: { status: 'FOLLOWUP_SENT' } });
        await BotLogger.info('FOLLOWUP_SENT', `Follow-up message sent! Template ${decision.template_group} [${decision.language}]`, {
          leadId, chatId,
          meta: { template: decision.template_group, lang: decision.language, text: textToSend.slice(0, 100) }
        });

      } else {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'WAITING_FOR_CLIENT' } });
        await prisma.followUp.create({
          data: { leadId, scheduledAt: new Date(), status: 'cancelled', aiReasonCode: decision.reason_code }
        });
        await BotLogger.info('FOLLOWUP_CANCELLED', `No followup needed — ${decision.reason_code}`, { leadId, chatId });
      }
    }
  },
  {
    connection: connection as any,
    limiter: { max: 10, duration: 1000 },
    lockDuration: 30000,
  }
);

followUpWorker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
  await BotLogger.error('JOB_FAILED', `Worker job failed: ${err.message}`, {
    leadId: job?.data?.leadId,
    chatId: job?.data?.chatId,
    meta: { error: err.message }
  });
});
