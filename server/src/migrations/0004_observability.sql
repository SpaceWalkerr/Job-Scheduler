-- Observability: worker heartbeat history and per-job log lines.

-- Append-only heartbeat history (the workers row keeps only the latest ping). The worker
-- prunes its own rows older than an hour, so retention stays bounded.
create table if not exists worker_heartbeats (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  active_jobs  int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_heartbeats_worker on worker_heartbeats (worker_id, created_at desc);

-- Human-readable log lines emitted while a job runs (claim, start, success, failure,
-- retry-scheduled, dead-letter). Separate from job_executions (the metrics/attempt record)
-- so a single attempt can emit many log lines.
create table if not exists job_logs (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  execution_id uuid references job_executions(id) on delete set null,
  attempt      int,
  level        text not null default 'info' check (level in ('info', 'warn', 'error')),
  message      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_logs_job on job_logs (job_id, created_at);
