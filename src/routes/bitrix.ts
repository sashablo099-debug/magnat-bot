import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma';
import { followUpQueue } from '../config/queue';

export async function bitrixRoutes(fastify: FastifyInstance) {
  // Typical Bitrix webhook payload has: event, event_handler_id, auth, data[FIELDS][ID]
  fastify.post('/lead-updated', async (request, reply) => {
    const body = request.body as any;
    
    // Simplistic token validation for MVP (can compare body.auth.application_token to env)
    const leadId = body.data?.FIELDS?.ID;
    const newStatus = body.data?.FIELDS?.STATUS_ID; // Depending on bitrix payload. Usually requires a separate GET to fetch details if not fully passed.

    if (!leadId) {
      return reply.status(200).send({ status: 'ignored' });
    }

    // Update local DB status if we have this lead mapped
    const lead = await prisma.lead.findUnique({ where: { id: String(leadId) } });
    if (lead) {
      if (newStatus && lead.status !== newStatus) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: newStatus },
        });

        // Trigger AI Evaluation if status changed to IN_PROCESS (or equivalent mapping)
        // Bitrix statuses are like "NEW", "IN_PROCESS", "WON", "LOSE"
        if (newStatus === 'IN_PROCESS' || newStatus === 'PREPARATION') { // example Bitrix status codes
          await followUpQueue.add('evaluate-followup', {
            leadId: lead.id,
            chatId: lead.chatId,
            trigger: 'status_changed',
          });
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  });
}
