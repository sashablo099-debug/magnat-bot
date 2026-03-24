import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { followUpQueue } from '../config/queue';
import { BitrixService } from '../services/bitrix.service';

export async function wazzupRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (body?.test === true) {
      return reply.code(200).send({ status: 'success' });
    }

    // Тимчасово прибираємо WEBHOOK_SECRET, оскільки Wazzup може не надсилати його
    // Якщо Wazzup не надіслав messages, просто повертаємо 200
    if (!body?.messages || !Array.isArray(body.messages)) {
      return reply.status(200).send({ status: 'ignored' });
    }

    try {
      const { messages } = body;
      fastify.log.info({ WazzupPayload: encodeURIComponent(JSON.stringify(messages)) }, 'Received Webhook messages');

      for (const msg of messages) {
        const { messageId, chatId, text, author, channelId } = msg;

        // Безпечний парсинг часу
        let validDate = new Date();
        if (msg.timestamp) validDate = new Date(msg.timestamp);
        else if (msg.dateTime) validDate = new Date(msg.dateTime);

        if (isNaN(validDate.getTime())) {
          if (typeof msg.timestamp === 'string' && !isNaN(Number(msg.timestamp))) {
            validDate = new Date(Number(msg.timestamp)); // Handle unix string
          } else {
            validDate = new Date();
          }
        }

        fastify.log.info(`Processing message: channelId=${channelId}, chatId=${chatId}, author=${author?.username}`);

        // --- ЗАХИСТ ВІД БЕЗКІНЕЧНОГО ЦИКЛУ: ІГНОРУВАТИ ДОПИСИ БОТА ---
        const isBotTemplate = text && (
          text.includes('Вам актуален вопрос по украшениям') ||
          text.includes('Вам актуальне питання щодо прикрас') ||
          text.includes('still interested in jewelry') ||
          text.includes('с радостью предоставлю Вам дополнительную информацию') ||
          text.includes('з радістю надам Вам додаткову інформацію') ||
          text.includes("happy to provide you with additional")
        );

        if (isBotTemplate) {
          fastify.log.info(`Ignoring self-message from AI bot to prevent infinite loop.`);
          continue; // Бот не повинен обробляти свої власні повідомлення!
        }

        // Дозволені тестові акаунти (щоб не надсилати повідомлення реальним клієнтам)
        const allowedUsernames = ['sanchiz.es', 'no_schoo1'];

        // Безпечна перевірка імені
        const instagramUsername = (author?.username || chatId || '').toString();
        const isAllowedUser = allowedUsernames.some(name => instagramUsername.includes(name));

        if (!isAllowedUser) {
          fastify.log.info(`[WARNING] username mismatch: expected sanchiz/no_school1 but got ${instagramUsername}`);
          continue; // Скіпаємо всіх реальних користувачів під час тесту
        }

        // У Wazzup вхідні повідомлення клієнта мають status "inbound".
        // Відповіді менеджера мають status "sent", "delivered", "read" або "outbound".
        const isManager = msg.status !== 'inbound';
        const senderType = isManager ? 'manager' : 'client';

        // Idempotency: Check if message already exists
        const existingMsg = await prisma.message.findUnique({ where: { id: messageId } });
        if (existingMsg) continue;

        // 1. Link or Find Lead
        let lead = await prisma.lead.findUnique({ where: { chatId } });

        if (!lead && senderType === 'client') {
          try {
            const bitrixData = await BitrixService.findLeadByInstagram(instagramUsername);
            if (!bitrixData || bitrixData.statusId !== 'NEW') {
              fastify.log.info(`[CRM CHECK] Ignoring new user ${instagramUsername}. Bitrix status: ${bitrixData?.statusId || 'NOT_FOUND'}, expected 'NEW'.`);
              continue; // Ігноруємо повідомлення, якщо лід не NEW або його немає в Bitrix
            }
            lead = await prisma.lead.create({
              data: {
                id: String(bitrixData.id),
                chatId,
                status: bitrixData.statusId,
              },
            });
          } catch (e) {
            fastify.log.error(e, 'Failed to fetch Bitrix logic for new lead');
            continue;
          }
        } else if (!lead && senderType === 'manager') {
          fastify.log.info(`Ignoring first message from manager to unknown lead ${instagramUsername}.`);
          continue;
        }

        // 2. Save Message
        if (lead) {
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

          // 3. Trigger evaluation ТІЛЬКИ коли менеджер щось написав! (Реальна логіка)
          if (senderType === 'manager') {
            if (lead.status === 'FOLLOWUP_SENT') {
              fastify.log.info(`[LIMIT] Follow-up already sent for lead ${lead.id}. Rule: ONLY 1 REMINDER EVER.`);
            } else {
              // Менеджер може уточнювати інфу, тому даємо йому 5 хвилин "тиші" перед тим,
              // як AI почне думати про відправку фоллоу-апа. BullMQ проігнорує дублікати в межах 5 хв.
              await followUpQueue.add(
                'evaluate-followup',
                {
                  leadId: lead.id,
                  chatId: lead.chatId,
                  trigger: 'manager_message',
                  timestamp: validDate
                },
                {
                  jobId: `evaluate_debounce_${lead.id}_${Math.floor(Date.now() / (5 * 60000))}`,
                  delay: 5 * 60000 // 5 хвилин затримки на "дописування"
                }
              );
            }
          }
        }
      }
    } catch (err: any) {
      fastify.log.error(err, 'Crash caught in Wazzup webhook processing!');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }

    return reply.status(200).send({ status: 'ok' });
  });
}
