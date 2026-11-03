create table if not exists public.tipjar_campaigns (
  id uuid primary key default gen_random_uuid(),
  escrow_campaign_id text not null unique,
  creator_address text not null,
  title text not null,
  description text not null,
  requirements text not null,
  budget numeric(78, 0) not null check (budget > 0),
  reward_per_participant numeric(78, 0) not null check (reward_per_participant > 0),
  max_participants integer not null check (max_participants > 0),
  escrow_tx_hash text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tipjar_campaigns_status_created_idx
  on public.tipjar_campaigns (status, created_at desc);
create index if not exists tipjar_campaigns_creator_idx
  on public.tipjar_campaigns (lower(creator_address));

create table if not exists public.tipjar_campaign_applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.tipjar_campaigns(id) on delete cascade,
  participant_address text not null,
  application_text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  review_note text not null default '',
  review_tx_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, participant_address)
);

create index if not exists tipjar_campaign_applications_status_idx
  on public.tipjar_campaign_applications (status, created_at);
create index if not exists tipjar_campaign_applications_participant_idx
  on public.tipjar_campaign_applications (lower(participant_address));

create table if not exists public.tipjar_campaign_content (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.tipjar_campaign_applications(id) on delete cascade,
  content_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  review_tx_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tipjar_campaign_content_status_idx
  on public.tipjar_campaign_content (status, created_at);

create table if not exists public.tipjar_campaign_auth_nonces (
  nonce uuid primary key,
  wallet_address text not null,
  issued_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.tipjar_campaigns enable row level security;
alter table public.tipjar_campaign_applications enable row level security;
alter table public.tipjar_campaign_content enable row level security;
alter table public.tipjar_campaign_auth_nonces enable row level security;
