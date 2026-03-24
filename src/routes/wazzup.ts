import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma';
import { followUpQueue } from '../config/queue';
import { BitrixService } from '../services/bitrix.service';
import { ConfigService } from '../services/config.service';

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
        const { messageId, chatId, text, author } = msg;

        let validDate = new Date();
        if (msg.timestamp) validDate = new Date(msg.timestamp);
        else if (msg.dateTime) validDate = new Date(msg.dateTime);

        // Ігноруємо власні повідомлення бота
        const isBotTemplate = text && (
          text.includes('Вам актуален вопрос по украшениям') ||
          text.includes('Вам актуальне питання щодо прикрас') ||
          text.includes('still interested in jewelry') ||
          text.includes('с радостью предоставлю') ||
          text.includes('з радістю надам') ||
          text.includes('happy to provide you with additional')
        );
        if (isBotTemplate) continue;

        // Тестовий фільтр — тільки дозволені акаунти
        const allowedUsernames = ['sanchiz.es', 'no_schoo1'];
        const instagramUsername = (author?.username || chatId || '').toString();
        const isAllowedUser = allowedUsernames.some(name => instagramUsername.includes(name));
        if (!isAllowedUser) continue;

        const isManager = msg.status !== 'inbound';
        const senderType = isManager ? 'manager' : 'client';

        // Ідемпотентність — не обробляємо одне й те саме повідомлення двічі
        const existingMsg = await prisma.message.findUnique({ where: { id: messageId } });
        if (existingMsg) continue;

        let lead = await prisma.lead.findUnique({ where: { chatId } });

        if (!lead && senderType === 'client') {
          const bitrixData = await BitrixService.findLeadByInstagram(instagramUsername);
          if (!bitrixData || bitrixData.statusId !== 'NEW') {
            fastify.log.info(`[CRM] Ignoring ${instagramUsername}: status=${bitrixData?.statusId || 'NOT_FOUND'}`);
            continue;
          }
          lead = await prisma.lead.create({
            data: { id: String(bitrixData.id), chatId, status: bitrixData.statusId }
          });
        } else if (!lead && senderType === 'manager') continue;

        if (!lead) continue;

        // Зберігаємо повідомлення
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
          // =====================================================
          // КЛІЄНТ НАПИСАВ → СКАСОВУЄМО ВСІ ЗАПЛАНОВАНІ ЗАВДАННЯ
          // =====================================================
          // 1. Скасовуємо debounce-завдання (ще не запустився воркер)
          const debounceJobId = `manual_debounce_${lead.id}`;
          const debounceJob = await followUpQueue.getJob(debounceJobId);
          if (debounceJob) {
            await debounceJob.remove();
            fastify.log.info(`[CANCEL] Client replied — removed debounce job for lead ${lead.id}`);
          }

          // 2. Скасовуємо відкладені завдання воркера (delayed_check у черзі)
          const delayedJobs = await followUpQueue.getDelayed();
          for (const j of delayedJobs) {
            if (j.data?.leadId === lead.id) {
              await j.remove();
              fastify.log.info(`[CANCEL] Client replied — removed delayed check job ${j.id} for lead ${lead.id}`);
            }
          }

          // 3. Позначаємо pending follow-ups як скасовані в БД
          await prisma.followUp.updateMany({
            where: { leadId: lead.id, status: 'pending' },
            data: { status: 'cancelled', aiReasonCode: 'CLIENT_REPLIED' }
          });

          // 4. Оновлюємо статус ліда
          if (lead.status !== 'FOLLOWUP_SENT') {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { status: 'WAITING_FOR_CLIENT' }
            });
          }

        } else if (senderType === 'manager' && lead.status !== 'FOLLOWUP_SENT') {
          // =====================================================
          // МЕНЕДЖЕР НАПИСАВ → ЗАПУСКАЄМО/СКИДАЄМО ДЕБАУНС-ТАЙМЕР
          // =====================================================
          const debounceMinutes = await ConfigService.getInt('manager_debounce_minutes', 15);
          const jobId = `manual_debounce_${lead.id}`;
          const job = await followUpQueue.getJob(jobId);
          if (job) {
            await job.remove();
            fastify.log.info(`[DEBOUNCE] Reset timer for lead ${lead.id} to ${debounceMinutes} min`);
          }

          await followUpQueue.add(
            'evaluate-followup',
            { leadId: lead.id, chatId: lead.chatId, trigger: 'manager_message', timestamp: validDate },
            { jobId, delay: debounceMinutes * 60000 }
          );
        }
      }
    } catch (err: any) {
      fastify.log.error(err, 'Crash in Wazzup webhook');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    return reply.status(200).send({ status: 'ok' });
  });
}
