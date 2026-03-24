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

        const isBotTemplate = text && (
          text.includes('Вам актуален вопрос по украшениям') ||
          text.includes('Вам актуальне питання щодо прикрас') ||
          text.includes('still interested in jewelry')
        );

        if (isBotTemplate) continue;

        const allowedUsernames = ['sanchiz.es', 'no_schoo1'];
        const instagramUsername = (author?.username || chatId || '').toString();
        const isAllowedUser = allowedUsernames.some(name => instagramUsername.includes(name));

        if (!isAllowedUser) continue;

        const isManager = msg.status !== 'inbound';
        const senderType = isManager ? 'manager' : 'client';

        const existingMsg = await prisma.message.findUnique({ where: { id: messageId } });
        if (existingMsg) continue;

        let lead = await prisma.lead.findUnique({ where: { chatId } });

        if (!lead && senderType === 'client') {
          const bitrixData = await BitrixService.findLeadByInstagram(instagramUsername);
          if (!bitrixData || bitrixData.statusId !== 'NEW') continue;
          lead = await prisma.lead.create({
            data: { id: String(bitrixData.id), chatId, status: bitrixData.statusId }
          });
        } else if (!lead && senderType === 'manager') continue;

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

          if (senderType === 'manager' && lead.status !== 'FOLLOWUP_SENT') {
            const debounceMinutes = await ConfigService.getInt('manager_debounce_minutes', 15);
            const jobId = `manual_debounce_${lead.id}`;
            const job = await followUpQueue.getJob(jobId);
            if (job) await job.remove();

            await followUpQueue.add(
              'evaluate-followup',
              { leadId: lead.id, chatId: lead.chatId, trigger: 'manager_message', timestamp: validDate },
              { jobId, delay: debounceMinutes * 60000 }
            );
          }
        }
      }
    } catch (err: any) {
      fastify.log.error(err, 'Crash in Wazzup webhook');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    return reply.status(200).send({ status: 'ok' });
  });
}
