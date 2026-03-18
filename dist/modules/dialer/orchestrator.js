"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findCallByChannelId = findCallByChannelId;
exports.findCallByPlaybackId = findCallByPlaybackId;
exports.findCallByBridgeId = findCallByBridgeId;
exports.handleLeadChannelAnswered = handleLeadChannelAnswered;
exports.processDialerAmdResult = processDialerAmdResult;
exports.handleAgentAlertAnswered = handleAgentAlertAnswered;
exports.finalizeBridgeAfterBeep = finalizeBridgeAfterBeep;
exports.handleCallChannelHangup = handleCallChannelHangup;
exports.markDispositioned = markDispositioned;
exports.buildDialerCallMetadata = buildDialerCallMetadata;
exports.resolveOutboundEndpoint = resolveOutboundEndpoint;
const supabase_1 = require("../../core/supabase");
const ari_1 = require("../../core/ari");
const config_1 = require("../../core/config");
const websocket_1 = require("../../core/websocket");
const logger_1 = require("../../core/logger");
const agentState_1 = require("./agentState");
const callState_1 = require("./callState");
const wrapTimers = new Map();
const playbackToCall = new Map();
function activeStatusList() {
    return [...callState_1.ACTIVE_PROGRESSIVE_CALL_STATES];
}
function callMetadata(call) {
    return (call.metadata || {});
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function normalizeAgentEndpoint(endpoint) {
    const trimmed = endpoint.trim();
    if (!trimmed)
        return trimmed;
    if (trimmed.includes('/'))
        return trimmed;
    return `${config_1.config.ariEndpointPrefix}/${trimmed}`;
}
function endpointFromTemplate(phone) {
    const number = phone.replace(/^\+/, '');
    const template = config_1.config.dialerOutboundEndpointTemplate;
    return template.replace(/\{number\}/g, number).replace(/\{phone\}/g, phone);
}
async function getAgentSessionRow(sessionId, orgId) {
    const { data } = await supabase_1.supabase
        .from('agent_sessions')
        .select('session_id, org_id, agent_id, campaign_id, state, metadata')
        .eq('session_id', sessionId)
        .eq('org_id', orgId)
        .maybeSingle();
    return data ?? null;
}
async function patchAgentSessionMetadata(sessionId, orgId, metadataPatch) {
    const current = await getAgentSessionRow(sessionId, orgId);
    if (!current)
        return;
    await supabase_1.supabase
        .from('agent_sessions')
        .update({
        metadata: {
            ...(current.metadata || {}),
            ...metadataPatch,
        },
        updated_at: new Date().toISOString(),
    })
        .eq('session_id', sessionId)
        .eq('org_id', orgId);
}
async function getUserRow(agentId, orgId) {
    const { data } = await supabase_1.supabase
        .from('users')
        .select('user_id, full_name, metadata')
        .eq('user_id', agentId)
        .eq('org_id', orgId)
        .maybeSingle();
    return data ?? null;
}
async function resolveAgentEndpoint(orgId, sessionId, agentId) {
    if (sessionId) {
        const session = await getAgentSessionRow(sessionId, orgId);
        const sessionEndpoint = stringValue(session?.metadata?.endpoint);
        if (sessionEndpoint) {
            return normalizeAgentEndpoint(sessionEndpoint);
        }
    }
    if (agentId) {
        const user = await getUserRow(agentId, orgId);
        const softphone = (user?.metadata?.softphone || {});
        const softphoneEndpoint = stringValue(softphone.endpoint);
        if (softphoneEndpoint) {
            return normalizeAgentEndpoint(softphoneEndpoint);
        }
    }
    if (agentId) {
        return `${config_1.config.ariEndpointPrefix}/${agentId}`;
    }
    throw new Error('No agent endpoint configured');
}
async function hydrateLeadSnapshot(call) {
    const metadata = callMetadata(call);
    const hydrated = {};
    if (stringValue(metadata.phone)) {
        hydrated.phone = metadata.phone;
    }
    if (!hydrated.phone && call.contact_id) {
        const { data: contact } = await supabase_1.supabase
            .from('contacts')
            .select('first_name, last_name, phone')
            .eq('contact_id', call.contact_id)
            .eq('org_id', call.org_id)
            .maybeSingle();
        if (contact?.phone)
            hydrated.phone = contact.phone;
        const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim();
        if (fullName)
            hydrated.contact_name = fullName;
    }
    if (!metadata.lead_name && call.lead_id) {
        const { data: lead } = await supabase_1.supabase
            .from('leads')
            .select('metadata')
            .eq('lead_id', call.lead_id)
            .eq('org_id', call.org_id)
            .maybeSingle();
        const leadMeta = (lead?.metadata || {});
        const leadName = stringValue(leadMeta.lead_name) || stringValue(leadMeta.name);
        if (leadName)
            hydrated.lead_name = leadName;
    }
    return hydrated;
}
async function updateCampaignLeadState(clId, orgId, dialState, patch = {}) {
    if (!clId)
        return;
    await supabase_1.supabase
        .from('campaign_leads')
        .update({
        dial_state: dialState,
        updated_at: new Date().toISOString(),
        ...patch,
    })
        .eq('cl_id', clId)
        .eq('org_id', orgId);
}
async function findActiveCallByMetadataMatch(match) {
    const { data } = await supabase_1.supabase
        .from('calls')
        .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
        .in('status', activeStatusList())
        .order('updated_at', { ascending: false })
        .limit(250);
    const calls = (data || []);
    return calls.find((call) => match(call, callMetadata(call))) ?? null;
}
async function findCallByChannelId(channelId) {
    const direct = await supabase_1.supabase
        .from('calls')
        .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
        .eq('call_id', channelId)
        .maybeSingle();
    if (direct.data) {
        return direct.data;
    }
    return findActiveCallByMetadataMatch((call, metadata) => {
        return (stringValue(metadata.lead_channel_id) === channelId ||
            stringValue(metadata.agent_channel_id) === channelId ||
            stringValue(metadata.agent_alert_channel_id) === channelId ||
            call.call_id === channelId);
    });
}
async function findCallByPlaybackId(playbackId) {
    const cachedCallId = playbackToCall.get(playbackId);
    if (cachedCallId) {
        const { data } = await supabase_1.supabase
            .from('calls')
            .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
            .eq('call_id', cachedCallId)
            .maybeSingle();
        if (data) {
            return data;
        }
    }
    return findActiveCallByMetadataMatch((_call, metadata) => {
        return stringValue(metadata.agent_beep_playback_id) === playbackId;
    });
}
async function findCallByBridgeId(bridgeId) {
    return findActiveCallByMetadataMatch((_call, metadata) => {
        return stringValue(metadata.ari_bridge_id) === bridgeId;
    });
}
function emitHumanReady(call, payload) {
    (0, websocket_1.emitOrgEvent)({
        type: 'call.human_ready',
        org_id: call.org_id,
        campaign_id: call.campaign_id ?? undefined,
        payload: {
            call_id: call.call_id,
            ...payload,
        },
    });
}
function emitCallBridged(call, payload) {
    (0, websocket_1.emitOrgEvent)({
        type: 'call.bridged',
        org_id: call.org_id,
        campaign_id: call.campaign_id ?? undefined,
        payload: {
            call_id: call.call_id,
            ...payload,
        },
    });
}
function emitWrap(call, payload) {
    (0, websocket_1.emitOrgEvent)({
        type: 'call.wrap',
        org_id: call.org_id,
        campaign_id: call.campaign_id ?? undefined,
        payload: {
            call_id: call.call_id,
            ...payload,
        },
    });
}
function clearWrapTimer(sessionId) {
    if (!sessionId)
        return;
    const timer = wrapTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        wrapTimers.delete(sessionId);
    }
}
async function scheduleWrapTimer(call) {
    const metadata = callMetadata(call);
    const sessionId = stringValue(metadata.session_id);
    if (!sessionId)
        return;
    clearWrapTimer(sessionId);
    const wrapSeconds = config_1.config.dialerWrapSeconds;
    const wrapUntil = new Date(Date.now() + wrapSeconds * 1000).toISOString();
    await patchAgentSessionMetadata(sessionId, call.org_id, {
        wrap_until: wrapUntil,
        auto_next: true,
        active_call_id: null,
    });
    emitWrap(call, {
        session_id: sessionId,
        agent_id: call.assigned_agent,
        wrap_seconds: wrapSeconds,
        wrap_until: wrapUntil,
        auto_next: true,
    });
    wrapTimers.set(sessionId, setTimeout(async () => {
        try {
            await (0, agentState_1.transitionAgentState)(sessionId, call.org_id, 'READY', {
                reason: 'wrap_expired',
            });
            await patchAgentSessionMetadata(sessionId, call.org_id, {
                wrap_until: null,
                active_call_id: null,
            });
        }
        catch (error) {
            logger_1.logger.warn({ error, session_id: sessionId, call_id: call.call_id }, 'Wrap timer transition skipped');
        }
        finally {
            wrapTimers.delete(sessionId);
        }
    }, wrapSeconds * 1000));
}
async function handleLeadChannelAnswered(channelId) {
    const call = await findCallByChannelId(channelId);
    if (!call)
        return;
    const metadata = callMetadata(call);
    if (stringValue(metadata.lead_channel_id) !== channelId && call.call_id !== channelId) {
        return;
    }
    if (metadata.amd_started_at) {
        return;
    }
    const answered = await (0, callState_1.transitionDialerCallState)(call, 'ANSWERED', {
        eventType: 'lead.answered',
        metadataPatch: {
            lead_channel_id: channelId,
            amd_started_at: new Date().toISOString(),
        },
    });
    try {
        await ari_1.ARI.channels.continueInDialplan(channelId, 'dialer-amd', 's', 1);
    }
    catch (error) {
        logger_1.logger.error({ error, channel_id: channelId, call_id: call.call_id }, 'Failed to continue answered lead into dialplan');
        await (0, callState_1.transitionDialerCallState)(answered, 'FAILED', {
            eventType: 'lead.answer_continue_failed',
            eventPayload: { channel_id: channelId },
        }).catch(() => undefined);
    }
}
async function hangupChannel(channelId) {
    if (!channelId)
        return;
    try {
        await ari_1.ARI.channels.hangup(channelId);
    }
    catch {
        // Channel may already be gone.
    }
}
async function originateAgentAlert(call, endpoint) {
    const metadata = callMetadata(call);
    const agentChannelId = stringValue(metadata.agent_channel_id) || `agent-${call.call_id}`;
    const sessionId = stringValue(metadata.session_id);
    const agentChannel = await ari_1.ARI.channels.originate({
        endpoint,
        appArgs: `agent-alert,${call.call_id},${call.org_id}`,
        channelId: agentChannelId,
        callerId: stringValue(metadata.phone) || call.call_id,
        variables: {
            DIALER_CALL_ID: call.call_id,
            DIALER_ORG_ID: call.org_id,
            DIALER_CHANNEL_ROLE: 'agent',
            DIALER_SESSION_ID: sessionId || '',
        },
    });
    const resolvedChannelId = stringValue(agentChannel?.id) || agentChannelId;
    return (0, callState_1.transitionDialerCallState)(call, 'AMD_HUMAN', {
        allowSameState: true,
        eventType: 'agent.alerting',
        metadataPatch: {
            agent_channel_id: resolvedChannelId,
            agent_alert_channel_id: resolvedChannelId,
            agent_endpoint: endpoint,
        },
    });
}
async function releaseAgentReady(call, reason) {
    const sessionId = stringValue(callMetadata(call).session_id);
    clearWrapTimer(sessionId);
    if (!sessionId)
        return;
    await (0, agentState_1.transitionAgentState)(sessionId, call.org_id, 'READY', { reason }).catch(() => undefined);
    await patchAgentSessionMetadata(sessionId, call.org_id, {
        active_call_id: null,
        wrap_until: null,
    });
}
async function processDialerAmdResult(callId, orgId, result, cause, durationMs) {
    const call = await (0, callState_1.getDialerCall)(callId, orgId);
    if (!call) {
        throw new Error(`Call ${callId} not found`);
    }
    let workingCall = call;
    if (call.status === 'DIALING_LEAD') {
        workingCall = await (0, callState_1.transitionDialerCallState)(call, 'ANSWERED', {
            allowSameState: true,
            eventType: 'amd.answer_inferred',
        });
    }
    const metadata = callMetadata(workingCall);
    const sessionId = stringValue(metadata.session_id);
    const leadChannelId = stringValue(metadata.lead_channel_id) || workingCall.call_id;
    if (result === 'HUMAN' || result === 'NOTSURE') {
        workingCall = await (0, callState_1.transitionDialerCallState)(workingCall, 'AMD_HUMAN', {
            eventType: 'amd.human',
            metadataPatch: {
                amd_result: result,
                amd_cause: cause || null,
                amd_duration_ms: durationMs ?? null,
            },
            eventPayload: {
                result,
                cause,
                duration_ms: durationMs,
            },
        });
        const agentId = workingCall.assigned_agent;
        const endpoint = await resolveAgentEndpoint(orgId, sessionId, agentId);
        emitHumanReady(workingCall, {
            agent_id: agentId,
            session_id: sessionId,
            stage: 'alerting',
            lead_phone: metadata.phone || null,
            lead_name: metadata.lead_name || metadata.contact_name || null,
            endpoint,
        });
        try {
            const alertedCall = await originateAgentAlert(workingCall, endpoint);
            if (sessionId) {
                await patchAgentSessionMetadata(sessionId, orgId, {
                    endpoint,
                    active_call_id: callId,
                    wrap_until: null,
                });
            }
            return { action: 'bridge' };
        }
        catch (error) {
            logger_1.logger.error({ error, call_id: callId, endpoint }, 'Failed originating agent alert leg');
            await (0, callState_1.transitionDialerCallState)(workingCall, 'FAILED', {
                eventType: 'agent.alert_failed',
                eventPayload: {
                    error: error instanceof ari_1.AriRequestError
                        ? { message: error.message, status: error.status, response: error.responseText }
                        : { message: error instanceof Error ? error.message : String(error) },
                },
            }).catch(() => undefined);
            await releaseAgentReady(workingCall, 'agent_alert_failed');
            await hangupChannel(leadChannelId);
            await updateCampaignLeadState(workingCall.cl_id, orgId, 'failed');
            return { action: 'hangup' };
        }
    }
    const machineState = result === 'MACHINE' ? 'AMD_MACHINE' : 'FAILED';
    workingCall = await (0, callState_1.transitionDialerCallState)(workingCall, machineState, {
        eventType: result === 'MACHINE' ? 'amd.machine' : 'amd.failed',
        metadataPatch: {
            amd_result: result,
            amd_cause: cause || null,
            amd_duration_ms: durationMs ?? null,
        },
        eventPayload: {
            result,
            cause,
            duration_ms: durationMs,
        },
    });
    await hangupChannel(leadChannelId);
    await updateCampaignLeadState(workingCall.cl_id, orgId, result === 'MACHINE' ? 'no_answer' : 'failed');
    await releaseAgentReady(workingCall, result === 'MACHINE' ? 'amd_machine' : 'amd_failed');
    if (result === 'MACHINE') {
        await (0, callState_1.transitionDialerCallState)(workingCall, 'ENDED', {
            eventType: 'call.ended',
            eventPayload: { reason: 'amd_machine' },
        }).catch(() => undefined);
    }
    return { action: 'hangup' };
}
async function handleAgentAlertAnswered(channelId) {
    const call = await findCallByChannelId(channelId);
    if (!call)
        return;
    const metadata = callMetadata(call);
    if (stringValue(metadata.agent_channel_id) !== channelId && stringValue(metadata.agent_alert_channel_id) !== channelId) {
        return;
    }
    if (stringValue(metadata.agent_beep_playback_id)) {
        return;
    }
    const playbackId = `beep-${call.call_id}`;
    playbackToCall.set(playbackId, call.call_id);
    const updated = await (0, callState_1.transitionDialerCallState)(call, 'AMD_HUMAN', {
        allowSameState: true,
        eventType: 'agent.beep_started',
        metadataPatch: {
            agent_channel_id: channelId,
            agent_beep_playback_id: playbackId,
            agent_beep_started_at: new Date().toISOString(),
        },
    });
    emitHumanReady(updated, {
        agent_id: call.assigned_agent,
        session_id: metadata.session_id || null,
        stage: 'beeping',
        playback_id: playbackId,
        lead_phone: metadata.phone || null,
        lead_name: metadata.lead_name || metadata.contact_name || null,
    });
    await ari_1.ARI.channels.play(channelId, config_1.config.dialerAgentBeepMedia, playbackId);
}
async function finalizeBridgeAfterBeep(playbackId) {
    const call = await findCallByPlaybackId(playbackId);
    if (!call)
        return;
    const metadata = callMetadata(call);
    const leadChannelId = stringValue(metadata.lead_channel_id) || call.call_id;
    const agentChannelId = stringValue(metadata.agent_channel_id);
    const sessionId = stringValue(metadata.session_id);
    if (!agentChannelId) {
        throw new Error(`Missing agent channel for call ${call.call_id}`);
    }
    const bridgeId = stringValue(metadata.ari_bridge_id) || `bridge-${call.call_id}`;
    try {
        try {
            await ari_1.ARI.bridges.addChannel(bridgeId, [leadChannelId, agentChannelId]);
        }
        catch (error) {
            if (error instanceof ari_1.AriRequestError && error.status === 404) {
                await ari_1.ARI.bridges.create(bridgeId);
                await ari_1.ARI.bridges.addChannel(bridgeId, [leadChannelId, agentChannelId]);
            }
            else {
                throw error;
            }
        }
    }
    finally {
        playbackToCall.delete(playbackId);
    }
    if (sessionId) {
        await (0, agentState_1.transitionAgentState)(sessionId, call.org_id, 'INCALL', { reason: 'call_bridged' }).catch(() => undefined);
        await patchAgentSessionMetadata(sessionId, call.org_id, {
            active_call_id: call.call_id,
            wrap_until: null,
        });
    }
    const bridged = await (0, callState_1.transitionDialerCallState)(call, 'BRIDGED', {
        eventType: 'call.bridged',
        metadataPatch: {
            ari_bridge_id: bridgeId,
            bridge_ready_at: new Date().toISOString(),
            agent_beep_playback_id: null,
        },
        extraUpdates: {
            assigned_agent: call.assigned_agent,
        },
        eventPayload: {
            bridge_id: bridgeId,
            agent_channel_id: agentChannelId,
            lead_channel_id: leadChannelId,
        },
    });
    await updateCampaignLeadState(bridged.cl_id, bridged.org_id, 'answered');
    const leadSnapshot = await hydrateLeadSnapshot(bridged);
    emitCallBridged(bridged, {
        agent_id: bridged.assigned_agent,
        session_id: sessionId,
        bridge_id: bridgeId,
        lead_id: bridged.lead_id,
        contact_id: bridged.contact_id,
        status: bridged.status,
        started_at: bridged.started_at,
        lead_name: leadSnapshot.lead_name || metadata.lead_name || leadSnapshot.contact_name || metadata.contact_name || null,
        contact_name: leadSnapshot.contact_name || metadata.contact_name || null,
        phone: leadSnapshot.phone || metadata.phone || null,
        metadata: {
            ...metadata,
            ...leadSnapshot,
            ari_bridge_id: bridgeId,
        },
    });
    (0, websocket_1.emitOrgEvent)({
        type: 'queue.lead_answered',
        org_id: bridged.org_id,
        campaign_id: bridged.campaign_id ?? undefined,
        payload: {
            call_id: bridged.call_id,
            cl_id: bridged.cl_id,
            agent_id: bridged.assigned_agent,
            amd_result: 'HUMAN',
        },
    });
}
async function transitionEndedIfNeeded(call, reason) {
    if (call.status === 'ENDED' || call.status === 'DISPOSITIONED' || call.status === 'FAILED' || call.status === 'ABANDONED') {
        return call;
    }
    return (0, callState_1.transitionDialerCallState)(call, 'ENDED', {
        eventType: 'call.ended',
        eventPayload: { reason },
    });
}
async function handleCallChannelHangup(channelId, reason) {
    const call = await findCallByChannelId(channelId);
    if (!call)
        return;
    const metadata = callMetadata(call);
    const leadChannelId = stringValue(metadata.lead_channel_id) || call.call_id;
    const agentChannelId = stringValue(metadata.agent_channel_id);
    const sessionId = stringValue(metadata.session_id);
    const isAgentSide = agentChannelId === channelId;
    const isLeadSide = leadChannelId === channelId;
    if (call.status === 'BRIDGED') {
        const ended = await transitionEndedIfNeeded(call, reason);
        if (isAgentSide) {
            await hangupChannel(leadChannelId);
        }
        else if (isLeadSide) {
            await hangupChannel(agentChannelId);
        }
        if (sessionId) {
            await (0, agentState_1.transitionAgentState)(sessionId, ended.org_id, 'WRAP', { reason: 'call_ended' }).catch(() => undefined);
            await scheduleWrapTimer(ended);
        }
        return;
    }
    if (call.status === 'AMD_HUMAN' || call.status === 'ANSWERED' || call.status === 'DIALING_LEAD') {
        await (0, callState_1.transitionDialerCallState)(call, 'FAILED', {
            eventType: 'call.failed',
            eventPayload: { reason, channel_id: channelId },
        }).catch(() => undefined);
        if (isAgentSide) {
            await hangupChannel(leadChannelId);
        }
        await updateCampaignLeadState(call.cl_id, call.org_id, 'failed');
        await releaseAgentReady(call, 'call_failed_before_bridge');
    }
}
async function markDispositioned(callId, orgId) {
    const call = await (0, callState_1.getDialerCall)(callId, orgId);
    if (!call)
        return;
    const metadata = callMetadata(call);
    const sessionId = stringValue(metadata.session_id);
    clearWrapTimer(sessionId);
    if (call.status === 'ENDED') {
        await (0, callState_1.transitionDialerCallState)(call, 'DISPOSITIONED', {
            eventType: 'call.dispositioned',
        }).catch(() => undefined);
    }
    if (sessionId) {
        await patchAgentSessionMetadata(sessionId, orgId, {
            wrap_until: null,
            active_call_id: null,
        });
    }
}
function buildDialerCallMetadata(input) {
    return {
        session_id: input.session_id,
        agent_id: input.agent_id,
        endpoint: input.endpoint,
        attempt: input.attempt,
        cl_id: input.cl_id,
        phone: input.phone,
        lead_channel_id: null,
        agent_channel_id: null,
        ari_bridge_id: null,
        agent_beep_playback_id: null,
        lead_name: input.lead_name ?? null,
        contact_name: input.contact_name ?? null,
        auto_next: true,
    };
}
function resolveOutboundEndpoint(phone) {
    return endpointFromTemplate(phone);
}
