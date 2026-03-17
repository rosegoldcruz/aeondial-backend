create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists orgs (
  org_id text primary key,
  name text not null,
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users (
  user_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  email text not null,
  full_name text,
  role text default 'member',
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, email)
);

create table if not exists contacts (
  contact_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists campaigns (
  campaign_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  name text not null,
  status text default 'draft',
  channel text default 'voice',
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists leads (
  lead_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  contact_id text references contacts(contact_id) on delete set null,
  campaign_id text references campaigns(campaign_id) on delete set null,
  status text default 'new',
  stage text,
  score numeric,
  estimated_value numeric,
  source text,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists phone_numbers (
  phone_number_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  campaign_id text references campaigns(campaign_id) on delete set null,
  e164 text not null,
  provider text,
  capability jsonb default '{}'::jsonb,
  status text default 'active',
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, e164)
);

create table if not exists calls (
  call_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  campaign_id text references campaigns(campaign_id) on delete set null,
  lead_id text references leads(lead_id) on delete set null,
  contact_id text references contacts(contact_id) on delete set null,
  phone_number_id text references phone_numbers(phone_number_id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ai_settings (
  ai_settings_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  campaign_id text references campaigns(campaign_id) on delete cascade,
  llm_provider text,
  tts_provider text,
  stt_provider text,
  voice_id text,
  model_id text,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, campaign_id)
);

create table if not exists ai_events (
  ai_event_id text primary key,
  org_id text not null references orgs(org_id) on delete cascade,
  campaign_id text references campaigns(campaign_id) on delete set null,
  call_id text references calls(call_id) on delete set null,
  event_type text not null check (event_type in ('transcript', 'summary', 'disposition', 'appointment', 'transfer', 'error')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz default now(),
  created_by text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_users_org_id on users(org_id);
create index if not exists idx_contacts_org_id on contacts(org_id);
create index if not exists idx_leads_org_id on leads(org_id);
create index if not exists idx_campaigns_org_id on campaigns(org_id);
create index if not exists idx_phone_numbers_org_id on phone_numbers(org_id);
create index if not exists idx_calls_org_id on calls(org_id);
create index if not exists idx_calls_campaign_id on calls(campaign_id);
create index if not exists idx_calls_contact_id on calls(contact_id);
create index if not exists idx_ai_settings_org_id on ai_settings(org_id);
create index if not exists idx_ai_settings_campaign_id on ai_settings(campaign_id);
create index if not exists idx_ai_events_org_id on ai_events(org_id);
create index if not exists idx_ai_events_call_id on ai_events(call_id);
create index if not exists idx_ai_events_event_type on ai_events(event_type);

drop trigger if exists trg_orgs_updated_at on orgs;
create trigger trg_orgs_updated_at before update on orgs
for each row execute function set_updated_at();

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
for each row execute function set_updated_at();

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at before update on contacts
for each row execute function set_updated_at();

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at before update on leads
for each row execute function set_updated_at();

drop trigger if exists trg_campaigns_updated_at on campaigns;
create trigger trg_campaigns_updated_at before update on campaigns
for each row execute function set_updated_at();

drop trigger if exists trg_phone_numbers_updated_at on phone_numbers;
create trigger trg_phone_numbers_updated_at before update on phone_numbers
for each row execute function set_updated_at();

drop trigger if exists trg_calls_updated_at on calls;
create trigger trg_calls_updated_at before update on calls
for each row execute function set_updated_at();

drop trigger if exists trg_ai_settings_updated_at on ai_settings;
create trigger trg_ai_settings_updated_at before update on ai_settings
for each row execute function set_updated_at();

drop trigger if exists trg_ai_events_updated_at on ai_events;
create trigger trg_ai_events_updated_at before update on ai_events
for each row execute function set_updated_at();
