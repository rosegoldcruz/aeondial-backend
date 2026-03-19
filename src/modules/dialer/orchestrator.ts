import { supabase } from '../../core/supabase';
import { ARI, AriRequestError } from '../../core/ari';
import { config } from '../../core/config';
import { emitOrgEvent } from '../../core/websocket';
import { logger } from '../../core/logger';
import { transitionAgentState } from './agentState';
import {
  ACTIVE_PROGRESSIVE_CALL_STATES,
  DialerCallRow,
  ProgressiveCallState,
  getDialerCall,
  recordDialerCallEvent,
  transitionDialerCallState,
} from './callState';
import { AmdResult } from './amd';

type AgentSessionRow = {
  session_id: string;
  org_id: string;
  agent_id: string;
  campaign_id: string | null;
  state: string;
  metadata: Record<string, unknown> | null;
};

type UserRow = {
  user_id: string;
  full_name: string | null;
  metadata: Record<string, unknown> | null;
};

const wrapTimers = new Map<string, NodeJS.Timeout>();
const playbackToCall = new Map<string, string>();

function activeStatusList(): string[] {
  return [...ACTIVE_PROGRESSIVE_CALL_STATES];
}

function callMetadata(call: DialerCallRow): Record<string, unknown> {
  return (call.metadata || {}) as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAgentEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('/')) return trimmed;
  return `${config.ariEndpointPrefix}/${trimmed}`;
}

function endpointFromTemplate(phone: string): string {
  const number = phone.replace(/^\+/, '');
  const template = config.dialerOutboundEndpointTemplate;
  return template.replace(/\{number\}/g, number).replace(/\{phone\}/g, phone);
}

async function getAgentSessionRow(sessionId: string, orgId: string): Promise<AgentSessionRow | null> {
  const { data } = await supabase
    .from('agent_sessions')
    .select('session_id, org_id, agent_id, campaign_id, state, metadata')
    .eq('session_id', sessionId)
    .eq('org_id', orgId)
    .maybeSingle();

  return (data as AgentSessionRow | null) ?? null;
}

async function patchAgentSessionMetadata(
  sessionId: string,
  orgId: string,
  metadataPatch: Record<string, unknown>,
): Promise<void> {
  const current = await getAgentSessionRow(sessionId, orgId);
  if (!current) return;

  await supabase
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

async function getUserRow(agentId: string, orgId: string): Promise<UserRow | null> {
  const { data } = await supabase
    .from('users')
    .select('user_id, full_name, metadata')
    .eq('user_id', agentId)
    .eq('org_id', orgId)
    .maybeSingle();

  return (data as UserRow | null) ?? null;
}

async function resolveAgentEndpoint(
  orgId: string,
  sessionId: string | null,
  agentId: string | null,
): Promise<string> {
  if (sessionId) {
    const session = await getAgentSessionRow(sessionId, orgId);
    const sessionEndpoint = stringValue(session?.metadata?.endpoint);
    if (sessionEndpoint) {
      return normalizeAgentEndpoint(sessionEndpoint);
    }
  }

  if (agentId) {
    const user = await getUserRow(agentId, orgId);
    const softphone = (user?.metadata?.softphone || {}) as Record<string, unknown>;
    const softphoneEndpoint = stringValue(softphone.endpoint);
    if (softphoneEndpoint) {
      return normalizeAgentEndpoint(softphoneEndpoint);
    }
  }

  if (agentId) {
    return `${config.ariEndpointPrefix}/${agentId}`;
  }

  throw new Error('No agent endpoint configured');
}

async function hydrateLeadSnapshot(call: DialerCallRow): Promise<Record<string, unknown>> {
  const metadata = callMetadata(call);
  const hydrated: Record<string, unknown> = {};

  if (stringValue(metadata.phone)) {
    hydrated.phone = metadata.phone;
  }

  if (!hydrated.phone && call.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, phone')
      .eq('contact_id', call.contact_id)
      .eq('org_id', call.org_id)
      .maybeSingle();

    if (contact?.phone) hydrated.phone = contact.phone;
    const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim();
    if (fullName) hydrated.contact_name = fullName;
  }

  if (!metadata.lead_name && call.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('metadata')
      .eq('lead_id', call.lead_id)
      .eq('org_id', call.org_id)
      .maybeSingle();

    const leadMeta = (lead?.metadata || {}) as Record<string, unknown>;
    const leadName = stringValue(leadMeta.lead_name) || stringValue(leadMeta.name);
    if (leadName) hydrated.lead_name = leadName;
  }

  return hydrated;
}

async function updateCampaignLeadState(
  clId: string | null,
  orgId: string,
  dialState: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  if (!clId) return;

  await supabase
    .from('campaign_leads')
    .update({
      dial_state: dialState,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq('cl_id', clId)
    .eq('org_id', orgId);
}

async function findActiveCallByMetadataMatch(
  match: (call: DialerCallRow, metadata: Record<string, unknown>) => boolean,
): Promise<DialerCallRow | null> {
  const { data } = await supabase
    .from('calls')
    .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
    .in('status', activeStatusList())
    .order('updated_at', { ascending: false })
    .limit(250);

  const calls = (data || []) as DialerCallRow[];
  return calls.find((call) => match(call, callMetadata(call))) ?? null;
}

export async function findCallByChannelId(channelId: string): Promise<DialerCallRow | null> {
  const direct = await supabase
    .from('calls')
    .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
    .eq('call_id', channelId)
    .maybeSingle();

  if (direct.data) {
    return direct.data as DialerCallRow;
  }

  return findActiveCallByMetadataMatch((call, metadata) => {
    return (
      stringValue(metadata.lead_channel_id) === channelId ||
      stringValue(metadata.agent_channel_id) === channelId ||
      stringValue(metadata.agent_alert_channel_id) === channelId ||
      call.call_id === channelId
    );
  });
}

export async function findCallByPlaybackId(playbackId: string): Promise<DialerCallRow | null> {
  const cachedCallId = playbackToCall.get(playbackId);
  if (cachedCallId) {
    const { data } = await supabase
      .from('calls')
      .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
      .eq('call_id', cachedCallId)
      .maybeSingle();
    if (data) {
      return data as DialerCallRow;
    }
  }

  return findActiveCallByMetadataMatch((_call, metadata) => {
    return stringValue(metadata.agent_beep_playback_id) === playbackId;
  });
}

export async function findCallByBridgeId(bridgeId: string): Promise<DialerCallRow | null> {
  return findActiveCallByMetadataMatch((_call, metadata) => {
    return stringValue(metadata.ari_bridge_id) === bridgeId;
  });
}

function emitHumanReady(call: DialerCallRow, payload: Record<string, unknown>): void {
  emitOrgEvent({
    type: 'call.human_ready',
    org_id: call.org_id,
    campaign_id: call.campaign_id ?? undefined,
    payload: {
      call_id: call.call_id,
      ...payload,
    },
  });
}

function emitCallBridged(call: DialerCallRow, payload: Record<string, unknown>): void {
  emitOrgEvent({
    type: 'call.bridged',
    org_id: call.org_id,
    campaign_id: call.campaign_id ?? undefined,
    payload: {
      call_id: call.call_id,
      ...payload,
    },
  });
}

function emitWrap(call: DialerCallRow, payload: Record<string, unknown>): void {
  emitOrgEvent({
    type: 'call.wrap',
    org_id: call.org_id,
    campaign_id: call.campaign_id ?? undefined,
    payload: {
      call_id: call.call_id,
      ...payload,
    },
  });
}

function clearWrapTimer(sessionId: string | null): void {
  if (!sessionId) return;
  const timer = wrapTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    wrapTimers.delete(sessionId);
  }
}

async function scheduleWrapTimer(call: DialerCallRow): Promise<void> {
  const metadata = callMetadata(call);
  const sessionId = stringValue(metadata.session_id);
  if (!sessionId) return;

  clearWrapTimer(sessionId);

  const wrapSeconds = config.dialerWrapSeconds;
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

  wrapTimers.set(
    sessionId,
    setTimeout(async () => {
      try {
        await transitionAgentState(sessionId, call.org_id, 'READY', {
          reason: 'wrap_expired',
        });
        await patchAgentSessionMetadata(sessionId, call.org_id, {
          wrap_until: null,
          active_call_id: null,
        });
      } catch (error) {
        logger.warn({ error, session_id: sessionId, call_id: call.call_id }, 'Wrap timer transition skipped');
      } finally {
        wrapTimers.delete(sessionId);
      }
    }, wrapSeconds * 1000),
  );
}

export async function handleLeadChannelAnswered(channelId: string): Promise<void> {
  const call = await findCallByChannelId(channelId);
  if (!call) return;

  const metadata = callMetadata(call);
  if (stringValue(metadata.lead_channel_id) !== channelId && call.call_id !== channelId) {
    return;
  }

  if (metadata.amd_started_at) {
    return;
  }

  const answered = await transitionDialerCallState(call, 'ANSWERED', {
    eventType: 'lead.answered',
    metadataPatch: {
      lead_channel_id: channelId,
      amd_started_at: new Date().toISOString(),
    },
  });

  try {
    await ARI.channels.continueInDialplan(channelId, 'dialer-amd', 's', 1);
  } catch (error) {
    logger.error({ error, channel_id: channelId, call_id: call.call_id }, 'Failed to continue answered lead into dialplan');
    await transitionDialerCallState(answered, 'FAILED', {
      eventType: 'lead.answer_continue_failed',
      eventPayload: { channel_id: channelId },
    }).catch(() => undefined);
  }
}

async function hangupChannel(channelId: string | null): Promise<void> {
  if (!channelId) return;
  try {
    await ARI.channels.hangup(channelId);
  } catch {
    // Channel may already be gone.
  }
}

async function originateAgentAlert(call: DialerCallRow, endpoint: string): Promise<DialerCallRow> {
  const metadata = callMetadata(call);
  const agentChannelId = stringValue(metadata.agent_channel_id) || `agent-${call.call_id}`;
  const sessionId = stringValue(metadata.session_id);

  const agentChannel = await ARI.channels.originate({
    debugContext: 'dialer.agent_alert',
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
  }) as { id?: string } | undefined;

  const resolvedChannelId = stringValue(agentChannel?.id) || agentChannelId;
  return transitionDialerCallState(call, 'AMD_HUMAN', {
    allowSameState: true,
    eventType: 'agent.alerting',
    metadataPatch: {
      agent_channel_id: resolvedChannelId,
      agent_alert_channel_id: resolvedChannelId,
      agent_endpoint: endpoint,
    },
  });
}

async function releaseAgentReady(call: DialerCallRow, reason: string): Promise<void> {
  const sessionId = stringValue(callMetadata(call).session_id);
  clearWrapTimer(sessionId);
  if (!sessionId) return;

  await transitionAgentState(sessionId, call.org_id, 'READY', { reason }).catch(() => undefined);
  await patchAgentSessionMetadata(sessionId, call.org_id, {
    active_call_id: null,
    wrap_until: null,
  });
}

export async function processDialerAmdResult(
  callId: string,
  orgId: string,
  result: AmdResult,
  cause?: string,
  durationMs?: number,
): Promise<{ action: 'bridge' | 'hangup' }> {
  const call = await getDialerCall(callId, orgId);
  if (!call) {
    throw new Error(`Call ${callId} not found`);
  }

  let workingCall = call;
  if (call.status === 'DIALING_LEAD') {
    workingCall = await transitionDialerCallState(call, 'ANSWERED', {
      allowSameState: true,
      eventType: 'amd.answer_inferred',
    });
  }

  const metadata = callMetadata(workingCall);
  const sessionId = stringValue(metadata.session_id);
  const leadChannelId = stringValue(metadata.lead_channel_id) || workingCall.call_id;

  if (result === 'HUMAN' || result === 'NOTSURE') {
    workingCall = await transitionDialerCallState(workingCall, 'AMD_HUMAN', {
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
    } catch (error) {
      logger.error({ error, call_id: callId, endpoint }, 'Failed originating agent alert leg');
      await transitionDialerCallState(workingCall, 'FAILED', {
        eventType: 'agent.alert_failed',
        eventPayload: {
          error:
            error instanceof AriRequestError
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

  const machineState: ProgressiveCallState = result === 'MACHINE' ? 'AMD_MACHINE' : 'FAILED';
  workingCall = await transitionDialerCallState(workingCall, machineState, {
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
    await transitionDialerCallState(workingCall, 'ENDED', {
      eventType: 'call.ended',
      eventPayload: { reason: 'amd_machine' },
    }).catch(() => undefined);
  }

  return { action: 'hangup' };
}

export async function handleAgentAlertAnswered(channelId: string): Promise<void> {
  const call = await findCallByChannelId(channelId);
  if (!call) return;

  const metadata = callMetadata(call);
  if (stringValue(metadata.agent_channel_id) !== channelId && stringValue(metadata.agent_alert_channel_id) !== channelId) {
    return;
  }

  if (stringValue(metadata.agent_beep_playback_id)) {
    return;
  }

  const playbackId = `beep-${call.call_id}`;
  playbackToCall.set(playbackId, call.call_id);

  const updated = await transitionDialerCallState(call, 'AMD_HUMAN', {
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

  await ARI.channels.play(channelId, config.dialerAgentBeepMedia, playbackId);
}

export async function finalizeBridgeAfterBeep(playbackId: string): Promise<void> {
  const call = await findCallByPlaybackId(playbackId);
  if (!call) return;

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
      await ARI.bridges.addChannel(bridgeId, [leadChannelId, agentChannelId]);
    } catch (error) {
      if (error instanceof AriRequestError && error.status === 404) {
        await ARI.bridges.create(bridgeId);
        await ARI.bridges.addChannel(bridgeId, [leadChannelId, agentChannelId]);
      } else {
        throw error;
      }
    }
  } finally {
    playbackToCall.delete(playbackId);
  }

  if (sessionId) {
    await transitionAgentState(sessionId, call.org_id, 'INCALL', { reason: 'call_bridged' }).catch(() => undefined);
    await patchAgentSessionMetadata(sessionId, call.org_id, {
      active_call_id: call.call_id,
      wrap_until: null,
    });
  }

  const bridged = await transitionDialerCallState(call, 'BRIDGED', {
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

  emitOrgEvent({
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

async function transitionEndedIfNeeded(call: DialerCallRow, reason: string): Promise<DialerCallRow> {
  if (call.status === 'ENDED' || call.status === 'DISPOSITIONED' || call.status === 'FAILED' || call.status === 'ABANDONED') {
    return call;
  }

  return transitionDialerCallState(call, 'ENDED', {
    eventType: 'call.ended',
    eventPayload: { reason },
  });
}

export async function handleCallChannelHangup(channelId: string, reason: string): Promise<void> {
  const call = await findCallByChannelId(channelId);
  if (!call) return;

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
    } else if (isLeadSide) {
      await hangupChannel(agentChannelId);
    }

    if (sessionId) {
      await transitionAgentState(sessionId, ended.org_id, 'WRAP', { reason: 'call_ended' }).catch(() => undefined);
      await scheduleWrapTimer(ended);
    }
    return;
  }

  if (call.status === 'AMD_HUMAN' || call.status === 'ANSWERED' || call.status === 'DIALING_LEAD') {
    await transitionDialerCallState(call, 'FAILED', {
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

export async function markDispositioned(callId: string, orgId: string): Promise<void> {
  const call = await getDialerCall(callId, orgId);
  if (!call) return;

  const metadata = callMetadata(call);
  const sessionId = stringValue(metadata.session_id);
  clearWrapTimer(sessionId);

  if (call.status === 'ENDED') {
    await transitionDialerCallState(call, 'DISPOSITIONED', {
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

export function buildDialerCallMetadata(input: {
  session_id: string;
  agent_id: string;
  endpoint: string;
  attempt: number;
  cl_id: string;
  phone: string;
  lead_name?: string | null;
  contact_name?: string | null;
}): Record<string, unknown> {
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

export function resolveOutboundEndpoint(phone: string): string {
  return endpointFromTemplate(phone);
}
