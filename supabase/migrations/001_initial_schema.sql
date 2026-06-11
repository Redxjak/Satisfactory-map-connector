create table if not exists public.allowed_users (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint allowed_users_email_lowercase check (email = lower(email))
);

create table if not exists public.server_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  host text not null,
  port integer not null default 22 check (port between 1 and 65535),
  username text not null,
  remote_dir text not null,
  active boolean not null default true,
  credentials_encrypted jsonb not null,
  latest_save_name text,
  latest_save_bytes bigint,
  latest_save_modified_at timestamptz,
  latest_storage_path text,
  last_pulled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.save_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.server_connections(id) on delete cascade,
  save_name text not null,
  save_bytes bigint not null,
  save_modified_at timestamptz not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists server_connections_set_updated_at on public.server_connections;
create trigger server_connections_set_updated_at
before update on public.server_connections
for each row execute function public.set_updated_at();

alter table public.allowed_users enable row level security;
alter table public.server_connections enable row level security;
alter table public.save_snapshots enable row level security;

drop policy if exists "allowed users can read themselves" on public.allowed_users;
create policy "allowed users can read themselves"
on public.allowed_users
for select
to authenticated
using (email = lower((select auth.jwt() ->> 'email')));

drop policy if exists "users can read own connections" on public.server_connections;
create policy "users can read own connections"
on public.server_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can read own snapshots" on public.save_snapshots;
create policy "users can read own snapshots"
on public.save_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('saves', 'saves', false)
on conflict (id) do nothing;

-- Add invited users manually, for example:
-- insert into public.allowed_users (email) values ('player@example.com')
-- on conflict (email) do nothing;
