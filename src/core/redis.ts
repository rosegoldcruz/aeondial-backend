import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from './config';

export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const automationQueue = new Queue('automations', {
  connection: { url: config.redisUrl },
});
