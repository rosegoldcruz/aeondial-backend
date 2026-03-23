/**
 * import_leads.ts
 * ──────────────────────────────────────────────────────────────
 * One-shot lead importer for the AEON Dialer.
 *
 * Reads hardcoded CSV rows, inserts:
 *   contacts  → contact record per lead
 *   leads     → lead row linked to contact + org
 *   campaign_leads → queue row with dial_state='pending'
 *
 * Run:
 *   ts-node --skip-project scripts/import_leads.ts
 *
 * Env vars (read from .env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional overrides (env or edit below):
 *   ORG_ID          – Clerk org id
 *   CAMPAIGN_NAME   – exact campaign name to attach leads to
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORG_ID = process.env.ORG_ID || 'org_3BHMdhorIYSi1JD8fFduDgq8pME';
const CAMPAIGN_NAME = process.env.CAMPAIGN_NAME || 'Live Dialer Verification Campaign';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ── CSV rows ─────────────────────────────────────────────────────────────────
// Source: Untitled spreadsheet - Sheet1.csv (49 rows)
// All phone numbers normalize to +14803648205

const RAW_ROWS = [
  ['dan', 'cruz', '480-364-8205'],
  ['daniel', 'cruise', '480-364-8205'],
  ['denice', 'loose', '480-364-8205'],
  ['danny', 'bruise', '480-364-8205'],
  ['ferry', 'toose', '480-364-8205'],
  ['larry', 'coolz', '480-364-8205'],
  ['dairy', 'truez', '480-364-8205'],
  ['homie', 'dude', '480-364-8205'],
  ['lead', 'one', '480-364-8205'],
  ['lead two', 'two', '480-364-8205'],
  ['lead', 'three', '480-364-8205'],
  ['lead', 'four', '480-364-8205'],
  ['lead', 'five', '480-364-8205'],
  ['lead', 'six', '480-364-8205'],
  ['lead', 'seven', '480-364-8205'],
  ['lead', 'eight', '480-364-8205'],
  ['very', 'great', '480-364-8205'],
  ['donnya', 'sonya', '480-364-8205'],
  ['lindy', 'mindy', '480-364-8205'],
  ['mandy', 'waters', '480-364-8205'],
  ['tristan', 'summers', '480-364-8205'],
  ['sophia', 'leone', '480-364-8205'],
  ['riley', 'reid', '480-364-8205'],
  ['reagan', 'foxx', '480-364-8205'],
  ['chanelle preston', 'preston', '480-364-8205'],
  ['sam altman', 'altman', '480-364-8205'],
  ['', 'musk', '480-364-8205'],
  ['elon', 'vanerchuck', '480-364-8205'],
  ['gary', 'cardone', '480-364-8205'],
  ['grant', 'todd', '480-364-8205'],
  ['will', 'lester', '480-364-8205'],
  ['todd', 'gentner', '480-364-8205'],
  ['mike', 'brown', '480-364-8205'],
  ['mike', 'musonda', '480-364-8205'],
  ['larry', 'lift', '480-364-8205'],
  ['lifted', 'lindsey', '480-364-8205'],
  ['lindsey', 'graham', '480-364-8205'],
  ['jessice', 'simpson', '480-364-8205'],
  ['nick', 'lachey', '480-364-8205'],
  ['ava', 'olsen', '480-364-8205'],
  ['skyler', 'vox', '480-364-8205'],
  ['abigail', 'morris', '480-364-8205'],
  ['anaya', 'olsen', '480-364-8205'],
  ['isabel', 'nice', '480-364-8205'],
  ['cody', 'vore', '480-364-8205'],
  ['valentina', 'jewelzz', '480-364-8205'],
  ['alex', 'hormozi', '480-364-8205'],
  ['sanley', 'yelnats', '480-364-8205'],
  ['cabinet', 'depot', '480-364-8205'],
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

/** Convert 10-digit or formatted US number to E.164 */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function normalize(s: string): string {
  return s.trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== AEON Lead Importer ===`);
  console.log(`Org:      ${ORG_ID}`);
  console.log(`Campaign: ${CAMPAIGN_NAME}\n`);

  // ── 1. Find campaign ───────────────────────────────────────────────────────
  const { data: campaignRows, error: campaignErr } = await db
    .from('campaigns')
    .select('campaign_id, name, status, org_id')
    .eq('org_id', ORG_ID)
    .ilike('name', CAMPAIGN_NAME)
    .limit(1);

  if (campaignErr) {
    console.error('Campaign query failed:', campaignErr.message);
    process.exit(1);
  }

  if (!campaignRows || campaignRows.length === 0) {
    console.error(`Campaign "${CAMPAIGN_NAME}" not found for org ${ORG_ID}`);
    console.log('\nAvailable campaigns:');
    const { data: all } = await db
      .from('campaigns')
      .select('campaign_id, name, status')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(20);
    (all || []).forEach((c) => console.log(`  [${c.status}] ${c.name}  (${c.campaign_id})`));
    process.exit(1);
  }

  const campaign = campaignRows[0];
  console.log(`✓ Campaign found: ${campaign.name} [${campaign.status}] (${campaign.campaign_id})`);

  // ── 2. Parse rows ──────────────────────────────────────────────────────────
  const rows = RAW_ROWS.map(([fn, ln, ph]) => ({
    first_name: normalize(fn) || null,
    last_name: normalize(ln) || null,
    phone: toE164(ph),
  }));

  console.log(`\nParsed ${rows.length} leads. Phone normalizes to: ${rows[0].phone}`);

  // ── 3. Check existing campaign_leads count ─────────────────────────────────
  const { count: existingCount } = await db
    .from('campaign_leads')
    .select('cl_id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.campaign_id);

  console.log(`Existing campaign_leads rows: ${existingCount ?? 0}`);

  if ((existingCount ?? 0) > 0) {
    const { count: pendingCount } = await db
      .from('campaign_leads')
      .select('cl_id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.campaign_id)
      .eq('dial_state', 'pending');
    console.log(`  of which pending: ${pendingCount ?? 0}`);

    if ((pendingCount ?? 0) >= rows.length) {
      console.log('\n⚠  Already have enough pending leads. Re-running will add duplicates.');
      console.log('   Proceeding anyway to ensure full load...\n');
    }
  }

  const now = new Date().toISOString();

  // ── 4. Insert contacts ─────────────────────────────────────────────────────
  const contactInserts = rows.map((r) => ({
    contact_id: uid(),
    org_id: ORG_ID,
    first_name: r.first_name,
    last_name: r.last_name,
    phone: r.phone,
    source: 'csv_import',
    created_by: 'import_script',
    updated_by: 'import_script',
    created_at: now,
    updated_at: now,
  }));

  const { data: insertedContacts, error: contactErr } = await db
    .from('contacts')
    .insert(contactInserts)
    .select('contact_id');

  if (contactErr) {
    console.error('Contact insert failed:', contactErr.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedContacts?.length ?? 0} contacts`);

  // ── 5. Insert leads ────────────────────────────────────────────────────────
  const leadInserts = rows.map((r, i) => ({
    lead_id: uid(),
    org_id: ORG_ID,
    contact_id: (insertedContacts ?? [])[i]?.contact_id ?? null,
    campaign_id: campaign.campaign_id,
    status: 'new',
    source: 'csv_import',
    created_by: 'import_script',
    updated_by: 'import_script',
    created_at: now,
    updated_at: now,
  }));

  const { data: insertedLeads, error: leadErr } = await db
    .from('leads')
    .insert(leadInserts)
    .select('lead_id');

  if (leadErr) {
    console.error('Lead insert failed:', leadErr.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedLeads?.length ?? 0} leads`);

  // ── 6. Insert campaign_leads ───────────────────────────────────────────────
  const clInserts = rows.map((r, i) => ({
    cl_id: uid(),
    org_id: ORG_ID,
    campaign_id: campaign.campaign_id,
    lead_id: (insertedLeads ?? [])[i]?.lead_id ?? uid(),  // safety fallback
    contact_id: (insertedContacts ?? [])[i]?.contact_id ?? null,
    phone: r.phone,
    dial_state: 'pending',
    priority: 0,
    attempts: 0,
    max_attempts: 3,
    created_by: 'import_script',
    updated_by: 'import_script',
    created_at: now,
    updated_at: now,
  }));

  const { data: insertedCL, error: clErr } = await db
    .from('campaign_leads')
    .insert(clInserts)
    .select('cl_id, phone, dial_state');

  if (clErr) {
    console.error('campaign_leads insert failed:', clErr.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedCL?.length ?? 0} campaign_leads (dial_state=pending)\n`);

  // ── 7. Verify v_dialer_queue ───────────────────────────────────────────────
  const { data: queueRows, error: queueErr } = await db
    .from('v_dialer_queue')
    .select('cl_id, phone, dial_state, attempts')
    .eq('org_id', ORG_ID)
    .eq('campaign_id', campaign.campaign_id)
    .limit(100);

  if (queueErr) {
    console.error('v_dialer_queue check failed:', queueErr.message);
  } else {
    console.log(`✓ v_dialer_queue shows ${queueRows?.length ?? 0} dialable rows for campaign`);
    if (queueRows && queueRows.length > 0) {
      console.log(`  Sample: ${queueRows[0].phone} | state=${queueRows[0].dial_state} | attempts=${queueRows[0].attempts}`);
    }
  }

  // ── 8. Ensure campaign is active ───────────────────────────────────────────
  if (campaign.status !== 'active') {
    const { error: activateErr } = await db
      .from('campaigns')
      .update({ status: 'active', updated_at: now })
      .eq('campaign_id', campaign.campaign_id);

    if (activateErr) {
      console.warn(`⚠  Could not set campaign to active: ${activateErr.message}`);
    } else {
      console.log(`✓ Campaign status set to active`);
    }
  } else {
    console.log(`✓ Campaign already active`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Campaign ID: ${campaign.campaign_id}`);
  console.log(`Leads loaded: ${insertedCL?.length ?? 0}`);
  console.log(`\nNext: POST /dialer/campaigns/${campaign.campaign_id}/start`);
  console.log(`      to begin the BullMQ worker and seed the dial queue.\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
