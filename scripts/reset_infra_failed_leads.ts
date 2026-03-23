/**
 * reset_infra_failed_leads.ts
 *
 * Resets campaign_leads that were blocked by infrastructure failures (ARI/telephony)
 * back to dial_state=pending so they can be redialed.
 *
 * ONLY resets leads that:
 *   - Have dial_state = 'failed' AND metadata.infra_failure_count > 0, OR
 *   - Have dial_state = 'pending_retry' with infra_blocked = true
 *
 * NEVER resets leads that failed due to real carrier/call outcomes.
 *
 * Usage:
 *   ./node_modules/.bin/ts-node --transpile-only --skip-project \
 *     --compiler-options '{"module":"commonjs"}' \
 *     scripts/reset_infra_failed_leads.ts [campaign_id]
 *
 * If no campaign_id is passed, resets across ALL campaigns in the org.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const campaignIdArg = process.argv[2] ?? null;

async function run(): Promise<void> {
  console.log('=== reset_infra_failed_leads ===');
  if (campaignIdArg) {
    console.log(`Scoped to campaign: ${campaignIdArg}`);
  } else {
    console.log('Scope: ALL campaigns (no campaign_id provided)');
  }
  console.log('');

  // ── 1. Find failed leads with infra_failure_count > 0 ────────────────────
  let failedQuery = supabase
    .from('campaign_leads')
    .select('cl_id, campaign_id, lead_id, dial_state, attempts, metadata')
    .eq('dial_state', 'failed');

  if (campaignIdArg) {
    failedQuery = failedQuery.eq('campaign_id', campaignIdArg);
  }

  const { data: failedRows, error: failedErr } = await failedQuery;

  if (failedErr) {
    console.error('Error fetching failed leads:', failedErr.message);
    process.exit(1);
  }

  // Filter to only those with infra failures recorded
  const infraFailed = (failedRows ?? []).filter(
    (row) =>
      typeof row.metadata === 'object' &&
      row.metadata !== null &&
      (row.metadata as Record<string, unknown>).infra_failure_count != null &&
      Number((row.metadata as Record<string, unknown>).infra_failure_count) > 0,
  );

  // ── 2. Find pending_retry leads with infra_blocked ───────────────────────
  let retryQuery = supabase
    .from('campaign_leads')
    .select('cl_id, campaign_id, lead_id, dial_state, attempts, metadata')
    .eq('dial_state', 'pending_retry');

  if (campaignIdArg) {
    retryQuery = retryQuery.eq('campaign_id', campaignIdArg);
  }

  const { data: retryRows, error: retryErr } = await retryQuery;

  if (retryErr) {
    console.error('Error fetching pending_retry leads:', retryErr.message);
    process.exit(1);
  }

  const infraRetry = (retryRows ?? []).filter(
    (row) =>
      typeof row.metadata === 'object' &&
      row.metadata !== null &&
      (row.metadata as Record<string, unknown>).infra_blocked === true,
  );

  const toReset = [...infraFailed, ...infraRetry];

  if (toReset.length === 0) {
    console.log('No infra-failed leads found to reset. Nothing to do.');
    return;
  }

  console.log(`Found ${toReset.length} leads to reset:`);
  console.log(`  - from dial_state=failed with infra_failure_count > 0: ${infraFailed.length}`);
  console.log(`  - from dial_state=pending_retry with infra_blocked: ${infraRetry.length}`);
  console.log('');

  // Preview
  for (const row of toReset) {
    const infraCount = (row.metadata as Record<string, unknown>)?.infra_failure_count ?? 0;
    console.log(
      `  cl_id=${row.cl_id}  campaign=${row.campaign_id}  state=${row.dial_state}  attempts=${row.attempts}  infra_failures=${infraCount}`,
    );
  }
  console.log('');

  const ids = toReset.map((r) => r.cl_id);

  // ── 3. Reset to pending, attempts=0, clear infra flags ───────────────────
  const { error: updateErr, count } = await supabase
    .from('campaign_leads')
    .update({
      dial_state: 'pending',
      attempts: 0,
      updated_at: new Date().toISOString(),
      metadata: null, // clear infra_failure_log so fresh start
    })
    .in('cl_id', ids);

  if (updateErr) {
    console.error('Error resetting leads:', updateErr.message);
    process.exit(1);
  }

  console.log(`✓ Reset ${count ?? ids.length} leads to dial_state=pending, attempts=0`);

  // ── 4. Verify via v_dialer_queue ─────────────────────────────────────────
  let queueQuery = supabase
    .from('v_dialer_queue')
    .select('cl_id', { count: 'exact', head: true });

  if (campaignIdArg) {
    queueQuery = queueQuery.eq('campaign_id', campaignIdArg);
  }

  const { count: queueCount, error: queueErr } = await queueQuery;

  if (queueErr) {
    console.warn('Could not verify v_dialer_queue:', queueErr.message);
  } else {
    console.log(`✓ v_dialer_queue now shows ${queueCount} dialable leads`);
  }

  console.log('');
  console.log('Done. You can now restart the campaign.');
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
