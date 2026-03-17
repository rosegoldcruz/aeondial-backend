/**
 * AMD (Answering Machine Detection) classifier.
 *
 * Integration model
 * ─────────────────
 * Asterisk's built-in AMD() dialplan app runs during call setup.
 * The dialplan posts results here via:
 *   CURL(${BACKEND_URL}/telephony/calls/${call_id}/amd_result, ...)
 *
 * This module:
 *   1. Validates and persists the AMD result to `call_events`.
 *   2. Updates the `calls` row with `amd_result`.
 *   3. Emits a `call.amd_result` WebSocket event to the org.
 *   4. Returns the classification so the dialer engine can route the call.
 */

import { supabase } from '../../core/supabase';
import { emitOrgEvent } from '../../core/websocket';
import { logger } from '../../core/logger';

export type AmdResult = 'HUMAN' | 'MACHINE' | 'NOTSURE' | 'FAILED' | 'TIMEOUT';

const VALID_AMD_RESULTS = new Set<AmdResult>(['HUMAN', 'MACHINE', 'NOTSURE', 'FAILED', 'TIMEOUT']);

export function parseAmdResult(raw: unknown): AmdResult {
  const upper = String(raw ?? '').toUpperCase().trim() as AmdResult;
  return VALID_AMD_RESULTS.has(upper) ? upper : 'NOTSURE';
}

export interface AmdClassification {
  call_id: string;
  org_id: string;
  result: AmdResult;
  cause?: string;       // Asterisk AMD cause string e.g. 'HUMAN', 'TOOLONG', …
  duration_ms?: number;
}

/**
 * Persist an AMD result and broadcast it over WebSocket.
 * Called from the `POST /telephony/calls/:id/amd_result` route.
 */
export async function recordAmdResult(classification: AmdClassification): Promise<void> {
  const { call_id, org_id, result, cause, duration_ms } = classification;

  // Fetch call to check org scope and get campaign_id
  const { data: call, error: fetchErr } = await supabase
    .from('calls')
    .select('call_id, org_id, campaign_id, status, metadata')
    .eq('call_id', call_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (fetchErr) throw new Error(`AMD result fetch error: ${fetchErr.message}`);
  if (!call) throw new Error(`Call ${call_id} not found`);

  const occurredAt = new Date().toISOString();

  // Persist call_event
  await supabase.from('call_events').insert({
    event_id: crypto.randomUUID(),
    org_id,
    call_id,
    event_type: 'amd_result',
    payload: { result, cause, duration_ms },
    occurred_at: occurredAt,
  });

  // Update calls.amd_result
  await supabase
    .from('calls')
    .update({
      amd_result: result,
      updated_at: occurredAt,
    })
    .eq('call_id', call_id)
    .eq('org_id', org_id);

  // Broadcast
  emitOrgEvent({
    type: 'call.amd_result',
    org_id,
    campaign_id: (call.campaign_id as string | null) ?? undefined,
    payload: {
      call_id,
      result,
      cause,
      duration_ms,
      occurred_at: occurredAt,
    },
  });

  logger.info({ org_id, call_id, result, cause }, 'AMD result recorded');
}

/**
 * Determine how the dialer should handle a call after AMD runs.
 * Returns an action string consumed by the dialer engine.
 */
export function amdDispatchAction(result: AmdResult): 'bridge' | 'voicemail' | 'hangup' | 'retry' {
  switch (result) {
    case 'HUMAN':
      return 'bridge';

    case 'MACHINE':
      return 'voicemail';

    case 'NOTSURE':
      // Treat ambiguous result conservatively: bridge the agent and let them decide
      return 'bridge';

    case 'FAILED':
    case 'TIMEOUT':
      return 'hangup';
  }
}
