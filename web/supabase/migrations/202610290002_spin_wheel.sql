create table if not exists public.tipjar_spin_awards (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  source_type text not null check (source_type in ('ubi_claim', 'task_completion')),
  source_ref text not null,
  prize_g numeric(18, 0) not null check (prize_g in (10, 50, 100, 200)),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payout_tx_hash text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (source_type, source_ref)
);

create index if not exists tipjar_spin_awards_wallet_created_idx
  on public.tipjar_spin_awards (lower(wallet_address), created_at desc);
create index if not exists tipjar_spin_awards_daily_budget_idx
  on public.tipjar_spin_awards (created_at, status);

create table if not exists public.tipjar_spin_auth_nonces (
  nonce uuid primary key,
  wallet_address text not null,
  issued_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.tipjar_spin_awards enable row level security;
alter table public.tipjar_spin_auth_nonces enable row level security;

create or replace function public.tipjar_reserve_spin_award(
  p_wallet_address text,
  p_source_type text,
  p_source_ref text,
  p_prize_g numeric,
  p_daily_cap_g numeric
)
returns table (award_id uuid, outcome text, prize_g numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.tipjar_spin_awards%rowtype;
  spent_today numeric;
  utc_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_source_type not in ('ubi_claim', 'task_completion')
    or p_source_ref is null
    or p_prize_g not in (10, 50, 100, 200)
    or p_daily_cap_g < 200
  then
    raise exception 'Invalid spin award reservation.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('tipjar_spin_wheel'),
    hashtext(utc_day::date::text)
  );

  select *
    into existing
    from public.tipjar_spin_awards a
    where a.source_type = p_source_type
      and a.source_ref = p_source_ref
    for update;

  if found then
    if existing.status in ('paid', 'pending') then
      return query select existing.id, 'existing'::text, existing.prize_g;
      return;
    end if;

    select coalesce(sum(a.prize_g), 0)
      into spent_today
      from public.tipjar_spin_awards a
      where a.created_at >= utc_day
        and a.status in ('pending', 'paid');

    if spent_today + existing.prize_g > p_daily_cap_g
      or spent_today + 200 > p_daily_cap_g
    then
      return query select existing.id, 'cap_reached'::text, existing.prize_g;
      return;
    end if;

    update public.tipjar_spin_awards a
      set status = 'pending', payout_tx_hash = null, paid_at = null, created_at = now()
      where a.id = existing.id;
    return query select existing.id, 'retry'::text, existing.prize_g;
    return;
  end if;

  select coalesce(sum(a.prize_g), 0)
    into spent_today
    from public.tipjar_spin_awards a
    where a.created_at >= utc_day
      and a.status in ('pending', 'paid');

  if spent_today + 200 > p_daily_cap_g
    or spent_today + p_prize_g > p_daily_cap_g
  then
    return query select null::uuid, 'cap_reached'::text, null::numeric;
    return;
  end if;

  insert into public.tipjar_spin_awards (
    wallet_address,
    source_type,
    source_ref,
    prize_g,
    status
  )
  values (
    lower(p_wallet_address),
    p_source_type,
    p_source_ref,
    p_prize_g,
    'pending'
  )
  returning id into award_id;

  return query select award_id, 'reserved'::text, p_prize_g;
end;
$$;

revoke all on function public.tipjar_reserve_spin_award(text, text, text, numeric, numeric) from public;
grant execute on function public.tipjar_reserve_spin_award(text, text, text, numeric, numeric) to service_role;
