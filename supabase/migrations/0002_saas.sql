-- Email Hub: SaaS layer (roles, admin settings, invitations, per-user AI integrations)
-- Run after 0001_initial.sql.

-- ---------------------------------------------------------------------------
-- Profiles: roles, status, permissions, onboarding
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'member',
  add column if not exists status text not null default 'active',
  add column if not exists can_create_api_keys boolean not null default false,
  add column if not exists tour_completed_at timestamptz,
  add column if not exists onboarding jsonb not null default '{}'::jsonb,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'member'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active', 'disabled'));

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Global settings (single row, admin-managed)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'Email Hub',
  allow_self_signup boolean not null default false,
  allow_platform_ai boolean not null default true,
  default_can_create_api_keys boolean not null default false,
  invitation_expiry_days int not null default 7 check (invitation_expiry_days between 1 and 90),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Invitations / password-reset links (no email delivery needed - admin shares the link)
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'invite' check (kind in ('invite', 'reset')),
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  can_create_api_keys boolean not null default false,
  target_user_id uuid references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations (lower(email));
create index if not exists invitations_created_idx on public.invitations (created_at desc);

-- ---------------------------------------------------------------------------
-- Per-user AI integrations (bring your own LLM key)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google', 'openai_compatible')),
  label text not null,
  model text not null,
  api_key_enc text not null,
  key_hint text,
  base_url text,
  is_default boolean not null default false,
  enabled boolean not null default true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_integrations_user_idx on public.ai_integrations(user_id);
create unique index if not exists ai_integrations_one_default_idx on public.ai_integrations(user_id) where is_default;
drop trigger if exists set_updated_at on public.ai_integrations;
create trigger set_updated_at before update on public.ai_integrations for each row execute procedure public.set_updated_at();

alter table public.email_analyses add column if not exists provider text;
alter table public.assistant_conversations add column if not exists provider text;
alter table public.assistant_conversations add column if not exists model text;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.role = 'admin' and p.status = 'active' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- New-user hook: first user becomes admin; afterwards sign-ups need an invitation unless
-- self sign-up is enabled in app_settings. Raises to block the sign-up otherwise.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_settings public.app_settings%rowtype;
  v_invite public.invitations%rowtype;
  v_role text := 'member';
  v_can_keys boolean := false;
begin
  select count(*) into v_count from public.profiles;
  select * into v_settings from public.app_settings where id = 1;
  select * into v_invite
    from public.invitations
   where lower(email) = lower(new.email)
     and kind = 'invite'
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   order by created_at desc
   limit 1;

  if v_count = 0 then
    v_role := 'admin';
    v_can_keys := true;
  elsif v_invite.id is not null then
    v_role := v_invite.role;
    v_can_keys := v_invite.can_create_api_keys;
  elsif coalesce(v_settings.allow_self_signup, false) then
    v_can_keys := coalesce(v_settings.default_can_create_api_keys, false);
  else
    raise exception 'SIGNUP_DISABLED: sign-ups are by invitation only' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, full_name, role, can_create_api_keys, invited_by)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', v_role, v_can_keys, v_invite.created_by)
  on conflict (id) do nothing;
  return new;
end; $$;

-- Keep profile email in sync when the auth email changes.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end; $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.invitations enable row level security;
alter table public.ai_integrations enable row level security;

drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles for select using (public.is_admin());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings for select using (auth.uid() is not null);
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invitations_admin" on public.invitations;
create policy "invitations_admin" on public.invitations for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ai_integrations_own" on public.ai_integrations;
create policy "ai_integrations_own" on public.ai_integrations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin overview helper (counts per user) - security invoker, guarded by is_admin()
create or replace function public.admin_user_stats()
returns table(user_id uuid, accounts bigint, emails bigint, api_keys bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(*) from public.connected_accounts a where a.user_id = p.id),
         (select count(*) from public.emails e where e.user_id = p.id),
         (select count(*) from public.api_keys k where k.user_id = p.id and k.revoked_at is null)
  from public.profiles p
  where public.is_admin();
$$;
