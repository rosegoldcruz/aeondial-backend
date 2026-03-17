import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { config } from './config';
import { logger } from './logger';

export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const bullConnection = { url: config.redisUrl };

export const triggersQueue = new Queue('triggers', {
  connection: bullConnection,
});

export const actionsQueue = new Queue('actions', {
  connection: bullConnection,
});

export const workflowsQueue = new Queue('workflows', {
  connection: bullConnection,
});

const allowedTriggers = new Set([
  'call.ended',
  'sms.received',
  'lead.created',
  'lead.updated',
  'ai.outcome',
]);

const allowedActions = new Set([
  'send.sms',
  'send.email',
  'assign.agent',
  'move.pipeline',
  'start.campaign',
  'fire.webhook',
]);

let workersStarted = false;

export function startBackgroundWorkers(): void {
  if (workersStarted) {
    return;
  }
  workersStarted = true;

  const triggersWorker = new Worker(
    'triggers',
    async (job) => {
      if (!allowedTriggers.has(job.name)) {
        throw new Error(`Unsupported trigger: ${job.name}`);
      }

      const payload = (job.data || {}) as { org_id?: string; actions?: string[] };
      if (!payload.org_id) {
        throw new Error('Trigger job missing org_id');
      }

      logger.info({ trigger: job.name, org_id: payload.org_id }, 'Trigger received');

      // Fan out actions declared by the workflow payload.
      for (const action of payload.actions || []) {
        await actionsQueue.add(action, { ...payload, source_trigger: job.name });
      }
    },
    { connection: bullConnection },
  );

  const actionsWorker = new Worker(
    'actions',
    async (job) => {
      if (!allowedActions.has(job.name)) {
        throw new Error(`Unsupported action: ${job.name}`);
      }

      const payload = (job.data || {}) as { org_id?: string };
      if (!payload.org_id) {
        throw new Error('Action job missing org_id');
      }

      logger.info({ action: job.name, org_id: payload.org_id }, 'Action executed');
    },
    { connection: bullConnection },
  );

  const workflowsWorker = new Worker(
    'workflows',
    async (job) => {
      const payload = (job.data || {}) as { org_id?: string; trigger?: string; actions?: string[] };
      if (!payload.org_id || !payload.trigger) {
        throw new Error('Workflow job missing org_id or trigger');
      }

      await triggersQueue.add(payload.trigger, {
        org_id: payload.org_id,
        actions: payload.actions || [],
      });

      logger.info(
        { workflow: job.name, org_id: payload.org_id, trigger: payload.trigger },
        'Workflow enqueued trigger',
      );
    },
    { connection: bullConnection },
  );

  for (const worker of [triggersWorker, actionsWorker, workflowsWorker]) {
    worker.on('failed', (job, err) => {
      logger.error({ queue: worker.name, jobId: job?.id, err }, 'Worker job failed');
    });
  }

  logger.info('BullMQ workers started: triggers, actions, workflows');
}
