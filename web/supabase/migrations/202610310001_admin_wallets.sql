create table if not exists public.tipjar_admin_wallets (
  wallet_address text primary key,
  added_by text not null,
  created_at timestamptz not null default now(),
  check (wallet_address = lower(wallet_address)),
  check (added_by = lower(added_by))
);

alter table public.tipjar_admin_wallets enable row level security;
revoke all on table public.tipjar_admin_wallets from anon, authenticated;
grant all on table public.tipjar_admin_wallets to service_role;
