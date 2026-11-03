create table if not exists public.tipjar_tasks (
  id uuid primary key default gen_random_uuid(),
  escrow_task_id text not null unique,
  creator_address text not null,
  title text not null,
  description text not null,
  requirements text not null,
  reward_per_completion numeric(78, 0) not null check (reward_per_completion > 0),
  slots integer not null check (slots > 0),
  escrow_tx_hash text not null unique,
  status text not null default 'open' check (status in ('open', 'closed', 'filled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tipjar_tasks_status_created_idx
  on public.tipjar_tasks (status, created_at desc);
create index if not exists tipjar_tasks_creator_idx
  on public.tipjar_tasks (lower(creator_address));

create table if not exists public.tipjar_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tipjar_tasks(id) on delete cascade,
  worker_address text not null,
  proof_text text not null default '',
  proof_url text not null default '',
  proof_storage_path text not null default '',
  reservation_tx_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  review_tx_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, worker_address)
);

create index if not exists tipjar_task_submissions_status_idx
  on public.tipjar_task_submissions (status, created_at);
create index if not exists tipjar_task_submissions_worker_idx
  on public.tipjar_task_submissions (lower(worker_address));

create table if not exists public.tipjar_task_auth_nonces (
  nonce uuid primary key,
  wallet_address text not null,
  issued_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.tipjar_tasks enable row level security;
alter table public.tipjar_task_submissions enable row level security;
alter table public.tipjar_task_auth_nonces enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tipjar-task-proofs', 'tipjar-task-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
