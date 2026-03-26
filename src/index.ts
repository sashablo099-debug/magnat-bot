import fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { prisma } from './config/prisma';

// Route imports
import { wazzupRoutes } from './routes/wazzup';
import { bitrixRoutes } from './routes/bitrix';
import { dashboardRoutes } from './routes/dashboard';
import './workers/followup';
import fastifyStatic from '@fastify/static';
import path from 'path';

const server = fastify({
  logger: true,
});

server.register(cors);

// Register API routes
server.register(wazzupRoutes, { prefix: '/webhook/wazzup' });
server.register(bitrixRoutes, { prefix: '/webhook/bitrix' });
server.register(dashboardRoutes, { prefix: '/api' });

// Serve React Frontend (Production Build)
const distPath = path.join(__dirname, '../frontend/dist');
server.register(fastifyStatic, {
  root: distPath,
  prefix: '/', 
});

// Fallback all non-API requests to React's index.html
server.setNotFoundHandler((request, reply) => {
  if (request.raw.url && request.raw.url.startsWith('/api')) {
    reply.status(404).send({ error: 'Not Found' });
  } else {
    reply.sendFile('index.html');
  }
});

// Seed + migrate default settings on startup
async function seedDefaultSettings() {
  // manager_debounce_minutes: create only if not exists
  await (prisma as any).settings.upsert({
    where:  { key: 'manager_debounce_minutes' },
    update: {},
    create: { key: 'manager_debounce_minutes', value: '15' },
  });

  // followup_delay_minutes: smart migration
  // - Not exists → create with 1440 (24h)
  // - Exists with old default '15' → upgrade to 1440
  // - Exists with custom value → leave as-is
  const followupSetting = await (prisma as any).settings.findUnique({
    where: { key: 'followup_delay_minutes' }
  });
  if (!followupSetting) {
    await (prisma as any).settings.create({
      data: { key: 'followup_delay_minutes', value: '1440' }
    });
    console.log('[SEED] followup_delay created: 1440min (24h)');
  } else if (followupSetting.value === '15') {
    await (prisma as any).settings.update({
      where: { key: 'followup_delay_minutes' },
      data:  { value: '1440' }
    });
    console.log('[SEED] followup_delay migrated: 15 → 1440min (24h)');
  } else {
    console.log(`[SEED] followup_delay kept as-is: ${followupSetting.value}min`);
  }
}

const start = async () => {
  try {
    await seedDefaultSettings();
    await server.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
    console.log(`Server is running at http://localhost:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
