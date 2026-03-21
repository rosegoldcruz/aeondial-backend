"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.dialerModule = void 0;
const supabase_1 = require("../../core/supabase");
const logger_1 = require("../../core/logger");
const config_1 = require("../../core/config");
const ari_1 = require("../../core/ari");
const agentState_1 = require("./agentState");
const amd_1 = require("./amd");
const orchestrator_1 = require("./orchestrator");
const engine_1 = require("./engine");
// ─── Guards ──────────────────────────────────────────────────────────────────
function requireOrg(req, reply) {
    if (!req.org_id) {
        reply.status(401).send({ error: 'Missing org scope' });
        return null;
    }
    return req.org_id;
}
function normalizeAgentEndpoint(endpoint) {
    const trimmed = endpoint.trim();
    if (!trimmed)
        return trimmed;
    if (trimmed.includes('/'))
        return trimmed;
    return `${config_1.config.ariEndpointPrefix}/${trimmed}`;
}
function parseUrlEncodedBody(payload) {
    return Object.fromEntries(new URLSearchParams(payload).entries());
}
function firstString(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const nested = firstString(...value);
            if (nested)
                return nested;
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed)
                return trimmed;
        }
    }
    return undefined;
}
function firstNumber(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const nested = firstNumber(...value);
            if (nested !== undefined)
                return nested;
            continue;
        }
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            if (Number.isFinite(parsed))
                return parsed;
        }
    }
    return undefined;
}
function coerceRequestBody(body) {
    if (!body)
        return {};
    if (typeof body === 'object')
        return body;
    if (typeof body !== 'string')
        return {};
    const trimmed = body.trim();
    if (!trimmed)
        return {};
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    }
    catch {
        // Fall back to URL-encoded parsing for plain-text dialplan callbacks.
    }
    return parseUrlEncodedBody(trimmed);
}
function normalizeAmdCallbackPayload(req) {
    const params = (req.params || {});
    const query = (req.query || {});
    const body = coerceRequestBody(req.body);
    return {
        callId: firstString(params.call_id, params.id, body.call_id, body.callId, query.call_id, query.callId),
        orgId: firstString(body.org_id, body.orgId, query.org_id, query.orgId, req.org_id),
        amdStatus: firstString(body.AMDSTATUS, body.result, body.status, query.AMDSTATUS, query.result, query.status),
        amdCause: firstString(body.AMDCAUSE, body.cause, query.AMDCAUSE, query.cause),
        durationMs: firstNumber(body.duration_ms, body.durationMs, query.duration_ms, query.durationMs),
        body,
        query,
        params,
    };
}
// ─── Plugin ──────────────────────────────────────────────────────────────────
const dialerModule = async (app) => {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, payload, done) => {
        try {
            const rawPayload = typeof payload === 'string' ? payload : payload.toString('utf8');
            done(null, parseUrlEncodedBody(rawPayload));
        }
        catch (error) {
            done(error);
        }
    });
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
        if (!orgId)
            return;
        if (!req.user_id) {
            return reply.status(401).send({ error: 'Missing user scope' });
        }
        const headerEmail = req.headers['x-user-email'];
        const headerName = req.headers['x-user-name'];
        const headerEndpoint = req.headers['x-softphone-endpoint'];
        const headerTransport = req.headers['x-softphone-transport'];
        const headerHost = req.headers['x-softphone-host'];
        const desiredSoftphone = {
            endpoint: typeof headerEndpoint === 'string' && headerEndpoint.trim()
                ? headerEndpoint.trim()
                : config_1.config.dialerDefaultAgentEndpoint || null,
            transport: typeof headerTransport === 'string' && headerTransport.trim()
                ? headerTransport.trim()
                : config_1.config.dialerDefaultAgentTransport,
            host: typeof headerHost === 'string' && headerHost.trim()
                ? headerHost.trim()
                : config_1.config.dialerDefaultAgentHost || null,
        };
        let { data: user, error } = await supabase_1.supabase
            .from('users')
            .select('user_id, full_name, metadata')
            .eq('user_id', req.user_id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (error)
            return reply.status(500).send({ error: error.message });
        if (!user) {
            const bootstrapEmail = typeof headerEmail === 'string' && headerEmail.trim()
                ? headerEmail.trim().toLowerCase()
                : `${req.user_id}@clerk.local`;
            const bootstrapName = typeof headerName === 'string' && headerName.trim()
                ? headerName.trim()
                : null;
            const { data: seededUser, error: seedError } = await supabase_1.supabase
                .from('users')
                .upsert({
                user_id: req.user_id,
                org_id: orgId,
                email: bootstrapEmail,
                full_name: bootstrapName,
                role: 'agent',
                status: 'active',
                metadata: {
                    softphone: desiredSoftphone,
                    identity_provider: 'clerk',
                },
                created_by: req.user_id,
                updated_by: req.user_id,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
                .select('user_id, full_name, metadata')
                .maybeSingle();
            if (seedError) {
                logger_1.logger.error({ err: seedError, org_id: orgId, user_id: req.user_id }, 'Failed to bootstrap Clerk-linked user');
            }
            user = seededUser || null;
        }
        if (!user) {
            const fallbackEndpoint = config_1.config.dialerDefaultAgentEndpoint || null;
            return reply.send({
                agent_id: req.user_id,
                display_name: null,
                endpoint: fallbackEndpoint,
                sip_uri: null,
                authorization_username: null,
                password: null,
                ws_server: null,
                metadata: fallbackEndpoint
                    ? {
                        endpoint: fallbackEndpoint,
                        transport: config_1.config.dialerDefaultAgentTransport,
                        host: config_1.config.dialerDefaultAgentHost || null,
                    }
                    : {},
            });
        }
        let metadata = (user.metadata || {});
        const currentSoftphone = (metadata.softphone || {});
        const currentEndpoint = typeof currentSoftphone.endpoint === 'string' ? currentSoftphone.endpoint.trim() : '';
        if (!currentEndpoint && desiredSoftphone.endpoint) {
            const mergedMetadata = {
                ...metadata,
                softphone: {
                    ...currentSoftphone,
                    endpoint: desiredSoftphone.endpoint,
                    transport: currentSoftphone.transport || desiredSoftphone.transport,
                    host: currentSoftphone.host || desiredSoftphone.host,
                },
            };
            const { data: updatedUser, error: updateError } = await supabase_1.supabase
                .from('users')
                .update({
                metadata: mergedMetadata,
                updated_by: req.user_id,
                updated_at: new Date().toISOString(),
            })
                .eq('user_id', req.user_id)
                .eq('org_id', orgId)
                .select('user_id, full_name, metadata')
                .maybeSingle();
            if (!updateError && updatedUser) {
                user = updatedUser;
                metadata = (updatedUser.metadata || {});
            }
        }
        const softphone = (metadata.softphone || {});
        const fallbackEndpoint = (typeof softphone.endpoint === 'string' && softphone.endpoint.trim()) ? softphone.endpoint : config_1.config.dialerDefaultAgentEndpoint || null;
        let registrationStatus = 'unknown';
        let registrationSource = 'none';
        let registrationReason = 'missing_endpoint';
        if (fallbackEndpoint) {
            const normalized = normalizeAgentEndpoint(fallbackEndpoint);
            const [technology, ...resourceParts] = normalized.split('/');
            const resource = resourceParts.join('/');
            if (technology && resource && config_1.config.ariUrl && config_1.config.ariUsername && config_1.config.ariPassword && config_1.config.ariApp) {
                try {
                    const endpoint = await ari_1.ARI.endpoints.get(technology, resource);
                    const state = String(endpoint?.state || '').toLowerCase();
                    registrationSource = 'ari';
                    registrationReason = state || 'unknown_state';
                    registrationStatus = state === 'online' ? 'registered' : state === 'offline' ? 'unregistered' : 'unknown';
                }
                catch (error) {
                    registrationReason =
                        error instanceof ari_1.AriRequestError ? `ari_http_${error.status}` : 'ari_query_failed';
                    logger_1.logger.warn({ error, org_id: orgId, user_id: req.user_id, endpoint: normalized }, 'Failed to verify endpoint registration from ARI');
                }
            }
            else {
                registrationReason = 'ari_not_configured';
            }
        }
        return reply.send({
            agent_id: user.user_id,
            display_name: user.full_name ?? null,
            endpoint: fallbackEndpoint,
            sip_uri: softphone.sip_uri ?? null,
            authorization_username: softphone.authorization_username ?? null,
            password: softphone.password ?? null,
            ws_server: softphone.ws_server ?? null,
            registration_status: registrationStatus,
            registration_source: registrationSource,
            registration_reason: registrationReason,
            metadata: {
                ...(softphone || {}),
                registration_status: registrationStatus,
                registration_source: registrationSource,
                registration_reason: registrationReason,
                ...(fallbackEndpoint && !softphone.endpoint
                    ? {
                        endpoint: fallbackEndpoint,
                        transport: config_1.config.dialerDefaultAgentTransport,
                        host: config_1.config.dialerDefaultAgentHost || null,
                    }
                    : {}),
            },
        });
    });
    /** POST /dialer/agents/session – login/go-ready */
    app.post('/agents/session', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const body = (req.body || {});
        if (!body.agent_id) {
            return reply.status(400).send({ error: 'agent_id is required' });
        }
        // Verify agent belongs to org
        const { data: agent, error: agentErr } = await supabase_1.supabase
            .from('users')
            .select('user_id, metadata')
            .eq('user_id', body.agent_id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (agentErr)
            return reply.status(500).send({ error: agentErr.message });
        if (!agent)
            return reply.status(404).send({ error: 'Agent not found' });
        const agentMetadata = (agent.metadata || {});
        const storedSoftphone = (agentMetadata.softphone || {});
        const rawEndpoint = body.endpoint ||
            (typeof body.softphone?.endpoint === 'string' ? body.softphone.endpoint : null) ||
            (typeof storedSoftphone.endpoint === 'string' ? storedSoftphone.endpoint : null);
        if (!rawEndpoint) {
            return reply.status(400).send({ error: 'Agent endpoint is required before going READY' });
        }
        const endpoint = normalizeAgentEndpoint(rawEndpoint);
        try {
            const session = await (0, agentState_1.createAgentSession)(orgId, body.agent_id, body.campaign_id ?? null, req.user_id || body.agent_id, {
                endpoint,
                softphone: {
                    ...storedSoftphone,
                    ...(body.softphone || {}),
                    endpoint,
                },
                auto_next: true,
                wrap_until: null,
                active_call_id: null,
            });
            return reply.status(201).send({ session });
        }
        catch (err) {
            logger_1.logger.error({ err, org_id: orgId }, 'Failed to create agent session');
            return reply.status(500).send({ error: 'Failed to create session' });
        }
    });
    /** GET /dialer/agents/:agent_id/session */
    app.get('/agents/:agent_id/session', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { agent_id } = req.params;
        const session = await (0, agentState_1.getAgentSession)(orgId, agent_id);
        if (!session)
            return reply.status(404).send({ error: 'No active session found' });
        return reply.send({ session });
    });
    /** POST /dialer/agents/:session_id/state – FSM transition */
    app.post('/agents/:session_id/state', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { session_id } = req.params;
        const body = (req.body || {});
        if (!body.state) {
            return reply.status(400).send({ error: 'state is required' });
        }
        const ALLOWED = ['OFFLINE', 'READY', 'PAUSED', 'WRAP'];
        if (!ALLOWED.includes(body.state)) {
            return reply.status(400).send({
                error: `state must be one of: ${ALLOWED.join(', ')}`,
            });
        }
        try {
            const session = await (0, agentState_1.transitionAgentState)(session_id, orgId, body.state, { reason: body.reason, updatedBy: req.user_id ?? 'system' });
            return reply.send({ session });
        }
        catch (err) {
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
        if (!orgId)
            return;
        const { campaign_id } = req.params;
        // Scope check
        const { data: campaign, error: campErr } = await supabase_1.supabase
            .from('campaigns')
            .select('campaign_id, status')
            .eq('campaign_id', campaign_id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (campErr)
            return reply.status(500).send({ error: campErr.message });
        if (!campaign)
            return reply.status(404).send({ error: 'Campaign not found' });
        // Start worker and seed queue
        (0, engine_1.startDialerWorker)(orgId, campaign_id);
        const enqueued = await (0, engine_1.seedDialerQueue)(orgId, campaign_id, 100);
        // Mark campaign active
        await supabase_1.supabase
            .from('campaigns')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('campaign_id', campaign_id)
            .eq('org_id', orgId);
        logger_1.logger.info({ org_id: orgId, campaign_id, enqueued }, 'Campaign dialer started');
        return reply.send({ success: true, campaign_id, enqueued });
    });
    /** POST /dialer/campaigns/:campaign_id/stop */
    app.post('/campaigns/:campaign_id/stop', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { campaign_id } = req.params;
        await (0, engine_1.drainDialerQueue)(orgId, campaign_id);
        await (0, engine_1.stopDialerWorker)(orgId, campaign_id);
        await supabase_1.supabase
            .from('campaigns')
            .update({ status: 'paused', updated_at: new Date().toISOString() })
            .eq('campaign_id', campaign_id)
            .eq('org_id', orgId);
        logger_1.logger.info({ org_id: orgId, campaign_id }, 'Campaign dialer stopped');
        return reply.send({ success: true, campaign_id });
    });
    /** GET /dialer/campaigns/:campaign_id/status */
    app.get('/campaigns/:campaign_id/status', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { campaign_id } = req.params;
        const queue = (0, engine_1.getDialerQueue)(orgId, campaign_id);
        const [waiting, active, failed, completed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getFailedCount(),
            queue.getCompletedCount(),
        ]);
        // Agent counts
        const { count: readyCount } = await supabase_1.supabase
            .from('agent_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('campaign_id', campaign_id)
            .eq('state', 'READY')
            .is('ended_at', null);
        const { count: incallCount } = await supabase_1.supabase
            .from('agent_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('campaign_id', campaign_id)
            .eq('state', 'INCALL')
            .is('ended_at', null);
        // Leads remaining
        const { count: pendingLeads } = await supabase_1.supabase
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
        if (!orgId)
            return;
        const { campaign_id } = req.params;
        const body = (req.body || {});
        if (!Array.isArray(body.leads) || body.leads.length === 0) {
            return reply.status(400).send({ error: 'leads array is required and cannot be empty' });
        }
        if (body.leads.length > 1000) {
            return reply.status(400).send({ error: 'Maximum 1000 leads per request' });
        }
        // Scope check
        const { data: campaign } = await supabase_1.supabase
            .from('campaigns')
            .select('campaign_id')
            .eq('campaign_id', campaign_id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (!campaign)
            return reply.status(404).send({ error: 'Campaign not found' });
        const rows = body.leads
            .filter((l) => l.lead_id && l.phone)
            .map((l) => ({
            cl_id: crypto.randomUUID(),
            org_id: orgId,
            campaign_id,
            lead_id: l.lead_id,
            contact_id: l.contact_id ?? null,
            phone: l.phone,
            priority: l.priority ?? 0,
            max_attempts: l.max_attempts ?? 3,
            dial_state: 'pending',
            created_by: req.user_id ?? 'api',
            updated_by: req.user_id ?? 'api',
        }));
        const { error } = await supabase_1.supabase
            .from('campaign_leads')
            .upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });
        if (error)
            return reply.status(500).send({ error: error.message });
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
     * Accepts:
     *   - application/json
     *   - application/x-www-form-urlencoded
     *   - query params when the request body is empty
     *
     * Normalized fields: { call_id, org_id, result|AMDSTATUS, cause|AMDCAUSE, duration_ms? }
     */
    app.post('/calls/:call_id/amd_result', async (req, reply) => {
        const normalized = normalizeAmdCallbackPayload(req);
        const orgId = normalized.orgId;
        const callId = normalized.callId;
        const rawResult = normalized.amdStatus ?? '';
        const cause = normalized.amdCause;
        const durationMs = normalized.durationMs;
        if (!orgId)
            return reply.status(400).send({ error: 'org_id is required' });
        if (!callId)
            return reply.status(400).send({ error: 'call_id is required' });
        const amdResult = (0, amd_1.parseAmdResult)(rawResult);
        logger_1.logger.info({
            route: 'dialer.calls.amd_result',
            content_type: req.headers['content-type'],
            params_id: normalized.params.id ?? normalized.params.call_id,
            query: normalized.query,
            body: normalized.body,
            normalized: {
                callId,
                orgId,
                amdStatus: rawResult,
                amdCause: cause,
                durationMs,
                parsedResult: amdResult,
            },
        }, 'Received dialer AMD callback');
        try {
            await (0, amd_1.recordAmdResult)({ call_id: callId, org_id: orgId, result: amdResult, cause, duration_ms: durationMs });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'AMD result error';
            return reply.status(500).send({ error: msg });
        }
        const action = (0, amd_1.amdDispatchAction)(amdResult);
        try {
            await (0, orchestrator_1.processDialerAmdResult)(callId, orgId, amdResult, cause, durationMs);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Dialer orchestration error';
            logger_1.logger.error({ err, org_id: orgId, call_id: callId }, 'Failed processing AMD result');
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
        if (!orgId)
            return;
        const { call_id } = req.params;
        const body = (req.body || {});
        if (!body.outcome) {
            return reply.status(400).send({ error: 'outcome is required' });
        }
        const VALID_OUTCOMES = [
            'ANSWERED_HUMAN', 'ANSWERED_MACHINE', 'NO_ANSWER', 'BUSY', 'FAILED',
            'DNC', 'CALLBACK', 'SALE', 'NOT_INTERESTED', 'WRONG_NUMBER', 'OTHER',
        ];
        if (!VALID_OUTCOMES.includes(body.outcome)) {
            return reply.status(400).send({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` });
        }
        // Fetch call (org-scoped)
        const { data: call, error: callErr } = await supabase_1.supabase
            .from('calls')
            .select('call_id, org_id, campaign_id, cl_id, metadata')
            .eq('call_id', call_id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (callErr)
            return reply.status(500).send({ error: callErr.message });
        if (!call)
            return reply.status(404).send({ error: 'Call not found' });
        const metadata = (call.metadata || {});
        const clId = call.cl_id ?? (typeof metadata.cl_id === 'string' ? metadata.cl_id : null);
        const disposition_id = crypto.randomUUID();
        const { error: dispErr } = await supabase_1.supabase.from('dispositions').insert({
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
        if (dispErr)
            return reply.status(500).send({ error: dispErr.message });
        // Update campaign_lead dial_state
        if (clId) {
            const leadDialState = body.outcome === 'CALLBACK' ? 'callback' :
                body.outcome === 'DNC' ? 'dnc' :
                    ['SALE', 'ANSWERED_HUMAN', 'NOT_INTERESTED', 'WRONG_NUMBER'].includes(body.outcome)
                        ? 'disposed' : 'disposed';
            await supabase_1.supabase
                .from('campaign_leads')
                .update({
                dial_state: leadDialState,
                callback_at: body.outcome === 'CALLBACK' ? body.callback_at ?? null : null,
                updated_at: new Date().toISOString(),
            })
                .eq('cl_id', clId)
                .eq('org_id', orgId);
        }
        await (0, orchestrator_1.markDispositioned)(call_id, orgId);
        // Transition agent WRAP → READY if session_id provided
        if (body.session_id) {
            await (0, agentState_1.transitionAgentState)(body.session_id, orgId, 'READY', {
                reason: 'disposition_submitted',
                updatedBy: req.user_id ?? 'system',
            }).catch(() => undefined);
        }
        return reply.status(201).send({ disposition_id, success: true });
    });
    /** GET /dialer/calls/live – active dialer calls for org */
    app.get('/calls/live', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { campaign_id, limit } = req.query;
        const safeLimit = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
        let query = supabase_1.supabase
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
        if (error)
            return reply.status(500).send({ error: error.message });
        return reply.send(data ?? []);
    });
    // ────────────────────────────────────────────────────────────────────────────
    // SUPERVISOR
    // ────────────────────────────────────────────────────────────────────────────
    /** GET /dialer/supervisor/queue */
    app.get('/supervisor/queue', async (req, reply) => {
        const orgId = requireOrg(req, reply);
        if (!orgId)
            return;
        const { campaign_id } = req.query;
        // Active agent sessions
        let sessionsQuery = supabase_1.supabase
            .from('agent_sessions')
            .select('session_id, agent_id, campaign_id, state, last_state_at')
            .eq('org_id', orgId)
            .is('ended_at', null);
        if (campaign_id)
            sessionsQuery = sessionsQuery.eq('campaign_id', campaign_id);
        // Live calls
        let callsQuery = supabase_1.supabase
            .from('calls')
            .select('call_id, campaign_id, contact_id, lead_id, assigned_agent, status, started_at')
            .eq('org_id', orgId)
            .in('status', ['QUEUED', 'DIALING_LEAD', 'ANSWERED', 'AMD_HUMAN', 'AMD_MACHINE', 'BRIDGED', 'dialing', 'originated', 'bridged']);
        if (campaign_id)
            callsQuery = callsQuery.eq('campaign_id', campaign_id);
        const [sessionsResult, callsResult] = await Promise.all([sessionsQuery, callsQuery]);
        return reply.send({
            agents: sessionsResult.data ?? [],
            live_calls: callsResult.data ?? [],
        });
    });
};
exports.dialerModule = dialerModule;
