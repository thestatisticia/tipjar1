create table if not exists public.tipjar_tips (
  id uuid primary key default gen_random_uuid(),
  creator_username text not null,
  sender_name text not null default 'Anonymous Fan',
  sender_address text not null,
  amount numeric(38, 18) not null check (amount > 0),
  message text not null default '',
  tx_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists tipjar_tips_creator_created_idx
  on public.tipjar_tips (lower(creator_username), created_at desc);
create index if not exists tipjar_tips_sender_created_idx
  on public.tipjar_tips (lower(sender_address), created_at desc);

alter table public.tipjar_tips enable row level security;
