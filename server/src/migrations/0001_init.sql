-- Core scheduling schema: accounts, projects, queues, jobs, executions, DLQ.

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- A project's creator is auto-added here as 'admin'. Additional members can be
-- invited (by email, must already have an account) as 'admin' or 'viewer'.
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

insert into project_members (project_id, user_id, role)
select id, user_id, 'admin' from projects
on conflict (project_id, user_id) do nothing;

create table if not exists queues (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  name                text not null,
  concurrency_limit   int not null default 5 check (concurrency_limit > 0),
  retry_strategy      text not null default 'exponential'
                        check (retry_strategy in ('fixed', 'linear', 'exponential')),
  retry_base_delay_ms int not null default 1000 check (retry_base_delay_ms >= 0),
  max_attempts        int not null default 3 check (max_attempts >= 1),
  is_paused           boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists workers (
  id                uuid primary key,
  hostname          text not null,
  pid               int not null,
  status            text not null default 'active'
                      check (status in ('active', 'draining', 'stopped')),
  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  queue_id      uuid not null references queues(id) on delete cascade,
  type          text not null default 'immediate'
                  check (type in ('immediate', 'delayed', 'scheduled', 'recurring', 'batch')),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued'
                  check (status in ('queued', 'scheduled', 'claimed', 'running',
                                    'completed', 'failed', 'dead_letter')),
  priority      int not null default 0,
  run_at        timestamptz not null default now(),
  cron_expr     text,
  attempt_count int not null default 0,
  max_attempts  int not null,
  worker_id     uuid references workers(id) on delete set null,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Hot path for the worker claim query: filter by queue + status, order by priority/run_at.
create index if not exists idx_jobs_claim on jobs (queue_id, status, priority desc, run_at);
create index if not exists idx_jobs_due on jobs (status, run_at);

create table if not exists job_executions (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  worker_id   uuid references workers(id) on delete set null,
  attempt     int not null,
  status      text not null check (status in ('running', 'completed', 'failed')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  error       text
);

create index if not exists idx_executions_job on job_executions (job_id);

create table if not exists dead_letter_jobs (
  id              uuid primary key default gen_random_uuid(),
  original_job_id uuid not null,
  queue_id        uuid not null references queues(id) on delete cascade,
  payload         jsonb not null,
  failure_reason  text,
  attempts        int not null,
  moved_at        timestamptz not null default now()
);

create index if not exists idx_dlq_queue on dead_letter_jobs (queue_id);
