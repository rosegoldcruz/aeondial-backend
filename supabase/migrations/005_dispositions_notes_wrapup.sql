-- ============================================================
-- Migration 005 – Dispositions, Notes, Call Attempts, Queue State
-- ============================================================
-- Builds on existing schema from 003 + 004.
-- Confirmed: leads.lead_id is TEXT, campaign_leads already exists.
--
-- New tables:
--   dialer_call_attempts  – canonical per-attempt record
--   lead_notes            – durable notes history
--   lead_disposition_events – immutable disposition audit log
--
-- Altered tables:
--   leads                 – summary fields for fast UI/queue reads
--   campaign_leads        – queue retry/callable fields
--
-- Function:
--   apply_dialer_wrap_up  – atomic disposition + notes + lead + queue update
--
-- View:
--   v_dialer_lead_wrapup_context – quick wrap-up UI context
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1) dialer_call_attempts
--    Canonical per-attempt record for every dial/originate/bridge/end.
--    Links back to the existing calls table via provider_call_id.
-- ────────────────────────────────────────────────────────────
create table if not exists public.dialer_call_attempts (
  id               uuid primary key default gen_random_uuid(),
  org_id           text not null,
  campaign_id      text null,
  lead_id          text not null,
  cl_id            text null,                    -- campaign_leads.cl_id
  call_id          text null,                    -- calls.call_id (existing table)
  agent_user_id    text null,
  agent_endpoint   text null,
  session_id       text null,
  provider         text not null default 'asterisk',
  provider_call_id text null,                    -- ARI channel ID
  provider_channel_id text null,
  provider_bridge_id  text null,
  to_number        text not null,
  from_number      text null,
  started_at       timestamptz not null default now(),
  answered_at      timestamptz null,
  bridged_at       timestamptz null,
  ended_at         timestamptz null,
  duration_seconds integer null,
  talk_seconds     integer null,
  system_outcome   text null,
  agent_disposition text null,
  wrap_up_status   text not null default 'pending',
  callback_at      timestamptz null,
  notes_count      integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint dca_system_outcome_check check (
    system_outcome is null or system_outcome in (
      'queued','originated','ringing','answered','bridged',
      'completed','busy','no_answer','failed','abandoned','canceled'
    )
  ),
  constraint dca_agent_disposition_check check (
    agent_disposition is null or agent_disposition in (
      'no_answer','voicemail','busy','wrong_number','bad_number',
      'do_not_call','callback_requested','interested','not_interested',
      'qualified','appointment_set','sale','failed','abandoned'
    )
  ),
  constraint dca_wrap_up_status_check check (
    wrap_up_status in ('pending','saved','skipped')
  ),
  constraint dca_notes_count_nonneg check (notes_count >= 0),
  constraint dca_duration_nonneg check (duration_seconds is null or duration_seconds >= 0),
  constraint dca_talk_nonneg check (talk_seconds is null or talk_seconds >= 0)
);

create index if not exists dca_org_id_idx           on public.dialer_call_attempts (org_id);
create index if not exists dca_campaign_id_idx      on public.dialer_call_attempts (campaign_id);
create index if not exists dca_lead_id_idx          on public.dialer_call_attempts (lead_id);
create index if not exists dca_cl_id_idx            on public.dialer_call_attempts (cl_id) where cl_id is not null;
create index if not exists dca_call_id_idx          on public.dialer_call_attempts (call_id) where call_id is not null;
create index if not exists dca_agent_user_id_idx    on public.dialer_call_attempts (agent_user_id);
create index if not exists dca_session_id_idx       on public.dialer_call_attempts (session_id) where session_id is not null;
create index if not exists dca_started_at_desc_idx  on public.dialer_call_attempts (started_at desc);
create index if not exists dca_callback_at_idx      on public.dialer_call_attempts (callback_at) where callback_at is not null;

drop trigger if exists trg_dca_updated_at on public.dialer_call_attempts;
create trigger trg_dca_updated_at before update on public.dialer_call_attempts
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2) lead_notes
--    Durable note history. Multiple notes per lead.
--    Optionally tied to a specific call attempt.
-- ────────────────────────────────────────────────────────────
create table if not exists public.lead_notes (
  id               uuid primary key default gen_random_uuid(),
  org_id           text not null,
  lead_id          text not null,
  campaign_id      text null,
  call_attempt_id  uuid null references public.dialer_call_attempts(id) on delete set null,
  author_user_id   text not null,
  note_type        text not null default 'call_note',
  body             text not null,
  is_pinned        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint ln_body_not_blank check (length(btrim(body)) > 0),
  constraint ln_note_type_check check (
    note_type in ('call_note','general_note','callback_note','manager_note','disposition_note')
  )
);

create index if not exists ln_org_id_idx          on public.lead_notes (org_id);
create index if not exists ln_lead_id_idx         on public.lead_notes (lead_id);
create index if not exists ln_call_attempt_id_idx on public.lead_notes (call_attempt_id) where call_attempt_id is not null;
create index if not exists ln_author_user_id_idx  on public.lead_notes (author_user_id);
create index if not exists ln_created_at_desc_idx on public.lead_notes (created_at desc);
create index if not exists ln_pinned_idx          on public.lead_notes (lead_id, is_pinned, created_at desc);

drop trigger if exists trg_ln_updated_at on public.lead_notes;
create trigger trg_ln_updated_at before update on public.lead_notes
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3) lead_disposition_events
--    Immutable audit log of every disposition decision.
-- ────────────────────────────────────────────────────────────
create table if not exists public.lead_disposition_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           text not null,
  lead_id          text not null,
  campaign_id      text null,
  call_attempt_id  uuid null references public.dialer_call_attempts(id) on delete set null,
  agent_user_id    text not null,
  disposition      text not null,
  callback_at      timestamptz null,
  note_id          uuid null references public.lead_notes(id) on delete set null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),

  constraint lde_disposition_check check (
    disposition in (
      'no_answer','voicemail','busy','wrong_number','bad_number',
      'do_not_call','callback_requested','interested','not_interested',
      'qualified','appointment_set','sale','failed','abandoned'
    )
  )
);

create index if not exists lde_org_id_idx          on public.lead_disposition_events (org_id);
create index if not exists lde_lead_id_idx         on public.lead_disposition_events (lead_id);
create index if not exists lde_call_attempt_id_idx on public.lead_disposition_events (call_attempt_id) where call_attempt_id is not null;
create index if not exists lde_agent_user_id_idx   on public.lead_disposition_events (agent_user_id);
create index if not exists lde_created_at_desc_idx on public.lead_disposition_events (created_at desc);
create index if not exists lde_callback_at_idx     on public.lead_disposition_events (callback_at) where callback_at is not null;

-- ────────────────────────────────────────────────────────────
-- 4) Extend campaign_leads with queue retry/callable fields
--    campaign_leads already exists with: cl_id, org_id, campaign_id,
--    lead_id, phone, dial_state, priority, attempts, max_attempts,
--    last_called_at, callback_at, assigned_agent, last_call_id, metadata
--    Add what's missing for proper retry/queue behavior.
-- ────────────────────────────────────────────────────────────
alter table public.campaign_leads
  add column if not exists next_retry_at          timestamptz null,
  add column if not exists last_disposition        text null,
  add column if not exists is_callable             boolean not null default true,
  add column if not exists last_call_attempt_id    uuid null,
  add column if not exists active_call_attempt_id  uuid null;

-- Expand dial_state to include new states (drop and re-add check)
alter table public.campaign_leads drop constraint if exists campaign_leads_dial_state_check;
alter table public.campaign_leads add constraint campaign_leads_dial_state_check check (
  dial_state in (
    'pending','dialing','answered','no_answer','busy',
    'failed','callback','dnc','disposed','skipped',
    'retry_scheduled','callback_pending','do_not_call','bad_number','completed'
  )
);

alter table public.campaign_leads drop constraint if exists cl_last_disposition_check;
alter table public.campaign_leads add constraint cl_last_disposition_check check (
  last_disposition is null or last_disposition in (
    'no_answer','voicemail','busy','wrong_number','bad_number',
    'do_not_call','callback_requested','interested','not_interested',
    'qualified','appointment_set','sale','failed','abandoned'
  )
);

create index if not exists idx_cl_callable
  on public.campaign_leads (campaign_id, is_callable, dial_state, next_retry_at);
create index if not exists idx_cl_next_retry
  on public.campaign_leads (next_retry_at) where next_retry_at is not null;

-- ────────────────────────────────────────────────────────────
-- 5) Extend leads with summary fields
-- ────────────────────────────────────────────────────────────
alter table public.leads
  add column if not exists last_call_attempt_id  uuid null,
  add column if not exists last_called_at        timestamptz null,
  add column if not exists last_agent_disposition text null,
  add column if not exists last_system_outcome   text null,
  add column if not exists latest_note           text null,
  add column if not exists callback_at           timestamptz null,
  add column if not exists do_not_call           boolean not null default false,
  add column if not exists attempt_count         integer not null default 0;

alter table public.leads drop constraint if exists leads_last_agent_disposition_check;
alter table public.leads add constraint leads_last_agent_disposition_check check (
  last_agent_disposition is null or last_agent_disposition in (
    'no_answer','voicemail','busy','wrong_number','bad_number',
    'do_not_call','callback_requested','interested','not_interested',
    'qualified','appointment_set','sale','failed','abandoned'
  )
);

alter table public.leads drop constraint if exists leads_last_system_outcome_check;
alter table public.leads add constraint leads_last_system_outcome_check check (
  last_system_outcome is null or last_system_outcome in (
    'queued','originated','ringing','answered','bridged',
    'completed','busy','no_answer','failed','abandoned','canceled'
  )
);

alter table public.leads drop constraint if exists leads_attempt_count_nonneg;
alter table public.leads add constraint leads_attempt_count_nonneg check (attempt_count >= 0);

-- FK from leads to dialer_call_attempts (defensive)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_last_call_attempt_id_fkey'
  ) then
    alter table public.leads
      add constraint leads_last_call_attempt_id_fkey
      foreign key (last_call_attempt_id) references public.dialer_call_attempts(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_leads_last_call_attempt on public.leads (last_call_attempt_id) where last_call_attempt_id is not null;
create index if not exists idx_leads_last_called_at    on public.leads (last_called_at desc) where last_called_at is not null;
create index if not exists idx_leads_callback_at       on public.leads (callback_at) where callback_at is not null;
create index if not exists idx_leads_do_not_call       on public.leads (do_not_call) where do_not_call = true;
create index if not exists idx_leads_last_disposition  on public.leads (last_agent_disposition) where last_agent_disposition is not null;

-- ────────────────────────────────────────────────────────────
-- 6) RLS on new tables
--    Backend service_role bypasses, but explicit tenant boundaries.
-- ────────────────────────────────────────────────────────────
alter table public.dialer_call_attempts enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_disposition_events enable row level security;

create policy dca_select_org on public.dialer_call_attempts for select
  using ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);
create policy dca_insert_org on public.dialer_call_attempts for insert
  with check ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);
create policy dca_update_org on public.dialer_call_attempts for update
  using ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id)
  with check ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);

create policy ln_select_org on public.lead_notes for select
  using ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);
create policy ln_insert_org on public.lead_notes for insert
  with check ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);
create policy ln_update_org on public.lead_notes for update
  using ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id)
  with check ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);

create policy lde_select_org on public.lead_disposition_events for select
  using ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);
create policy lde_insert_org on public.lead_disposition_events for insert
  with check ((current_setting('request.jwt.claims', true)::json->>'org_id') = org_id);

-- ────────────────────────────────────────────────────────────
-- 7) apply_dialer_wrap_up() – Atomic wrap-up function
--    Called by backend after agent submits disposition form.
--    Updates: call_attempt, lead_notes, lead_disposition_events,
--             leads summary, campaign_leads queue state.
-- ────────────────────────────────────────────────────────────
create or replace function public.apply_dialer_wrap_up(
  p_call_attempt_id uuid,
  p_agent_disposition text,
  p_notes text default null,
  p_callback_at timestamptz default null,
  p_author_user_id text default null
)
returns table (
  call_attempt_id uuid,
  lead_id text,
  campaign_id text,
  saved_disposition text,
  saved_callback_at timestamptz,
  note_id uuid
)
language plpgsql
security definer
as $$
declare
  v_attempt public.dialer_call_attempts%rowtype;
  v_note_id uuid;
  v_note_trimmed text;
  v_callback timestamptz;
begin
  -- Validate disposition
  if p_agent_disposition not in (
    'no_answer','voicemail','busy','wrong_number','bad_number',
    'do_not_call','callback_requested','interested','not_interested',
    'qualified','appointment_set','sale','failed','abandoned'
  ) then
    raise exception 'Invalid disposition: %', p_agent_disposition;
  end if;

  -- Fetch the call attempt
  select * into v_attempt
  from public.dialer_call_attempts
  where id = p_call_attempt_id;

  if not found then
    raise exception 'Call attempt not found: %', p_call_attempt_id;
  end if;

  v_note_trimmed := nullif(btrim(coalesce(p_notes, '')), '');
  v_callback := case when p_agent_disposition = 'callback_requested' then p_callback_at else null end;

  -- A) Update call attempt row
  update public.dialer_call_attempts
  set agent_disposition = p_agent_disposition,
      callback_at = v_callback,
      wrap_up_status = 'saved'
  where id = p_call_attempt_id;

  -- B) Insert note if provided
  if v_note_trimmed is not null then
    insert into public.lead_notes (
      org_id, lead_id, campaign_id, call_attempt_id,
      author_user_id, note_type, body
    ) values (
      v_attempt.org_id,
      v_attempt.lead_id,
      v_attempt.campaign_id,
      v_attempt.id,
      coalesce(p_author_user_id, v_attempt.agent_user_id, 'system'),
      case when p_agent_disposition = 'callback_requested' then 'callback_note' else 'disposition_note' end,
      v_note_trimmed
    )
    returning id into v_note_id;

    update public.dialer_call_attempts
    set notes_count = notes_count + 1
    where id = p_call_attempt_id;
  end if;

  -- C) Insert disposition audit event
  insert into public.lead_disposition_events (
    org_id, lead_id, campaign_id, call_attempt_id,
    agent_user_id, disposition, callback_at, note_id
  ) values (
    v_attempt.org_id,
    v_attempt.lead_id,
    v_attempt.campaign_id,
    v_attempt.id,
    coalesce(p_author_user_id, v_attempt.agent_user_id, 'system'),
    p_agent_disposition,
    v_callback,
    v_note_id
  );

  -- D) Update leads summary fields (leads.lead_id is TEXT)
  update public.leads
  set last_call_attempt_id = v_attempt.id,
      last_called_at = coalesce(v_attempt.ended_at, v_attempt.bridged_at, v_attempt.answered_at, v_attempt.started_at, now()),
      last_agent_disposition = p_agent_disposition,
      last_system_outcome = coalesce(v_attempt.system_outcome, last_system_outcome),
      latest_note = coalesce(v_note_trimmed, latest_note),
      callback_at = v_callback,
      do_not_call = case when p_agent_disposition = 'do_not_call' then true else do_not_call end,
      attempt_count = greatest(coalesce(attempt_count, 0) + 1, 1),
      status = case
        when p_agent_disposition = 'sale' then 'won'
        when p_agent_disposition = 'appointment_set' then 'appointment_set'
        when p_agent_disposition = 'qualified' then 'qualified'
        when p_agent_disposition = 'interested' then 'interested'
        when p_agent_disposition = 'callback_requested' then 'callback'
        when p_agent_disposition = 'do_not_call' then 'do_not_call'
        when p_agent_disposition in ('wrong_number', 'bad_number') then 'bad_number'
        when p_agent_disposition = 'not_interested' then 'not_interested'
        else status
      end
  where lead_id = v_attempt.lead_id
    and org_id = v_attempt.org_id;

  -- E) Update campaign_leads queue state (uses existing table, not a parallel one)
  update public.campaign_leads
  set last_disposition = p_agent_disposition,
      callback_at = v_callback,
      last_call_attempt_id = v_attempt.id,
      active_call_attempt_id = null,
      dial_state = case
        when p_agent_disposition = 'callback_requested' then 'callback'
        when p_agent_disposition = 'do_not_call' then 'dnc'
        when p_agent_disposition in ('bad_number', 'wrong_number') then 'disposed'
        when p_agent_disposition in ('sale', 'appointment_set', 'qualified', 'interested', 'not_interested') then 'disposed'
        when p_agent_disposition in ('no_answer', 'voicemail', 'busy', 'failed', 'abandoned') then 'retry_scheduled'
        else dial_state
      end,
      is_callable = case
        when p_agent_disposition in ('do_not_call', 'bad_number', 'wrong_number', 'sale', 'appointment_set') then false
        when p_agent_disposition = 'callback_requested' then false
        when p_agent_disposition in ('interested', 'qualified') then false
        else true
      end,
      next_retry_at = case
        when p_agent_disposition = 'busy' then now() + interval '15 minutes'
        when p_agent_disposition = 'no_answer' then now() + interval '2 hours'
        when p_agent_disposition = 'voicemail' then now() + interval '1 day'
        when p_agent_disposition = 'failed' then now() + interval '30 minutes'
        when p_agent_disposition = 'abandoned' then now() + interval '30 minutes'
        when p_agent_disposition = 'callback_requested' then p_callback_at
        else null
      end
  where cl_id = v_attempt.cl_id
    and org_id = v_attempt.org_id;

  return query
  select v_attempt.id,
         v_attempt.lead_id,
         v_attempt.campaign_id,
         p_agent_disposition,
         v_callback,
         v_note_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 8) Wrap-up context view
--    Joins leads + contacts (for name/phone) + campaign_leads.
-- ────────────────────────────────────────────────────────────
create or replace view public.v_dialer_lead_wrapup_context as
select
  l.lead_id,
  l.org_id,
  c.first_name,
  c.last_name,
  c.phone,
  l.status,
  l.last_call_attempt_id,
  l.last_called_at,
  l.last_agent_disposition,
  l.last_system_outcome,
  l.latest_note,
  l.callback_at,
  l.do_not_call,
  l.attempt_count,
  cl.campaign_id,
  cl.cl_id,
  cl.dial_state,
  cl.next_retry_at,
  cl.is_callable,
  cl.last_disposition as queue_last_disposition,
  cl.last_call_attempt_id as queue_last_call_attempt_id
from public.leads l
left join public.contacts c
  on c.contact_id = l.contact_id
  and c.org_id = l.org_id
left join public.campaign_leads cl
  on cl.lead_id = l.lead_id
  and cl.org_id = l.org_id;

commit;
