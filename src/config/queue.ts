import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const followUpQueue = new Queue('followUpQueue', { connection });
