-- Email Hub: OAuth connector credentials managed in-app by administrators
-- (Google / Microsoft client id + secret). Falls back to environment variables when absent.

create table if not exists public.oauth_connectors (
  provider public.provider_type primary key,
  client_id text not null,
  client_secret_enc text not null,
  tenant text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.oauth_connectors enable row level security;
drop policy if exists "oauth_connectors_admin" on public.oauth_connectors;
create policy "oauth_connectors_admin" on public.oauth_connectors
  for all using (public.is_admin()) with check (public.is_admin());
