-- Email Hub initial schema
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.provider_type as enum ('google', 'microsoft');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'needs_reauth', 'disabled', 'error');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles (mirror of auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Connected mailbox accounts (Gmail / Outlook). Tokens are AES-256-GCM encrypted by the app.
-- ---------------------------------------------------------------------------
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.provider_type not null,
  provider_account_id text not null,
  email text not null,
  display_name text,
  avatar_url text,
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  sync_state jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_calendar_synced_at timestamptz,
  status public.account_status not null default 'active',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, email)
);
create index if not exists connected_accounts_user_idx on public.connected_accounts(user_id);

-- ---------------------------------------------------------------------------
-- Emails (normalized across providers)
-- ---------------------------------------------------------------------------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider_message_id text not null,
  thread_id text,
  internet_message_id text,
  in_reply_to text,
  references_header text,
  subject text,
  from_name text,
  from_email text,
  to_recipients jsonb not null default '[]'::jsonb,
  cc_recipients jsonb not null default '[]'::jsonb,
  bcc_recipients jsonb not null default '[]'::jsonb,
  reply_to text,
  snippet text,
  body_text text,
  body_html text,
  received_at timestamptz,
  sent_at timestamptz,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  is_draft boolean not null default false,
  is_sent boolean not null default false,
  has_attachments boolean not null default false,
  labels text[] not null default '{}',
  folder text,
  importance text,
  web_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);
create index if not exists emails_user_received_idx on public.emails(user_id, received_at desc);
create index if not exists emails_account_idx on public.emails(account_id);
create index if not exists emails_thread_idx on public.emails(user_id, thread_id);
create index if not exists emails_from_idx on public.emails(user_id, from_email);
create index if not exists emails_unread_idx on public.emails(user_id, is_read) where is_read = false;

alter table public.emails
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(subject, '') || ' ' ||
      coalesce(from_name, '') || ' ' ||
      coalesce(from_email, '') || ' ' ||
      coalesce(snippet, '') || ' ' ||
      left(coalesce(body_text, ''), 20000)
    )
  ) stored;
create index if not exists emails_search_idx on public.emails using gin(search_vector);

-- ---------------------------------------------------------------------------
-- AI analysis per email
-- ---------------------------------------------------------------------------
create table if not exists public.email_analyses (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null unique references public.emails(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  priority text,
  sentiment text,
  intent text,
  summary text,
  action_items jsonb not null default '[]'::jsonb,
  entities jsonb not null default '{}'::jsonb,
  requires_response boolean not null default false,
  suggested_reply text,
  language text,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index if not exists email_analyses_user_idx on public.email_analyses(user_id);
create index if not exists email_analyses_category_idx on public.email_analyses(user_id, category);
create index if not exists email_analyses_priority_idx on public.email_analyses(user_id, priority);

-- ---------------------------------------------------------------------------
-- Calendar events (normalized)
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider_event_id text not null,
  calendar_id text,
  title text,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text,
  all_day boolean not null default false,
  attendees jsonb not null default '[]'::jsonb,
  organizer_email text,
  organizer_name text,
  status text,
  meeting_link text,
  web_link text,
  created_by_hub boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_event_id)
);
create index if not exists calendar_events_user_start_idx on public.calendar_events(user_id, start_at);

-- ---------------------------------------------------------------------------
-- API keys for external integrations (e.g. Base44 superagent). Only a SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys(user_id);

create table if not exists public.api_request_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  method text not null,
  path text not null,
  status int,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists api_request_logs_key_idx on public.api_request_logs(api_key_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI assistant conversations
-- ---------------------------------------------------------------------------
create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  source text not null default 'ui',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_conversations_user_idx on public.assistant_conversations(user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  display_text text,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_conv_idx on public.assistant_messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Sync logs
-- ---------------------------------------------------------------------------
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  emails_synced int not null default 0,
  events_synced int not null default 0,
  analyses_run int not null default 0,
  error text
);
create index if not exists sync_logs_account_idx on public.sync_logs(account_id, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['connected_accounts', 'emails', 'calendar_events', 'assistant_conversations']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: every row is owned by user_id
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.emails enable row level security;
alter table public.email_analyses enable row level security;
alter table public.calendar_events enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_request_logs enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.sync_logs enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['connected_accounts', 'emails', 'email_analyses', 'calendar_events', 'api_keys', 'api_request_logs', 'assistant_conversations', 'assistant_messages', 'sync_logs']
  loop
    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format('create policy "%s_own" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Analytics helpers
-- ---------------------------------------------------------------------------
create or replace function public.email_volume_by_day(p_user_id uuid, p_days int default 30)
returns table(day date, received bigint, sent bigint)
language sql stable security invoker as $$
  select d::date as day,
         count(e.id) filter (where e.is_sent = false) as received,
         count(e.id) filter (where e.is_sent = true) as sent
  from generate_series((now() - make_interval(days => p_days - 1))::date, now()::date, interval '1 day') d
  left join public.emails e
    on e.user_id = p_user_id
   and e.received_at >= d
   and e.received_at < d + interval '1 day'
  group by d
  order by d;
$$;

create or replace function public.top_senders(p_user_id uuid, p_days int default 30, p_limit int default 10)
returns table(from_email text, from_name text, total bigint, unread bigint)
language sql stable security invoker as $$
  select e.from_email, max(e.from_name) as from_name, count(*) as total,
         count(*) filter (where e.is_read = false) as unread
  from public.emails e
  where e.user_id = p_user_id
    and e.is_sent = false
    and e.from_email is not null
    and e.received_at >= now() - make_interval(days => p_days)
  group by e.from_email
  order by total desc
  limit p_limit;
$$;
