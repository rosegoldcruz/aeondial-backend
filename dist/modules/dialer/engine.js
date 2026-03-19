"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDialerQueue = getDialerQueue;
exports.seedDialerQueue = seedDialerQueue;
exports.drainDialerQueue = drainDialerQueue;
exports.startDialerWorker = startDialerWorker;
exports.stopDialerWorker = stopDialerWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../core/redis");
const supabase_1 = require("../../core/supabase");
const ari_1 = require("../../core/ari");
const websocket_1 = require("../../core/websocket");
const logger_1 = require("../../core/logger");
const agentState_1 = require("./agentState");
const orchestrator_1 = require("./orchestrator");
const callState_1 = require("./callState");
// ── Queue factory ─────────────────────────────────────────────────────────────
const dialerQueues = new Map();
function queueName(orgId, campaignId) {
    return `dialer__${orgId}__${campaignId}`;
}
function getDialerQueue(orgId, campaignId) {
    const name = queueName(orgId, campaignId);
    if (!dialerQueues.has(name)) {
        dialerQueues.set(name, new bullmq_1.Queue(name, { connection: redis_1.bullConnection }));
    }
    return dialerQueues.get(name);
}
/**
 * Add the next batch of leads to the dialer queue.
 * Called when a campaign starts or when the queue drains below a threshold.
 * Returns how many leads were enqueued.
 */
async function seedDialerQueue(orgId, campaignId, batchSize = 50) {
    const { data: leads, error } = await supabase_1.supabase
        .from('v_dialer_queue')
        .select('cl_id, lead_id, contact_id, phone, priority')
        .eq('org_id', orgId)
        .eq('campaign_id', campaignId)
        .limit(batchSize);
    if (error) {
        logger_1.logger.error({ error, org_id: orgId, campaign_id: campaignId }, 'Failed to seed dialer queue');
        return 0;
    }
    if (!leads || leads.length === 0)
        return 0;
    const queue = getDialerQueue(orgId, campaignId);
    let enqueued = 0;
    for (const lead of leads) {
        // Mark lead as 'dialing' to prevent double-dial
        const { error: updateErr } = await supabase_1.supabase
            .from('campaign_leads')
            .update({ dial_state: 'dialing', updated_at: new Date().toISOString() })
            .eq('cl_id', lead.cl_id)
            .eq('org_id', orgId)
            .eq('dial_state', 'pending'); // Only if still pending (idempotent guard)
        if (updateErr)
            continue;
        // Create a placeholder call row
        const callId = crypto.randomUUID();
        await supabase_1.supabase.from('calls').insert({
            call_id: callId,
            org_id: orgId,
            campaign_id: campaignId,
            contact_id: lead.contact_id,
            lead_id: lead.lead_id,
            cl_id: lead.cl_id,
            direction: 'outbound',
            status: 'QUEUED',
            created_by: 'dialer',
            updated_by: 'dialer',
        });
        await queue.add('dial', {
            org_id: orgId,
            campaign_id: campaignId,
            cl_id: lead.cl_id,
            lead_id: lead.lead_id,
            contact_id: lead.contact_id,
            phone: lead.phone,
            session_id: '', // filled at dispatch time
            call_id: callId,
            attempt: 1,
        }, {
            attempts: 1, // handled at application level; do not auto-retry
            removeOnComplete: { age: 60 * 60 * 24 }, // keep 24h
            removeOnFail: { age: 60 * 60 * 24 * 7 },
            priority: lead.priority ?? 0,
        });
        enqueued++;
    }
    logger_1.logger.info({ org_id: orgId, campaign_id: campaignId, enqueued }, 'Dialer queue seeded');
    return enqueued;
}
/**
 * Drain (cancel) all pending jobs for a campaign.
 */
async function drainDialerQueue(orgId, campaignId) {
    const queue = getDialerQueue(orgId, campaignId);
    await queue.drain();
    // Return any 'dialing' leads back to 'pending' so they can be re-queued after restart
    await supabase_1.supabase
        .from('campaign_leads')
        .update({ dial_state: 'pending', updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('campaign_id', campaignId)
        .eq('dial_state', 'dialing');
    logger_1.logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer queue drained');
}
// ── Worker process ─────────────────────────────────────────────────────────────
const activeWorkers = new Map();
function startDialerWorker(orgId, campaignId) {
    const name = queueName(orgId, campaignId);
    if (activeWorkers.has(name))
        return; // already running
    const worker = new bullmq_1.Worker(name, async (job) => processDialerJob(job), {
        connection: redis_1.bullConnection,
        concurrency: 10, // max parallel dials per worker instance
        limiter: {
            max: Number(process.env.DIALER_CPS ?? 5),
            duration: 1000, // per second
        },
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ queue: name, jobId: job?.id, err }, 'Dialer job failed');
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
    logger_1.logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer worker started');
}
async function stopDialerWorker(orgId, campaignId) {
    const name = queueName(orgId, campaignId);
    const worker = activeWorkers.get(name);
    if (!worker)
        return;
    await worker.close();
    activeWorkers.delete(name);
    logger_1.logger.info({ org_id: orgId, campaign_id: campaignId }, 'Dialer worker stopped');
}
// ── Job processor ─────────────────────────────────────────────────────────────
async function processDialerJob(job) {
    const { org_id, campaign_id, cl_id, lead_id, contact_id, phone, call_id, attempt } = job.data;
    logger_1.logger.info({ org_id, campaign_id, cl_id, call_id, attempt }, 'Dialer job started');
    // 1. Reserve an available agent
    const session = await (0, agentState_1.reserveNextAgent)(org_id, campaign_id);
    if (!session) {
        // No agent available: return lead to pending and emit queue metric
        await releaseCampaignLead(cl_id, org_id, 'pending');
        const abandonedCall = await (0, callState_1.getDialerCall)(call_id, org_id);
        if (abandonedCall) {
            await (0, callState_1.transitionDialerCallState)(abandonedCall, 'ABANDONED', {
                eventType: 'queue.lead_abandoned',
                metadataPatch: { abandon_reason: 'no_agent' },
                eventPayload: { reason: 'no_agent' },
            }).catch(() => undefined);
        }
        (0, websocket_1.emitOrgEvent)({
            type: 'queue.lead_abandoned',
            org_id,
            campaign_id,
            payload: { call_id, cl_id, reason: 'no_agent_available', attempt },
        });
        logger_1.logger.warn({ org_id, campaign_id, cl_id }, 'No ready agent; lead returned to queue');
        return;
    }
    const sessionId = session.session_id;
    const agentId = session.agent_id;
    // Emit lead-dialing event
    (0, websocket_1.emitOrgEvent)({
        type: 'queue.lead_dialing',
        org_id,
        campaign_id,
        payload: { call_id, cl_id, phone, agent_id: agentId, session_id: sessionId, attempt },
    });
    // 2. Resolve outbound endpoint
    const endpoint = (0, orchestrator_1.resolveOutboundEndpoint)(phone);
    const leadSnapshot = await resolveLeadSnapshot(org_id, contact_id, lead_id);
    // Update call row with assigned agent
    const queuedCall = await (0, callState_1.getDialerCall)(call_id, org_id);
    if (!queuedCall) {
        await releaseCampaignLead(cl_id, org_id, 'pending');
        await (0, agentState_1.transitionAgentState)(sessionId, org_id, 'READY', { reason: 'call_missing' });
        return;
    }
    await (0, callState_1.transitionDialerCallState)(queuedCall, 'DIALING_LEAD', {
        eventType: 'queue.lead_dialing',
        metadataPatch: (0, orchestrator_1.buildDialerCallMetadata)({
            session_id: sessionId,
            agent_id: agentId,
            endpoint,
            attempt,
            cl_id,
            phone,
            lead_name: leadSnapshot.lead_name,
            contact_name: leadSnapshot.contact_name,
        }),
        extraUpdates: {
            assigned_agent: agentId,
        },
        eventPayload: {
            phone,
            agent_id: agentId,
            session_id: sessionId,
            attempt,
            cl_id,
        },
    });
    // Update campaign_lead attempts and last_called_at
    await supabase_1.supabase
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
    let ariChannelId;
    try {
        const ariChannel = await ari_1.ARI.channels.originate({
            debugContext: 'dialer.lead',
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
                DIALER_BACKEND_URL: process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000',
                AMD_ENABLED: '1',
                DIALER_CHANNEL_ROLE: 'lead',
            },
        });
        ariChannelId =
            ariChannel && typeof ariChannel === 'object' && 'id' in ariChannel && ariChannel.id
                ? ariChannel.id
                : call_id;
        const dialingCall = await (0, callState_1.getDialerCall)(call_id, org_id);
        if (dialingCall) {
            await (0, callState_1.transitionDialerCallState)(dialingCall, 'DIALING_LEAD', {
                allowSameState: true,
                eventType: 'lead.originated',
                metadataPatch: {
                    lead_channel_id: ariChannelId,
                    ari_channel_id: ariChannelId,
                },
                eventPayload: {
                    ari_channel_id: ariChannelId,
                    endpoint,
                },
            });
        }
    }
    catch (err) {
        // ARI originate failed
        const errPayload = err instanceof ari_1.AriRequestError
            ? { message: err.message, status: err.status, response: err.responseText }
            : { message: err instanceof Error ? err.message : String(err) };
        const currentCall = await (0, callState_1.getDialerCall)(call_id, org_id);
        if (currentCall) {
            await (0, callState_1.transitionDialerCallState)(currentCall, 'FAILED', {
                eventType: 'lead.originate_failed',
                metadataPatch: { ari_error: errPayload },
                eventPayload: { ari_error: errPayload },
            }).catch(() => undefined);
        }
        await releaseCampaignLead(cl_id, org_id, 'failed');
        await (0, agentState_1.transitionAgentState)(sessionId, org_id, 'READY', { reason: 'originate_failed' });
        logger_1.logger.error({ org_id, campaign_id, cl_id, call_id, err: errPayload }, 'ARI originate failed');
        return;
    }
    // 4. The lead channel now waits in Stasis. The ARI event loop will continue the
    //    answered lead into dialplan AMD, then drive beep/bridge/wrap from there.
    //    This job completes here; further call handling is event-driven.
    logger_1.logger.info({ org_id, campaign_id, cl_id, call_id, ari_channel_id: ariChannelId, agent_id: agentId }, 'Dialer job: call originated, awaiting AMD');
}
// ── Helpers ───────────────────────────────────────────────────────────────────
async function releaseCampaignLead(clId, orgId, dialState) {
    await supabase_1.supabase
        .from('campaign_leads')
        .update({
        dial_state: dialState,
        updated_at: new Date().toISOString(),
    })
        .eq('cl_id', clId)
        .eq('org_id', orgId);
}
async function resolveCallerId(orgId, campaignId) {
    const { data } = await supabase_1.supabase
        .from('phone_numbers')
        .select('e164')
        .eq('org_id', orgId)
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    return data?.e164 ?? undefined;
}
async function resolveLeadSnapshot(orgId, contactId, leadId) {
    let contactName = null;
    if (contactId) {
        const { data: contact } = await supabase_1.supabase
            .from('contacts')
            .select('first_name, last_name')
            .eq('contact_id', contactId)
            .eq('org_id', orgId)
            .maybeSingle();
        contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || null;
    }
    const { data: lead } = await supabase_1.supabase
        .from('leads')
        .select('metadata')
        .eq('lead_id', leadId)
        .eq('org_id', orgId)
        .maybeSingle();
    const leadMeta = (lead?.metadata || {});
    const leadNameValue = leadMeta.lead_name ?? leadMeta.name;
    const leadName = typeof leadNameValue === 'string' && leadNameValue.trim() ? leadNameValue : null;
    return {
        lead_name: leadName,
        contact_name: contactName,
    };
}
