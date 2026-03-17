/**
 * Progressive Auto-Dialer Engine
 * ───────────────────────────────
 * BullMQ-based queue that paces outbound calls for campaigns.
 *
 * Dialing model (1:1 progressive)
 * ──────────────────────────────────
 * One call is placed per READY agent.  When a call is answered as HUMAN:
 *   1. The lead channel is bridged to the agent's channel.
 *   2. Agent state moves RESERVED → INCALL.
 * When AMD=MACHINE or call is not answered:
 *   1. Optionally play a voicemail drop, then hangup lead channel.
 *   2. Agent state moves RESERVED → READY so the next dial can start.
 *
 * Job payload shape  (DialerJobData)
 * ────────────────────────────────────
 *   org_id, campaign_id, cl_id, lead_id, contact_id, phone, session_id, attempt
 *
 * Queue names
 * ────────────────────────────────────
 *   dialer:<org_id>:<campaign_id>   – per-campaign queue for isolation
 *   (all share the same Redis connection)
 */

import { Queue, Worker, Job } from 'bullmq';
import { bullConnection } from '../../core/redis';
import { supabase } from '../../core/supabase';
import { ARI, AriRequestError } from '../../core/ari';
import { config } from '../../core/config';
import { emitOrgEvent } from '../../core/websocket';
import { logger } from '../../core/logger';
import { reserveNextAgent, transitionAgentState } from './agentState';
import { amdDispatchAction } from './amd';

export interface DialerJobData {
  org_id: string;
  campaign_id: string;
  cl_id: string;        // campaign_leads.cl_id
  lead_id: string;
  contact_id: string | null;
  phone: string;        // E.164
  session_id: string;   // pre-reserved agent session
  call_id: string;      // pre-created calls row id
  attempt: number;
}

// ── Queue factory ─────────────────────────────────────────────────────────────

const dialerQueues = new Map<string, Queue>();

function queueName(orgId: string, campaignId: string): string {
  return `dialer:${orgId}:${campaignId}`;
}

export function getDialerQueue(orgId: string, campaignId: string): Queue {
  const name = queueName(orgId, campaignId);
  if (!dialerQueues.has(name)) {
    dialerQueues.set(name, new Queue(name, { connection: bullConnection }));
  }
  return dialerQueues.get(name)!;
}

/**
 * Add the next batch of leads to the dialer queue.
 * Called when a campaign starts or when the queue drains below a threshold.
 * Returns how many leads were enqueued.
 */
export async function seedDialerQueue(
  orgId: string,
  campaignId: string,
  batchSize = 50,
): Promise<number> {
  const { data: leads, error } = await supabase
    .from('v_dialer_queue')
    .select('cl_id, lead_id, contact_id, phone, priority')
    .eq('org_id', orgId)
    .eq('campaign_id', campaignId)
    .limit(batchSize);

  if (error) {
    logger.error({ error, org_id: orgId, campaign_id: campaignId }, 'Failed to seed dialer queue');
    return 0;
  }

  if (!leads || leads.length === 0) return 0;

  const queue = getDialerQueue(orgId, campaignId);
  let enqueued = 0;

  for (const lead of leads) {
    // Mark lead as 'dialing' to prevent double-dial
    const { error: updateErr } = await supabase
      .from('campaign_leads')
      .update({ dial_state: 'dialing', updated_at: new Date().toISOString() })
      .eq('cl_id', lead.cl_id)
      .eq('org_id', orgId)
      .eq('dial_state', 'pending'); // Only if still pending (idempotent guard)

    if (updateErr) continue;

    // Create a placeholder call row
    const callId = crypto.randomUUID();
    await supabase.from('calls').insert({
      call_id: callId,
      org_id: orgId,
      campaign_id: campaignId,
      contact_id: lead.contact_id,
      lead_id: lead.lead_id,
      cl_id: lead.cl_id,
      direction: 'outbound',
      status: 'queued',
      created_by: 'dialer',
      updated_by: 'dialer',
    });

    await queue.add(
      'dial',
      {
        org_id: orgId,
        campaign_id: campaignId,
        cl_id: lead.cl_id,
        lead_id: lead.lead_id,
        contact_id: lead.contact_id,
        phone: lead.phone,
        session_id: '', // filled at dispatch time
        call_id: callId,
        attempt: 1,
      } satisfies DialerJobData,
      {
        attempts: 1, // handled at application level; do not auto-retry
        removeOnComplete: { age: 60 * 60 * 24 }, // keep 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 },
        priority: lead.priority ?? 0,
      },
    );

    enqueued++;
  }

  logger.info({ org_id: orgId, campaign_id: campaignId, enqueued }, 'Dialer queue seeded');
  return enqueued;
}

/**
 * Drain (cancel) all pending jobs for a campaign.
 */
export async function drainDialerQueue(orgId: string, campaignId: string): Promise<void> {
  const queue = getDialerQueue(orgId, campaignId);
  await queue.drain();

  // Return any 'dialing' leads back to 'pending' so they can be re-queued after restart
  await supabase
    .from('campaign_leads')
    .update({ dial_state: 'pending', updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('campaign_id', campaignId)
    .eq('dial_state', 'dialing');

  logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer queue drained');
}

// ── Worker process ─────────────────────────────────────────────────────────────

const activeWorkers = new Map<string, Worker>();

export function startDialerWorker(orgId: string, campaignId: string): void {
  const name = queueName(orgId, campaignId);

  if (activeWorkers.has(name)) return; // already running

  const worker = new Worker<DialerJobData>(
    name,
    async (job: Job<DialerJobData>) => processDialerJob(job),
    {
      connection: bullConnection,
      concurrency: 10, // max parallel dials per worker instance
      limiter: {
        max: Number(process.env.DIALER_CPS ?? 5),
        duration: 1000, // per second
      },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, err }, 'Dialer job failed');
  });

  worker.on('completed', async (job) => {
    const { org_id, campaign_id } = job.data;

    // Re-seed when queue starts to empty (< 20 jobs remaining)
    const waiting = await getDialerQueue(org_id, campaign_id).getWaitingCount();
    if (waiting < 20) {
      await seedDialerQueue(org_id, campaign_id, 50);
    }
  });

  activeWorkers.set(name, worker);
  logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer worker started');
}

export async function stopDialerWorker(orgId: string, campaignId: string): Promise<void> {
  const name = queueName(orgId, campaignId);
  const worker = activeWorkers.get(name);
  if (!worker) return;

  await worker.close();
  activeWorkers.delete(name);
  logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer worker stopped');
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processDialerJob(job: Job<DialerJobData>): Promise<void> {
  const { org_id, campaign_id, cl_id, lead_id, contact_id, phone, call_id, attempt } = job.data;

  logger.info({ org_id, campaign_id, cl_id, call_id, attempt }, 'Dialer job started');

  // 1. Reserve an available agent
  const session = await reserveNextAgent(org_id, campaign_id);

  if (!session) {
    // No agent available: return lead to pending and emit queue metric
    await releaseCampaignLead(cl_id, org_id, 'pending');
    await updateCallStatus(call_id, org_id, 'abandoned', { reason: 'no_agent' });

    emitOrgEvent({
      type: 'queue.lead_abandoned',
      org_id,
      campaign_id,
      payload: { call_id, cl_id, reason: 'no_agent_available', attempt },
    });

    logger.warn({ org_id, campaign_id, cl_id }, 'No ready agent; lead returned to queue');
    return;
  }

  const sessionId = session.session_id;
  const agentId = session.agent_id;

  // Emit lead-dialing event
  emitOrgEvent({
    type: 'queue.lead_dialing',
    org_id,
    campaign_id,
    payload: { call_id, cl_id, phone, agent_id: agentId, session_id: sessionId, attempt },
  });

  // 2. Resolve outbound endpoint
  const endpoint = `${config.ariEndpointPrefix}/${phone.replace(/^\+/, '')}`;

  // Update call row with assigned agent
  await supabase
    .from('calls')
    .update({
      status: 'dialing',
      assigned_agent: agentId,
      metadata: { agent_id: agentId, session_id: sessionId, endpoint, attempt },
      updated_at: new Date().toISOString(),
    })
    .eq('call_id', call_id)
    .eq('org_id', org_id);

  // Update campaign_lead attempts and last_called_at
  await supabase
    .from('campaign_leads')
    .update({
      attempts: attempt,
      last_called_at: new Date().toISOString(),
      last_call_id: call_id,
      assigned_agent: agentId,
    })
    .eq('cl_id', cl_id)
    .eq('org_id', org_id);

  // 3. Originate via ARI
  let ariChannelId: string;

  try {
    const ariChannel = await ARI.channels.originate({
      endpoint,
      callerId: await resolveCallerId(org_id, campaign_id),
      channelId: call_id,
      appArgs: `dialer,${call_id},${org_id}`,
      timeout: 30,
      variables: {
        DIALER_CALL_ID: call_id,
        DIALER_ORG_ID: org_id,
        DIALER_CAMPAIGN_ID: campaign_id,
        DIALER_CL_ID: cl_id,
        DIALER_BACKEND_URL: process.env.BACKEND_INTERNAL_URL ?? `http://localhost:${config.port}`,
        AMD_ENABLED: '1',
      },
    }) as { id: string } | undefined;

    ariChannelId =
      ariChannel && typeof ariChannel === 'object' && 'id' in ariChannel && ariChannel.id
        ? ariChannel.id
        : call_id;

    await supabase
      .from('calls')
      .update({
        status: 'originated',
        metadata: {
          agent_id: agentId,
          session_id: sessionId,
          endpoint,
          ari_channel_id: ariChannelId,
          attempt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', call_id)
      .eq('org_id', org_id);
  } catch (err) {
    // ARI originate failed
    const errPayload =
      err instanceof AriRequestError
        ? { message: err.message, status: err.status, response: err.responseText }
        : { message: err instanceof Error ? err.message : String(err) };

    await updateCallStatus(call_id, org_id, 'failed', { ari_error: errPayload });
    await releaseCampaignLead(cl_id, org_id, 'failed');
    await transitionAgentState(sessionId, org_id, 'READY', { reason: 'originate_failed' });

    logger.error({ org_id, campaign_id, cl_id, call_id, err: errPayload }, 'ARI originate failed');
    return;
  }

  // 4. The AMD result arrives asynchronously via POST /telephony/calls/:id/amd_result.
  //    The agent bridging and INCALL transition happen inside processAmdResult() in index.ts.
  //    This job completes here; further call handling is event-driven.
  logger.info(
    { org_id, campaign_id, cl_id, call_id, ari_channel_id: ariChannelId, agent_id: agentId },
    'Dialer job: call originated, awaiting AMD',
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function releaseCampaignLead(
  clId: string,
  orgId: string,
  dialState: string,
): Promise<void> {
  await supabase
    .from('campaign_leads')
    .update({
      dial_state: dialState,
      updated_at: new Date().toISOString(),
    })
    .eq('cl_id', clId)
    .eq('org_id', orgId);
}

async function updateCallStatus(
  callId: string,
  orgId: string,
  status: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await supabase
    .from('calls')
    .update({
      status,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('call_id', callId)
    .eq('org_id', orgId);
}

async function resolveCallerId(orgId: string, campaignId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('phone_numbers')
    .select('e164')
    .eq('org_id', orgId)
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return data?.e164 ?? undefined;
}
