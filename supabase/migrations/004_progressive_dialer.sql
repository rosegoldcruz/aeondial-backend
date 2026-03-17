-- ============================================================
-- Migration 004 – Progressive Auto-Dialer domain tables
-- Extends the existing multi-tenant schema.
-- ============================================================

-- Agent state enum
create type if not exists agent_state as enum (
  'OFFLINE',
  'READY',
  'RESERVED',
  'INCALL',
  'WRAP',
  'PAUSED'
);

-- Disposition outcome enum
create type if not exists disposition_outcome as enum (
  'ANSWERED_HUMAN',
  'ANSWERED_MACHINE',
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'DNC',
  'CALLBACK',
  'SALE',
  'NOT_INTERESTED',
  'WRONG_NUMBER',
  'OTHER'
);

-- AMD result enum
create type if not exists amd_result as enum (
  'HUMAN',
  'MACHINE',
  'NOTSURE',
  'FAILED',
  'TIMEOUT'
);

-- ─── agent_sessions ──────────────────────────────────────────
-- One row per login session. Tracks current FSM state.
create table if not exists agent_sessions (
  session_id      text primary key,
  org_id          text not null references orgs(org_id) on delete cascade,
  agent_id        text not null references users(user_id) on delete cascade,
  campaign_id     text references campaigns(campaign_id) on delete set null,
  state           agent_state not null default 'OFFLINE',
  paused_reason   text,           -- optional label: 'BREAK', 'LUNCH', 'TRAINING' …
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  last_state_at   timestamptz not null default now(),
  metadata        jsonb default '{}'::jsonb,
  created_by      text,
  updated_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_agent_sessions_org_id     on agent_sessions(org_id);
create index if not exists idx_agent_sessions_agent_id   on agent_sessions(agent_id);
create index if not exists idx_agent_sessions_campaign_id on agent_sessions(campaign_id);
create index if not exists idx_agent_sessions_state      on agent_sessions(state) where ended_at is null;

-- ─── agent_state_history ─────────────────────────────────────
create table if not exists agent_state_history (
  history_id    text primary key,
  org_id        text not null references orgs(org_id) on delete cascade,
  session_id    text not null references agent_sessions(session_id) on delete cascade,
  agent_id      text not null,
  from_state    agent_state,
  to_state      agent_state not null,
  reason        text,
  occurred_at   timestamptz not null default now()
);

create index if not exists idx_agent_state_history_session_id on agent_state_history(session_id);
create index if not exists idx_agent_state_history_agent_id   on agent_state_history(agent_id);
create index if not exists idx_agent_state_history_org_id     on agent_state_history(org_id);

-- ─── campaign_leads ──────────────────────────────────────────
-- Junction table that tracks each lead's dial state within a campaign.
-- Separate from the leads table so one contact can exist in multiple campaigns.
create table if not exists campaign_leads (
  cl_id           text primary key,
  org_id          text not null references orgs(org_id) on delete cascade,
  campaign_id     text not null references campaigns(campaign_id) on delete cascade,
  lead_id         text not null references leads(lead_id) on delete cascade,
  contact_id      text references contacts(contact_id) on delete set null,
  phone           text not null,
  dial_state      text not null default 'pending'
    check (dial_state in ('pending','dialing','answered','no_answer','busy',
                          'failed','callback','dnc','disposed','skipped')),
  priority        integer default 0,        -- higher = dial sooner
  attempts        integer default 0,
  max_attempts    integer default 3,
  last_called_at  timestamptz,
  callback_at     timestamptz,
  assigned_agent  text references users(user_id) on delete set null,
  last_call_id    text references calls(call_id) on delete set null,
  metadata        jsonb default '{}'::jsonb,
  created_by      text,
  updated_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (campaign_id, lead_id)
);

create index if not exists idx_campaign_leads_org_id      on campaign_leads(org_id);
create index if not exists idx_campaign_leads_campaign_id on campaign_leads(campaign_id);
create index if not exists idx_campaign_leads_lead_id     on campaign_leads(lead_id);
create index if not exists idx_campaign_leads_dial_state  on campaign_leads(campaign_id, dial_state, priority desc);
create index if not exists idx_campaign_leads_callback     on campaign_leads(callback_at) where dial_state = 'callback';

-- ─── call_events ─────────────────────────────────────────────
-- Fine-grained per-call state transitions and ARI events.
create table if not exists call_events (
  event_id    text primary key,
  org_id      text not null references orgs(org_id) on delete cascade,
  call_id     text not null references calls(call_id) on delete cascade,
  event_type  text not null,      -- e.g. 'dialing','answered','amd','bridged','ended','amd_result'
  payload     jsonb default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_call_events_org_id  on call_events(org_id);
create index if not exists idx_call_events_call_id on call_events(call_id);

-- ─── dispositions ────────────────────────────────────────────
create table if not exists dispositions (
  disposition_id  text primary key,
  org_id          text not null references orgs(org_id) on delete cascade,
  call_id         text not null references calls(call_id) on delete cascade,
  cl_id           text references campaign_leads(cl_id) on delete set null,
  agent_id        text references users(user_id) on delete set null,
  outcome         disposition_outcome not null,
  notes           text,
  callback_at     timestamptz,
  duration_wrap   integer,    -- wrap seconds
  metadata        jsonb default '{}'::jsonb,
  created_by      text,
  updated_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_dispositions_org_id  on dispositions(org_id);
create index if not exists idx_dispositions_call_id on dispositions(call_id);
create index if not exists idx_dispositions_agent_id on dispositions(agent_id);

-- ─── trunks ──────────────────────────────────────────────────
-- SIP trunk / provider configuration per org.
create table if not exists trunks (
  trunk_id          text primary key,
  org_id            text not null references orgs(org_id) on delete cascade,
  name              text not null,
  provider          text not null,   -- 'asterisk_pjsip', 'twilio_sip', 'telnyx_sip'
  sip_host          text,
  sip_port          integer default 5060,
  username          text,
  -- password intentionally omitted; store in external secrets manager
  max_channels      integer default 30,
  cps_limit         integer default 5,   -- calls per second
  is_active         boolean default true,
  metadata          jsonb default '{}'::jsonb,
  created_by        text,
  updated_by        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_trunks_org_id on trunks(org_id);

-- ─── recordings ──────────────────────────────────────────────
create table if not exists recordings (
  recording_id    text primary key,
  org_id          text not null references orgs(org_id) on delete cascade,
  call_id         text not null references calls(call_id) on delete cascade,
  storage_url     text not null,
  format          text default 'wav',
  duration_secs   integer,
  size_bytes      bigint,
  transcribed     boolean default false,
  transcript_url  text,
  metadata        jsonb default '{}'::jsonb,
  created_by      text,
  created_at      timestamptz default now()
);

create index if not exists idx_recordings_org_id  on recordings(org_id);
create index if not exists idx_recordings_call_id on recordings(call_id);

-- ─── Extend calls table ──────────────────────────────────────
-- Add lead-level tracking and AMD result columns if missing.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='amd_result'
  ) then
    alter table calls add column amd_result amd_result;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='cl_id'
  ) then
    alter table calls add column cl_id text references campaign_leads(cl_id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='calls' and column_name='assigned_agent'
  ) then
    alter table calls add column assigned_agent text references users(user_id) on delete set null;
  end if;
end $$;

-- ─── Updated-at triggers ─────────────────────────────────────
drop trigger if exists trg_agent_sessions_updated_at on agent_sessions;
create trigger trg_agent_sessions_updated_at before update on agent_sessions
  for each row execute function set_updated_at();

drop trigger if exists trg_campaign_leads_updated_at on campaign_leads;
create trigger trg_campaign_leads_updated_at before update on campaign_leads
  for each row execute function set_updated_at();

drop trigger if exists trg_dispositions_updated_at on dispositions;
create trigger trg_dispositions_updated_at before update on dispositions
  for each row execute function set_updated_at();

drop trigger if exists trg_trunks_updated_at on trunks;
create trigger trg_trunks_updated_at before update on trunks
  for each row execute function set_updated_at();

-- ─── Dialer queue view ───────────────────────────────────────
-- Handy view: next-to-dial leads for a campaign.
create or replace view v_dialer_queue as
select
  cl.cl_id,
  cl.org_id,
  cl.campaign_id,
  cl.lead_id,
  cl.contact_id,
  cl.phone,
  cl.dial_state,
  cl.priority,
  cl.attempts,
  cl.max_attempts,
  cl.callback_at,
  cl.assigned_agent,
  cl.last_call_id,
  c.name as campaign_name,
  c.status as campaign_status
from campaign_leads cl
join campaigns c on c.campaign_id = cl.campaign_id
where cl.dial_state in ('pending','callback')
  and cl.attempts < cl.max_attempts
  and (cl.callback_at is null or cl.callback_at <= now())
order by cl.priority desc, cl.created_at asc;
