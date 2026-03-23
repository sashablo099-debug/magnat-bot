import fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';

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

const start = async () => {
  try {
    await server.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
    console.log(`Server is running at http://localhost:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
