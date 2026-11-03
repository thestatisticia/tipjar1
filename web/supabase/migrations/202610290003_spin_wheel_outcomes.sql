alter table public.tipjar_spin_awards
  drop constraint if exists tipjar_spin_awards_prize_g_check;

alter table public.tipjar_spin_awards
  add constraint tipjar_spin_awards_prize_g_check
  check (prize_g in (0, 10, 20, 50, 100, 200));

alter table public.tipjar_spin_awards
  add column if not exists outcome text;

update public.tipjar_spin_awards
  set outcome = case prize_g
    when 0 then 'zero'
    when 10 then '10_g'
    when 20 then '20_g'
    when 50 then '50_g'
    when 100 then '100_g'
    when 200 then '200_g'
  end
  where outcome is null;

alter table public.tipjar_spin_awards
  alter column outcome set not null,
  alter column outcome set default '10_g';

alter table public.tipjar_spin_awards
  add constraint tipjar_spin_awards_outcome_check
  check (
    (outcome in ('zero', 'good_luck') and prize_g = 0)
    or (outcome = '10_g' and prize_g = 10)
    or (outcome = '20_g' and prize_g = 20)
    or (outcome = '50_g' and prize_g = 50)
    or (outcome = '100_g' and prize_g = 100)
    or (outcome = '200_g' and prize_g = 200)
  );

drop function if exists public.tipjar_reserve_spin_award(text, text, text, numeric, numeric);

create or replace function public.tipjar_reserve_spin_award(
  p_wallet_address text,
  p_source_type text,
  p_source_ref text,
  p_outcome text,
  p_prize_g numeric,
  p_daily_cap_g numeric
)
returns table (award_id uuid, reservation_status text, prize_g numeric, outcome text)
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
    or not (
      (p_outcome in ('zero', 'good_luck') and p_prize_g = 0)
      or (p_outcome = '10_g' and p_prize_g = 10)
      or (p_outcome = '20_g' and p_prize_g = 20)
      or (p_outcome = '50_g' and p_prize_g = 50)
      or (p_outcome = '100_g' and p_prize_g = 100)
      or (p_outcome = '200_g' and p_prize_g = 200)
    )
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
      return query select existing.id, 'existing'::text, existing.prize_g, existing.outcome;
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
      return query select existing.id, 'cap_reached'::text, existing.prize_g, existing.outcome;
      return;
    end if;

    update public.tipjar_spin_awards a
      set status = 'pending', payout_tx_hash = null, paid_at = null, created_at = now()
      where a.id = existing.id;
    return query select existing.id, 'retry'::text, existing.prize_g, existing.outcome;
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
    return query select null::uuid, 'cap_reached'::text, null::numeric, null::text;
    return;
  end if;

  insert into public.tipjar_spin_awards (
    wallet_address,
    source_type,
    source_ref,
    outcome,
    prize_g,
    status
  )
  values (
    lower(p_wallet_address),
    p_source_type,
    p_source_ref,
    p_outcome,
    p_prize_g,
    'pending'
  )
  returning id into award_id;

  return query select award_id, 'reserved'::text, p_prize_g, p_outcome;
end;
$$;

revoke all on function public.tipjar_reserve_spin_award(text, text, text, text, numeric, numeric) from public;
grant execute on function public.tipjar_reserve_spin_award(text, text, text, text, numeric, numeric) to service_role;
