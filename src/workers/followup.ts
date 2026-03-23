import { Worker, Job } from 'bullmq';
import { connection } from '../config/queue';
import { prisma } from '../config/prisma';
import { AIService, AIDecisionInput } from '../services/ai.service';
import { WazzupService } from '../services/wazzup.service';
import { BitrixService } from '../services/bitrix.service';
import { followUpQueue } from '../config/queue';

// Template dictionary (MVP)
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

      // 1. Gather Context
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;

      const messages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      const reversedMessages = messages.reverse();

      const lastManagerMsg = reversedMessages.slice().reverse().find((m) => m.sender === 'manager');
      const lastManagerTimestamp = lastManagerMsg ? lastManagerMsg.timestamp : lead.createdAt;

      const timePassedMinutes = Math.floor((new Date().getTime() - lastManagerTimestamp.getTime()) / 60000);

      // 2. Call AI Service
      const aiInput: AIDecisionInput = {
        conversationHistory: reversedMessages.map((m) => ({ sender: m.sender, text: m.text, timestamp: m.timestamp })),
        lastManagerMessageTimestamp: lastManagerTimestamp,
        currentLeadStatus: lead.status,
        timePassedMinutes,
      };

      const decision = await AIService.evaluateFollowUp(aiInput);
      if (!decision) throw new Error('AI Evaluation failed');

      console.log(`[AI DECISION for ${chatId}]:`, decision);

      // 3. Handle Decision
      // ОЧИЩЕННЯ: прибираємо старі очікуючі повідомлення для цього чату, щоб не було дублікатів
      await prisma.followUp.updateMany({
        where: { leadId, status: 'pending' },
        data: { status: 'cancelled', aiReasonCode: 'SUPERSEDED' }
      });

      if (decision.timing_decision === 'delay_more') {
        // Schedule next evaluation
        const delayMs = decision.delay_minutes * 60000;
        await followUpQueue.add(
          'evaluate-followup',
          { leadId, chatId, trigger: 'delayed_check' },
          { delay: delayMs }
        );

        // Record in dashboard 
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

        // Update lead status
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'FOLLOWUP_PENDING' } });
      } else if (decision.timing_decision === 'send_now' && decision.send_followup) {
        
        // --- 🔒 CRM CHECK BEFORE SENDING ---
        try {
          const bitrixLead = await BitrixService.findLeadByInstagram(chatId);
          
          // ТЕПЕР ЖОРСТКА ПЕРЕВІРКА: Лід ПОВИНЕН бути в CRM, і його статус ПОВИНЕН бути IN_PROCESS
          if (!bitrixLead || bitrixLead.statusId !== 'IN_PROCESS') {
            const blockReason = !bitrixLead ? 'CRM_NOT_FOUND' : `CRM_BLOCKED_${bitrixLead.statusId}`;
            console.log(`[CRM BLOCK] Lead ${chatId}: ${blockReason}. Sending aborted!`);
            
            await prisma.followUp.create({
              data: {
                leadId,
                scheduledAt: new Date(),
                status: 'cancelled',
                aiReasonCode: blockReason,
              }
            });
            return; // Завершуємо виконання, лист гарантовано не відправляється!
          }
        } catch(e) {
          console.error('Error verifying Bitrix status before sending:', e);
          return; // Якщо CRM впала, теж не ризикуємо відправляти
        }
        // -----------------------------------

        // Send message
        const textToSend = templates[decision.template_group]?.[decision.language] || templates['A']['en'];
        
        await WazzupService.sendMessage(chatId, textToSend);

        // Mark sent
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
      } else {
        // Якщо AI вирішив не відправляти зараз (cancel або send_now + send_followup=false)
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'WAITING_FOR_CLIENT' } });
        
        await prisma.followUp.create({
          data: {
            leadId,
            scheduledAt: new Date(),
            status: 'cancelled',
            aiReasonCode: decision.reason_code,
          }
        });
      }
    }
  },
  {
    connection: connection as any,
    limiter: {
      max: 10,
      duration: 1000,
    },
    // Reliability
    lockDuration: 30000,
  }
);

followUpWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error ${err.message}`);
});
