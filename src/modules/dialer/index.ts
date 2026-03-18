/**
 * Progressive Auto-Dialer – HTTP routes
 * ──────────────────────────────────────
 * All routes are mounted at /dialer (registered in src/index.ts).
 *
 * Agent state management
 * ─────────────────────
 *   POST /dialer/agents/session            – login / go-ready
 *   GET  /dialer/agents/:agent_id/session  – get current session
 *   POST /dialer/agents/:session_id/state  – transition state (ready/pause/wrap/offline)
 *
 * Campaign dialer controls
 * ─────────────────────────
 *   POST /dialer/campaigns/:campaign_id/start   – start the campaign dialer
 *   POST /dialer/campaigns/:campaign_id/stop    – stop the campaign dialer
 *   GET  /dialer/campaigns/:campaign_id/status  – queue depth + agent counts
 *   POST /dialer/campaigns/:campaign_id/leads   – bulk-add leads to campaign queue
 *
 * Call handling (dialer-driven)
 * ─────────────────────────────
 *   POST /dialer/calls/:call_id/amd_result  – Asterisk dialplan webhook
 *   POST /dialer/calls/:call_id/disposition – agent submits disposition
 *   GET  /dialer/calls/live                 – list active dialer calls for org
 *
 * Supervisor
 * ──────────
 *   GET  /dialer/supervisor/queue           – full queue snapshot
 */

import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../../core/supabase';
import { logger } from '../../core/logger';

import {
  createAgentSession,
  getAgentSession,
  transitionAgentState,
  AgentState,
} from './agentState';

import { recordAmdResult, parseAmdResult, amdDispatchAction } from './amd';
import { markDispositioned, processDialerAmdResult } from './orchestrator';

import {
  seedDialerQueue,
  drainDialerQueue,
  startDialerWorker,
  stopDialerWorker,
  getDialerQueue,
} from './engine';

// ─── Guards ──────────────────────────────────────────────────────────────────

function requireOrg(req: FastifyRequest, reply: FastifyReply): string | null {
  if (!req.org_id) {
    reply.status(401).send({ error: 'Missing org scope' });
    return null;
  }
  return req.org_id;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export const dialerModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'dialer',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));

  // ────────────────────────────────────────────────────────────────────────────
  // AGENT STATE ROUTES
  // ────────────────────────────────────────────────────────────────────────────

  app.get('/agents/self/softphone', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;
    if (!req.user_id) {
      return reply.status(401).send({ error: 'Missing user scope' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('user_id, full_name, metadata')
      .eq('user_id', req.user_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) return reply.status(500).send({ error: error.message });
    if (!user) return reply.status(404).send({ error: 'Agent not found' });

    const metadata = (user.metadata || {}) as Record<string, unknown>;
    const softphone = (metadata.softphone || {}) as Record<string, unknown>;
    return reply.send({
      agent_id: user.user_id,
      display_name: user.full_name ?? null,
      endpoint: softphone.endpoint ?? null,
      sip_uri: softphone.sip_uri ?? null,
      authorization_username: softphone.authorization_username ?? null,
      password: softphone.password ?? null,
      ws_server: softphone.ws_server ?? null,
      metadata: softphone,
    });
  });

  /** POST /dialer/agents/session – login/go-ready */
  app.post('/agents/session', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const body = (req.body || {}) as {
      agent_id?: string;
      campaign_id?: string | null;
      endpoint?: string;
      softphone?: Record<string, unknown>;
    };

    if (!body.agent_id) {
      return reply.status(400).send({ error: 'agent_id is required' });
    }

    // Verify agent belongs to org
    const { data: agent, error: agentErr } = await supabase
      .from('users')
      .select('user_id, metadata')
      .eq('user_id', body.agent_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (agentErr) return reply.status(500).send({ error: agentErr.message });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const agentMetadata = (agent.metadata || {}) as Record<string, unknown>;
    const storedSoftphone = (agentMetadata.softphone || {}) as Record<string, unknown>;
    const endpoint =
      body.endpoint ||
      (typeof body.softphone?.endpoint === 'string' ? body.softphone.endpoint : null) ||
      (typeof storedSoftphone.endpoint === 'string' ? storedSoftphone.endpoint : null);

    if (!endpoint) {
      return reply.status(400).send({ error: 'Agent endpoint is required before going READY' });
    }

    try {
      const session = await createAgentSession(
        orgId,
        body.agent_id,
        body.campaign_id ?? null,
        req.user_id || body.agent_id,
        {
          endpoint,
          softphone: {
            ...storedSoftphone,
            ...(body.softphone || {}),
            endpoint,
          },
          auto_next: true,
          wrap_until: null,
          active_call_id: null,
        },
      );
      return reply.status(201).send({ session });
    } catch (err) {
      logger.error({ err, org_id: orgId }, 'Failed to create agent session');
      return reply.status(500).send({ error: 'Failed to create session' });
    }
  });

  /** GET /dialer/agents/:agent_id/session */
  app.get('/agents/:agent_id/session', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { agent_id } = req.params as { agent_id: string };

    const session = await getAgentSession(orgId, agent_id);
    if (!session) return reply.status(404).send({ error: 'No active session found' });

    return reply.send({ session });
  });

  /** POST /dialer/agents/:session_id/state – FSM transition */
  app.post('/agents/:session_id/state', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { session_id } = req.params as { session_id: string };
    const body = (req.body || {}) as { state?: string; reason?: string };

    if (!body.state) {
      return reply.status(400).send({ error: 'state is required' });
    }

    const ALLOWED: AgentState[] = ['OFFLINE', 'READY', 'PAUSED', 'WRAP'];
    if (!ALLOWED.includes(body.state as AgentState)) {
      return reply.status(400).send({
        error: `state must be one of: ${ALLOWED.join(', ')}`,
      });
    }

    try {
      const session = await transitionAgentState(
        session_id,
        orgId,
        body.state as AgentState,
        { reason: body.reason, updatedBy: req.user_id ?? 'system' },
      );
      return reply.send({ session });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'State transition failed';
      return reply.status(409).send({ error: msg });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CAMPAIGN DIALER CONTROLS
  // ────────────────────────────────────────────────────────────────────────────

  /** POST /dialer/campaigns/:campaign_id/start */
  app.post('/campaigns/:campaign_id/start', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id } = req.params as { campaign_id: string };

    // Scope check
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('campaign_id, status')
      .eq('campaign_id', campaign_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (campErr) return reply.status(500).send({ error: campErr.message });
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });

    // Start worker and seed queue
    startDialerWorker(orgId, campaign_id);
    const enqueued = await seedDialerQueue(orgId, campaign_id, 100);

    // Mark campaign active
    await supabase
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('campaign_id', campaign_id)
      .eq('org_id', orgId);

    logger.info({ org_id: orgId, campaign_id, enqueued }, 'Campaign dialer started');

    return reply.send({ success: true, campaign_id, enqueued });
  });

  /** POST /dialer/campaigns/:campaign_id/stop */
  app.post('/campaigns/:campaign_id/stop', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id } = req.params as { campaign_id: string };

    await drainDialerQueue(orgId, campaign_id);
    await stopDialerWorker(orgId, campaign_id);

    await supabase
      .from('campaigns')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('campaign_id', campaign_id)
      .eq('org_id', orgId);

    logger.info({ org_id: orgId, campaign_id }, 'Campaign dialer stopped');

    return reply.send({ success: true, campaign_id });
  });

  /** GET /dialer/campaigns/:campaign_id/status */
  app.get('/campaigns/:campaign_id/status', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id } = req.params as { campaign_id: string };

    const queue = getDialerQueue(orgId, campaign_id);

    const [waiting, active, failed, completed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getCompletedCount(),
    ]);

    // Agent counts
    const { count: readyCount } = await supabase
      .from('agent_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('campaign_id', campaign_id)
      .eq('state', 'READY')
      .is('ended_at', null);

    const { count: incallCount } = await supabase
      .from('agent_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('campaign_id', campaign_id)
      .eq('state', 'INCALL')
      .is('ended_at', null);

    // Leads remaining
    const { count: pendingLeads } = await supabase
      .from('campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('campaign_id', campaign_id)
      .in('dial_state', ['pending', 'callback']);

    return reply.send({
      campaign_id,
      queue: { waiting, active, failed, completed },
      agents: { ready: readyCount ?? 0, incall: incallCount ?? 0 },
      leads: { pending: pendingLeads ?? 0 },
    });
  });

  /**
   * POST /dialer/campaigns/:campaign_id/leads
   * Bulk-add leads to a campaign queue.
   * Body: { leads: [{ lead_id, contact_id?, phone, priority? }] }
   */
  app.post('/campaigns/:campaign_id/leads', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id } = req.params as { campaign_id: string };

    const body = (req.body || {}) as {
      leads?: Array<{
        lead_id?: string;
        contact_id?: string | null;
        phone?: string;
        priority?: number;
        max_attempts?: number;
      }>;
    };

    if (!Array.isArray(body.leads) || body.leads.length === 0) {
      return reply.status(400).send({ error: 'leads array is required and cannot be empty' });
    }

    if (body.leads.length > 1000) {
      return reply.status(400).send({ error: 'Maximum 1000 leads per request' });
    }

    // Scope check
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('campaign_id')
      .eq('campaign_id', campaign_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });

    const rows = body.leads
      .filter((l) => l.lead_id && l.phone)
      .map((l) => ({
        cl_id: crypto.randomUUID(),
        org_id: orgId,
        campaign_id,
        lead_id: l.lead_id!,
        contact_id: l.contact_id ?? null,
        phone: l.phone!,
        priority: l.priority ?? 0,
        max_attempts: l.max_attempts ?? 3,
        dial_state: 'pending',
        created_by: req.user_id ?? 'api',
        updated_by: req.user_id ?? 'api',
      }));

    const { error } = await supabase
      .from('campaign_leads')
      .upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });

    if (error) return reply.status(500).send({ error: error.message });

    return reply.status(201).send({ success: true, inserted: rows.length });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CALL HANDLING
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /dialer/calls/:call_id/amd_result
   * Called by Asterisk dialplan via CURL() after AMD() completes.
   * The dialplan variable DIALER_BACKEND_URL is set during origination.
   *
   * Expected body: { org_id, result, cause?, duration_ms? }
   * Alternatively as query params for simple CURL() dialplan calls.
   */
  app.post('/calls/:call_id/amd_result', async (req, reply) => {
    // AMD webhooks come from Asterisk, not a browser; accept org_id from body or header
    const body = (req.body || {}) as {
      org_id?: string;
      result?: string;
      cause?: string;
      duration_ms?: number;
    };
    const query = req.query as {
      org_id?: string;
      result?: string;
      cause?: string;
      duration_ms?: string;
    };

    const orgId = body.org_id ?? query.org_id ?? req.org_id;
    const rawResult = body.result ?? query.result ?? '';
    const cause = body.cause ?? query.cause;
    const durationMs = body.duration_ms ?? (query.duration_ms ? Number(query.duration_ms) : undefined);

    if (!orgId) return reply.status(400).send({ error: 'org_id is required' });

    const { call_id } = req.params as { call_id: string };
    const amdResult = parseAmdResult(rawResult);

    try {
      await recordAmdResult({ call_id, org_id: orgId, result: amdResult, cause, duration_ms: durationMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AMD result error';
      return reply.status(500).send({ error: msg });
    }

    const action = amdDispatchAction(amdResult);

    try {
      await processDialerAmdResult(call_id, orgId, amdResult, cause, durationMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dialer orchestration error';
      logger.error({ err, org_id: orgId, call_id }, 'Failed processing AMD result');
      return reply.status(500).send({ error: msg });
    }

    return reply.send({ success: true, action, amd_result: amdResult });
  });

  /**
   * POST /dialer/calls/:call_id/disposition
   * Agent submits call outcome after WRAP.
   */
  app.post('/calls/:call_id/disposition', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { call_id } = req.params as { call_id: string };
    const body = (req.body || {}) as {
      outcome?: string;
      notes?: string;
      callback_at?: string;
      duration_wrap?: number;
      session_id?: string;
    };

    if (!body.outcome) {
      return reply.status(400).send({ error: 'outcome is required' });
    }

    const VALID_OUTCOMES = [
      'ANSWERED_HUMAN','ANSWERED_MACHINE','NO_ANSWER','BUSY','FAILED',
      'DNC','CALLBACK','SALE','NOT_INTERESTED','WRONG_NUMBER','OTHER',
    ];
    if (!VALID_OUTCOMES.includes(body.outcome)) {
      return reply.status(400).send({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` });
    }

    // Fetch call (org-scoped)
    const { data: call, error: callErr } = await supabase
      .from('calls')
      .select('call_id, org_id, campaign_id, cl_id, metadata')
      .eq('call_id', call_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (callErr) return reply.status(500).send({ error: callErr.message });
    if (!call) return reply.status(404).send({ error: 'Call not found' });

    const metadata = (call.metadata || {}) as Record<string, unknown>;
    const clId = call.cl_id ?? (typeof metadata.cl_id === 'string' ? metadata.cl_id : null);

    const disposition_id = crypto.randomUUID();
    const { error: dispErr } = await supabase.from('dispositions').insert({
      disposition_id,
      org_id: orgId,
      call_id,
      cl_id: clId,
      agent_id: req.user_id ?? null,
      outcome: body.outcome,
      notes: body.notes ?? null,
      callback_at: body.callback_at ?? null,
      duration_wrap: body.duration_wrap ?? null,
      created_by: req.user_id ?? 'system',
      updated_by: req.user_id ?? 'system',
    });

    if (dispErr) return reply.status(500).send({ error: dispErr.message });

    // Update campaign_lead dial_state
    if (clId) {
      const leadDialState =
        body.outcome === 'CALLBACK' ? 'callback' :
        body.outcome === 'DNC' ? 'dnc' :
        ['SALE','ANSWERED_HUMAN','NOT_INTERESTED','WRONG_NUMBER'].includes(body.outcome)
          ? 'disposed' : 'disposed';

      await supabase
        .from('campaign_leads')
        .update({
          dial_state: leadDialState,
          callback_at: body.outcome === 'CALLBACK' ? body.callback_at ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq('cl_id', clId)
        .eq('org_id', orgId);
    }

    await markDispositioned(call_id, orgId);

    // Transition agent WRAP → READY if session_id provided
    if (body.session_id) {
      await transitionAgentState(body.session_id, orgId, 'READY', {
        reason: 'disposition_submitted',
        updatedBy: req.user_id ?? 'system',
      }).catch(() => undefined);
    }

    return reply.status(201).send({ disposition_id, success: true });
  });

  /** GET /dialer/calls/live – active dialer calls for org */
  app.get('/calls/live', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id, limit } = req.query as { campaign_id?: string; limit?: string };
    const safeLimit = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);

    let query = supabase
      .from('calls')
      .select('call_id, org_id, campaign_id, contact_id, lead_id, assigned_agent, status, started_at, metadata')
      .eq('org_id', orgId)
      .in('status', ['QUEUED', 'DIALING_LEAD', 'ANSWERED', 'AMD_HUMAN', 'AMD_MACHINE', 'BRIDGED', 'dialing', 'originated', 'bridged', 'answering'])
      .order('started_at', { ascending: false })
      .limit(safeLimit);

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send(data ?? []);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SUPERVISOR
  // ────────────────────────────────────────────────────────────────────────────

  /** GET /dialer/supervisor/queue */
  app.get('/supervisor/queue', async (req, reply) => {
    const orgId = requireOrg(req, reply);
    if (!orgId) return;

    const { campaign_id } = req.query as { campaign_id?: string };

    // Active agent sessions
    let sessionsQuery = supabase
      .from('agent_sessions')
      .select('session_id, agent_id, campaign_id, state, last_state_at')
      .eq('org_id', orgId)
      .is('ended_at', null);

    if (campaign_id) sessionsQuery = sessionsQuery.eq('campaign_id', campaign_id);

    // Live calls
    let callsQuery = supabase
      .from('calls')
      .select('call_id, campaign_id, contact_id, lead_id, assigned_agent, status, started_at')
      .eq('org_id', orgId)
      .in('status', ['QUEUED', 'DIALING_LEAD', 'ANSWERED', 'AMD_HUMAN', 'AMD_MACHINE', 'BRIDGED', 'dialing', 'originated', 'bridged']);

    if (campaign_id) callsQuery = callsQuery.eq('campaign_id', campaign_id);

    const [sessionsResult, callsResult] = await Promise.all([sessionsQuery, callsQuery]);

    return reply.send({
      agents: sessionsResult.data ?? [],
      live_calls: callsResult.data ?? [],
    });
  });
};
