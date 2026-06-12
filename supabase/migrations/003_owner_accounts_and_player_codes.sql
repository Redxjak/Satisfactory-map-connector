create table if not exists public.owner_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_accounts_email_lowercase check (email = lower(email))
);

create table if not exists public.owner_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.access_codes
  add column if not exists role text not null default 'player';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_codes_role_check'
      and conrelid = 'public.access_codes'::regclass
  ) then
    alter table public.access_codes
      add constraint access_codes_role_check check (role in ('owner', 'player'));
  end if;
end $$;

create index if not exists owner_accounts_email_idx on public.owner_accounts(email);
create index if not exists owner_sessions_token_hash_idx on public.owner_sessions(token_hash);
create index if not exists owner_sessions_expires_at_idx on public.owner_sessions(expires_at);
create index if not exists access_codes_role_idx on public.access_codes(role);

alter table public.owner_accounts enable row level security;
alter table public.owner_sessions enable row level security;
