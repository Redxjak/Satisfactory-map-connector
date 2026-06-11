create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  owner_key uuid not null default gen_random_uuid(),
  code_hash text not null unique,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  owner_key uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.server_connections
  add column if not exists owner_key uuid;

alter table public.server_connections
  alter column user_id drop not null;

alter table public.save_snapshots
  add column if not exists owner_key uuid;

alter table public.save_snapshots
  alter column user_id drop not null;

create index if not exists access_codes_owner_key_idx on public.access_codes(owner_key);
create index if not exists app_sessions_token_hash_idx on public.app_sessions(token_hash);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);
create index if not exists server_connections_owner_key_idx on public.server_connections(owner_key);
create index if not exists save_snapshots_owner_key_idx on public.save_snapshots(owner_key);

alter table public.access_codes enable row level security;
alter table public.app_sessions enable row level security;
