import { Queue } from 'bullmq';
import { connection } from './src/config/queue';

async function checkQueue() {
  const followUpQueue = new Queue('followUpQueue', { connection });

  const active = await followUpQueue.getActive();
  const waiting = await followUpQueue.getWaiting();
  const delayed = await followUpQueue.getDelayed();
  const failed = await followUpQueue.getFailed();

  console.log(`Active: ${active.length}`);
  console.log(`Waiting: ${waiting.length}`);
  console.log(`Delayed: ${delayed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("Last 2 Failed Jobs:", failed.slice(-2).map(j => ({
      id: j.id,
      name: j.name,
      data: j.data,
      failedReason: j.failedReason,
      timestamp: j.timestamp
    })));
  }
}

checkQueue().finally(() => process.exit(0));
