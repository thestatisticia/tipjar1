alter table public.tipjar_tasks
  add column if not exists duration_days integer,
  add column if not exists expires_at timestamptz;

update public.tipjar_tasks
  set duration_days = coalesce(duration_days, 30),
      expires_at = coalesce(expires_at, created_at + make_interval(days => coalesce(duration_days, 30)))
  where duration_days is null or expires_at is null;

alter table public.tipjar_tasks
  drop constraint if exists tipjar_tasks_duration_days_check;
alter table public.tipjar_tasks
  add constraint tipjar_tasks_duration_days_check
  check (duration_days between 1 and 365);
alter table public.tipjar_tasks
  alter column duration_days set default 30,
  alter column duration_days set not null,
  alter column expires_at set not null;

create index if not exists tipjar_tasks_expiry_idx
  on public.tipjar_tasks (status, expires_at);

alter table public.tipjar_campaigns
  add column if not exists duration_days integer,
  add column if not exists expires_at timestamptz;

update public.tipjar_campaigns
  set duration_days = coalesce(duration_days, 30),
      expires_at = coalesce(expires_at, created_at + make_interval(days => coalesce(duration_days, 30)))
  where duration_days is null or expires_at is null;

alter table public.tipjar_campaigns
  drop constraint if exists tipjar_campaigns_duration_days_check;
alter table public.tipjar_campaigns
  add constraint tipjar_campaigns_duration_days_check
  check (duration_days between 1 and 365);
alter table public.tipjar_campaigns
  alter column duration_days set default 30,
  alter column duration_days set not null,
  alter column expires_at set not null;

create index if not exists tipjar_campaigns_expiry_idx
  on public.tipjar_campaigns (status, expires_at);
