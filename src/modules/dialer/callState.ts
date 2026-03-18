import { supabase } from '../../core/supabase';
import { emitOrgEvent } from '../../core/websocket';

export type ProgressiveCallState =
  | 'QUEUED'
  | 'DIALING_LEAD'
  | 'ANSWERED'
  | 'AMD_HUMAN'
  | 'AMD_MACHINE'
  | 'BRIDGED'
  | 'ENDED'
  | 'DISPOSITIONED'
  | 'FAILED'
  | 'ABANDONED';

export const ACTIVE_PROGRESSIVE_CALL_STATES: ProgressiveCallState[] = [
  'QUEUED',
  'DIALING_LEAD',
  'ANSWERED',
  'AMD_HUMAN',
  'AMD_MACHINE',
  'BRIDGED',
];

const TRANSITIONS: Record<ProgressiveCallState, ProgressiveCallState[]> = {
  QUEUED: ['DIALING_LEAD', 'FAILED', 'ABANDONED'],
  DIALING_LEAD: ['ANSWERED', 'FAILED', 'ABANDONED'],
  ANSWERED: ['AMD_HUMAN', 'AMD_MACHINE', 'FAILED', 'ABANDONED'],
  AMD_HUMAN: ['BRIDGED', 'FAILED', 'ENDED'],
  AMD_MACHINE: ['ENDED'],
  BRIDGED: ['ENDED', 'FAILED'],
  ENDED: ['DISPOSITIONED'],
  DISPOSITIONED: [],
  FAILED: [],
  ABANDONED: [],
};

export interface DialerCallRow {
  call_id: string;
  org_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  assigned_agent: string | null;
  cl_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  metadata: Record<string, unknown> | null;
}

type StateTransitionOptions = {
  metadataPatch?: Record<string, unknown>;
  occurredAt?: string;
  eventType?: string;
  eventPayload?: Record<string, unknown>;
  extraUpdates?: Record<string, unknown>;
  allowSameState?: boolean;
};

export function isProgressiveCallState(value: unknown): value is ProgressiveCallState {
  return typeof value === 'string' && value in TRANSITIONS;
}

export async function getDialerCall(callId: string, orgId: string): Promise<DialerCallRow | null> {
  const { data } = await supabase
    .from('calls')
    .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
    .eq('call_id', callId)
    .eq('org_id', orgId)
    .maybeSingle();

  return (data as DialerCallRow | null) ?? null;
}

export async function recordDialerCallEvent(
  call: Pick<DialerCallRow, 'call_id' | 'org_id' | 'campaign_id'>,
  eventType: string,
  payload: Record<string, unknown> = {},
  occurredAt = new Date().toISOString(),
): Promise<void> {
  await supabase.from('call_events').insert({
    event_id: crypto.randomUUID(),
    org_id: call.org_id,
    call_id: call.call_id,
    event_type: eventType,
    payload,
    occurred_at: occurredAt,
  });

  emitOrgEvent({
    type: 'call.event',
    org_id: call.org_id,
    campaign_id: call.campaign_id ?? undefined,
    payload: {
      action: eventType,
      call_id: call.call_id,
      ...payload,
      occurred_at: occurredAt,
    },
  });
}

export async function transitionDialerCallState(
  call: DialerCallRow,
  toState: ProgressiveCallState,
  options: StateTransitionOptions = {},
): Promise<DialerCallRow> {
  const fromState = isProgressiveCallState(call.status) ? call.status : null;
  if (fromState === toState && !options.allowSameState) {
    return call;
  }

  if (fromState && !TRANSITIONS[fromState].includes(toState) && !options.allowSameState) {
    throw new Error(`Invalid dialer call state transition: ${fromState} -> ${toState}`);
  }

  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const mergedMetadata = {
    ...(call.metadata || {}),
    ...(options.metadataPatch || {}),
  };

  const patch: Record<string, unknown> = {
    status: toState,
    metadata: mergedMetadata,
    updated_at: occurredAt,
    ...(options.extraUpdates || {}),
  };

  if (toState === 'BRIDGED' && !call.started_at) {
    patch.started_at = occurredAt;
  }

  if ((toState === 'ENDED' || toState === 'FAILED' || toState === 'ABANDONED') && !call.ended_at) {
    patch.ended_at = occurredAt;
  }

  const { data, error } = await supabase
    .from('calls')
    .update(patch)
    .eq('call_id', call.call_id)
    .eq('org_id', call.org_id)
    .select('call_id, org_id, campaign_id, lead_id, contact_id, assigned_agent, cl_id, status, started_at, ended_at, metadata')
    .single();

  if (error) {
    throw new Error(`Failed updating dialer call ${call.call_id}: ${error.message}`);
  }

  const updated = data as DialerCallRow;

  await recordDialerCallEvent(
    updated,
    options.eventType ?? 'state.changed',
    {
      from_state: fromState,
      to_state: toState,
      ...(options.eventPayload || {}),
    },
    occurredAt,
  );

  return updated;
}
