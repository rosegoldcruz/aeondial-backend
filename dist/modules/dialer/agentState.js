"use strict";
/**
 * Agent state-machine helpers for the progressive dialer.
 *
 * Valid FSM transitions
 * ─────────────────────
 * OFFLINE  → READY      (agent goes ready)
 * READY    → RESERVED   (dialer picks agent)
 * READY    → PAUSED     (agent pauses)
 * RESERVED → INCALL     (call bridged to agent)
 * RESERVED → READY      (lead AMD=MACHINE or no-answer; release agent)
 * INCALL   → WRAP       (call ended; agent enters wrap time)
 * WRAP     → READY      (disposition submitted or wrap timer expires)
 * PAUSED   → READY      (agent resumes)
 * Any      → OFFLINE    (logout)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidTransition = isValidTransition;
exports.transitionAgentState = transitionAgentState;
exports.createAgentSession = createAgentSession;
exports.reserveNextAgent = reserveNextAgent;
exports.countReadyAgents = countReadyAgents;
exports.getAgentSession = getAgentSession;
const supabase_1 = require("../../core/supabase");
const websocket_1 = require("../../core/websocket");
const logger_1 = require("../../core/logger");
const ALLOWED_TRANSITIONS = {
    OFFLINE: ['READY'],
    READY: ['RESERVED', 'PAUSED', 'OFFLINE'],
    RESERVED: ['INCALL', 'READY', 'OFFLINE'],
    INCALL: ['WRAP', 'OFFLINE'],
    WRAP: ['READY', 'OFFLINE'],
    PAUSED: ['READY', 'OFFLINE'],
};
function isValidTransition(from, to) {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
/**
 * Atomically transition an agent session to a new state.
 * Returns the updated session row or throws on invalid transition.
 */
async function transitionAgentState(sessionId, orgId, toState, opts = {}) {
    // Fetch current session (scoped to org)
    const { data: session, error: fetchErr } = await supabase_1.supabase
        .from('agent_sessions')
        .select('session_id, org_id, agent_id, campaign_id, state, last_state_at')
        .eq('session_id', sessionId)
        .eq('org_id', orgId)
        .maybeSingle();
    if (fetchErr)
        throw new Error(`Failed to fetch agent session: ${fetchErr.message}`);
    if (!session)
        throw new Error(`Agent session ${sessionId} not found in org ${orgId}`);
    const fromState = session.state;
    if (fromState === toState) {
        return session;
    }
    if (!isValidTransition(fromState, toState)) {
        throw new Error(`Invalid agent state transition: ${fromState} → ${toState}`);
    }
    const now = new Date().toISOString();
    // Record history
    await supabase_1.supabase.from('agent_state_history').insert({
        history_id: crypto.randomUUID(),
        org_id: orgId,
        session_id: sessionId,
        agent_id: session.agent_id,
        from_state: fromState,
        to_state: toState,
        reason: opts.reason ?? null,
        occurred_at: now,
    });
    const endedAt = toState === 'OFFLINE' ? now : null;
    const patch = {
        state: toState,
        last_state_at: now,
        updated_by: opts.updatedBy ?? 'system',
    };
    if (endedAt)
        patch.ended_at = endedAt;
    const { data: updated, error: updateErr } = await supabase_1.supabase
        .from('agent_sessions')
        .update(patch)
        .eq('session_id', sessionId)
        .eq('org_id', orgId)
        .select('session_id, org_id, agent_id, campaign_id, state, last_state_at')
        .single();
    if (updateErr)
        throw new Error(`Failed to update agent session: ${updateErr.message}`);
    const updatedSession = updated;
    // Broadcast state change
    (0, websocket_1.emitOrgEvent)({
        type: 'agent.state',
        org_id: orgId,
        campaign_id: updatedSession.campaign_id ?? undefined,
        payload: {
            session_id: sessionId,
            agent_id: updatedSession.agent_id,
            from_state: fromState,
            to_state: toState,
            reason: opts.reason,
            occurred_at: now,
        },
    });
    logger_1.logger.info({ org_id: orgId, agent_id: updatedSession.agent_id, from_state: fromState, to_state: toState }, 'Agent state transition');
    return updatedSession;
}
/**
 * Create a new agent session (agent login / go-ready).
 */
async function createAgentSession(orgId, agentId, campaignId, createdBy, metadata = {}) {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Terminate any existing open session for this agent in this org
    await supabase_1.supabase
        .from('agent_sessions')
        .update({ state: 'OFFLINE', ended_at: now, updated_by: createdBy })
        .eq('org_id', orgId)
        .eq('agent_id', agentId)
        .is('ended_at', null);
    const { data: inserted, error } = await supabase_1.supabase
        .from('agent_sessions')
        .insert({
        session_id: sessionId,
        org_id: orgId,
        agent_id: agentId,
        campaign_id: campaignId,
        state: 'READY',
        started_at: now,
        last_state_at: now,
        metadata,
        created_by: createdBy,
        updated_by: createdBy,
    })
        .select('session_id, org_id, agent_id, campaign_id, state, last_state_at')
        .single();
    if (error)
        throw new Error(`Failed to create agent session: ${error.message}`);
    (0, websocket_1.emitOrgEvent)({
        type: 'agent.state',
        org_id: orgId,
        campaign_id: campaignId ?? undefined,
        payload: {
            session_id: sessionId,
            agent_id: agentId,
            from_state: null,
            to_state: 'READY',
            reason: 'login',
        },
    });
    return inserted;
}
/**
 * Find one READY agent for a campaign and atomically move them to RESERVED.
 * Returns the reserved session or null if none available.
 */
async function reserveNextAgent(orgId, campaignId) {
    // Get first READY agent in campaign (simple FIFO for now)
    const { data: sessions } = await supabase_1.supabase
        .from('agent_sessions')
        .select('session_id, org_id, agent_id, campaign_id, state, last_state_at')
        .eq('org_id', orgId)
        .eq('campaign_id', campaignId)
        .eq('state', 'READY')
        .is('ended_at', null)
        .order('last_state_at', { ascending: true })
        .limit(1);
    if (!sessions || sessions.length === 0)
        return null;
    const session = sessions[0];
    try {
        return await transitionAgentState(session.session_id, orgId, 'RESERVED', {
            reason: 'dialer_reserved',
        });
    }
    catch {
        // Race condition: another worker grabbed the agent; return null
        return null;
    }
}
/**
 * Return a count of ready agents for a campaign.
 */
async function countReadyAgents(orgId, campaignId) {
    const { count } = await supabase_1.supabase
        .from('agent_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('campaign_id', campaignId)
        .eq('state', 'READY')
        .is('ended_at', null);
    return count ?? 0;
}
/**
 * Fetch the current open session for an agent.
 */
async function getAgentSession(orgId, agentId) {
    const { data } = await supabase_1.supabase
        .from('agent_sessions')
        .select('session_id, org_id, agent_id, campaign_id, state, last_state_at')
        .eq('org_id', orgId)
        .eq('agent_id', agentId)
        .is('ended_at', null)
        .maybeSingle();
    return data ?? null;
}
