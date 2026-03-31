import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma';
import { followUpQueue } from '../config/queue';
import { BitrixService } from '../services/bitrix.service';
import { ConfigService } from '../services/config.service';
import { BotLogger } from '../services/logger.service';

export async function wazzupRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (body?.test === true) {
      return reply.code(200).send({ status: 'success' });
    }

    if (!body?.messages || !Array.isArray(body.messages)) {
      return reply.status(200).send({ status: 'ignored' });
    }

    try {
      const { messages } = body;
      for (const msg of messages) {
        const { messageId, chatId, text, author, chatType } = msg;
        
        // Фільтр: обробляємо тільки повідомлення з Instagram
        if (chatType !== 'instagram') {
          continue;
        }

        const isManager = msg.status !== 'inbound';
        const senderType = isManager ? 'manager' : 'client';
        const instagramUsername = (author?.username || chatId || '').toString();

        // [LOG] ВХІДНИЙ СИГНАЛ (до будь-яких фільтрів)
        await BotLogger.info('RAW_WEBHOOK', 
          `@${instagramUsername} (${senderType}): "${(text || '').slice(0, 50)}"`,
          { chatId, meta: { msg } }
        );

        let validDate = new Date();
        if (msg.timestamp) validDate = new Date(msg.timestamp);
        else if (msg.dateTime) validDate = new Date(msg.dateTime);

        // Ігноруємо власні повідомлення бота
        const isBotTemplate = text && (
          text.includes('Вам актуален вопрос относительно украшений') ||
          text.includes('Вам актуальне питання щодо прикрас') ||
          text.includes('still interested in jewelry') ||
          text.includes('с радостью предоставлю') ||
          text.includes('з радістю надам') ||
          text.includes('happy to provide you with additional')
        );
        if (isBotTemplate) {
          await BotLogger.info('BOT_MSG_IGNORED', `Skipped own bot template message`, { chatId });
          continue;
        }

        // Тестовий фільтр
        const isTestMode = await ConfigService.getInt('test_mode', 1) === 1;
        const allowedUsernames = ['sanchiz.es', 'no_schoo1', 's.ageev', '_real_nowhere_man_'];
        const isAllowedUser = allowedUsernames.some(name => instagramUsername.includes(name));

        if (isTestMode && !isAllowedUser) {
          await BotLogger.info('MSG_FILTERED', `@${instagramUsername} is not in allowed list. Skipping.`, { chatId });
          continue;
        }

        const existingMsg = await (prisma as any).message.findUnique({ where: { id: messageId } });
        if (existingMsg) continue;

        let lead = await prisma.lead.findUnique({ where: { chatId } });

        if (!lead && senderType === 'client') {
          const bitrixData = await BitrixService.findLeadByInstagram(instagramUsername);

          if (!bitrixData) {
            // Ліда ще немає в Bitrix — можливо не встиг додатись. Пробуємо ще раз через 60 сек.
            await BotLogger.warn('CRM_RETRY', `Lead NOT_FOUND in Bitrix. Scheduling retry in 60s`, {
              chatId, meta: { instagramUsername, messageId, text: (text || '').slice(0, 100), timestamp: validDate }
            });
            await followUpQueue.add(
              'retry-lead-creation',
              { chatId, instagramUsername, messageId, text: text || '', timestamp: validDate.toISOString() },
              { delay: 60000, jobId: `retry_lead_${chatId}_${messageId}` }
            );
            continue;
          }

          if (bitrixData.statusId !== 'NEW') {
            await BotLogger.warn('CRM_BLOCKED', `Lead not created: Bitrix status is "${bitrixData.statusId}", expected NEW`, {
              chatId, meta: { instagramUsername, bitrixStatus: bitrixData.statusId }
            });
            continue;
          }

          // Використовуємо upsert для захисту від race conditions (одночасних повідомлень)
          lead = await prisma.lead.upsert({
            where: { chatId },
            update: { status: bitrixData.statusId },
            create: { id: String(bitrixData.id), chatId, status: bitrixData.statusId }
          });
          await BotLogger.info('LEAD_CREATED', `New lead created/updated from CRM (status: NEW)`, { leadId: lead.id, chatId });
        } else if (!lead && senderType === 'manager') continue;

        if (!lead) continue;

        await prisma.message.create({
          data: {
            id: messageId,
            chatId,
            leadId: lead.id,
            sender: senderType,
            text: text || '',
            timestamp: validDate,
          },
        });

        if (senderType === 'client') {
          // Скасовуємо всі заплановані завдання при відповіді клієнта О(1) замість О(N)
          const debounceJobId = `manual_debounce_${lead.id}`;
          const delayedJobId = `delayed_24h_${lead.id}`;

          const debounceJob = await followUpQueue.getJob(debounceJobId);
          if (debounceJob) {
            await debounceJob.remove();
            await BotLogger.info('DEBOUNCE_CANCELLED', `Client replied — debounce timer removed`, { leadId: lead.id, chatId });
          }

          const delayedJob = await followUpQueue.getJob(delayedJobId);
          if (delayedJob) {
            await delayedJob.remove();
            await BotLogger.info('QUEUE_CANCELLED', `Client replied — removed 24h delayed job from queue`, { leadId: lead.id, chatId });
          }

          await prisma.followUp.updateMany({
            where: { leadId: lead.id, status: 'pending' },
            data: { status: 'cancelled', aiReasonCode: 'CLIENT_REPLIED' }
          });

          await BotLogger.info('CLIENT_REPLIED', `Client sent a message: "${(text || '').slice(0, 80)}"`, {
            leadId: lead.id,
            chatId,
            meta: { text: (text || '').slice(0, 200) }
          });

          if (lead.status !== 'FOLLOWUP_SENT') {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { status: 'WAITING_FOR_CLIENT' }
            });
          }

        } else if (senderType === 'manager' && lead.status !== 'FOLLOWUP_SENT') {
          const debounceMinutes = await ConfigService.getInt('manager_debounce_minutes', 15);
          const jobId = `manual_debounce_${lead.id}`;
          const job = await followUpQueue.getJob(jobId);
          if (job) {
            await job.remove();
            await BotLogger.info('DEBOUNCE_RESET', `Manager sent message — timer reset to ${debounceMinutes} min`, { leadId: lead.id, chatId });
          } else {
            await BotLogger.info('DEBOUNCE_START', `Manager sent message — starting ${debounceMinutes}-min silence timer`, { leadId: lead.id, chatId });
          }

          await followUpQueue.add(
            'evaluate-followup',
            { leadId: lead.id, chatId: lead.chatId, trigger: 'manager_message', timestamp: validDate },
            { jobId, delay: debounceMinutes * 60000 }
          );
        }
      }
    } catch (err: any) {
      await BotLogger.error('WEBHOOK_CRASH', `Unhandled error in Wazzup webhook: ${err.message}`, { meta: { stack: err.stack?.slice(0, 300) } });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    return reply.status(200).send({ status: 'ok' });
  });
}
