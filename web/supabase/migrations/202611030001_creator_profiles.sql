create table if not exists public.tipjar_creators (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  wallet_address text not null unique,
  name text not null default '',
  bio text not null default '',
  youtube text not null default '',
  twitter text not null default '',
  avatar_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tipjar_creators_wallet_address_idx
  on public.tipjar_creators (lower(wallet_address));

alter table public.tipjar_creators enable row level security;
