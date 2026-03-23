import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/followups', async (request, reply) => {
    // Return only the latest FollowUp object per lead
    // Fetch manually to bypass Prisma's SQLite strict type mismatch bug on INCLUDE
    const followups = await prisma.followUp.findMany({ 
      orderBy: { scheduledAt: 'desc' }
    });
    
    const leads = await prisma.lead.findMany();
    // JS Map will handle string/number coercion safely
    const leadMap = new Map();
    leads.forEach(l => leadMap.set(String(l.id), l));
    
    const uniquePerLead = [];
    const seen = new Set<string>();
    
    for (const f of followups) {
      const fLeadIdStr = String(f.leadId);
      if (!seen.has(fLeadIdStr)) {
        // Fallback to Unknown if somehow missing
        const leadData = leadMap.get(fLeadIdStr) || { chatId: 'UNKNOWN', status: 'UNKNOWN' };
        uniquePerLead.push({ ...f, lead: leadData });
        seen.add(fLeadIdStr);
      }
    }
    return uniquePerLead;
  });

  fastify.get('/leads', async (request, reply) => {
    const leads = await prisma.lead.findMany();
    return leads;
  });

  fastify.get('/messages/:chatId', async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'asc' },
    });
    return messages;
  });

  fastify.post('/followups/:id/trigger', async (request, reply) => {
    return { status: 'triggered' };
  });

  fastify.post('/followups/:id/cancel', async (request, reply) => {
    return { status: 'cancelled' };
  });

  // DELETE a Lead and all its traces for easy testing
  fastify.delete('/leads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      // 1. Delete Messages
      await prisma.message.deleteMany({ where: { leadId: id } });
      // 2. Delete FollowUps
      await prisma.followUp.deleteMany({ where: { leadId: id } });
      // 3. Delete Lead
      await prisma.lead.delete({ where: { id } });
      return { status: 'success', message: 'Lead deleted permanently!' };
    } catch (error: any) {
      fastify.log.error(error, "Error deleting lead");
      return reply.code(500).send({ error: error.message || 'Error deleting lead' });
    }
  });
}
