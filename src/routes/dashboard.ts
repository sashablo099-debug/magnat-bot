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
    // ... existing lead deletion code ...
    const { id } = request.params as { id: string };
    try {
      await prisma.message.deleteMany({ where: { leadId: id } });
      await prisma.followUp.deleteMany({ where: { leadId: id } });
      await prisma.lead.delete({ where: { id } });
      return { status: 'success' };
    } catch (e) {
      return reply.code(500).send({ error: 'Failed to delete' });
    }
  });

  // SETTINGS API
  fastify.get('/settings', async () => {
    return await prisma.settings.findMany();
  });

  fastify.post('/settings', async (request) => {
    const { key, value } = request.body as { key: string; value: string };
    return await prisma.settings.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  });
}

