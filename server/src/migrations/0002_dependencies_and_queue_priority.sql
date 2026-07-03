-- Workflow dependencies and queue-level priority.

-- A nullable self-reference: a job only becomes eligible once its dependency completes.
-- ON DELETE SET NULL so deleting a dependency unblocks rather than orphans the row.
alter table jobs add column if not exists depends_on_job_id uuid references jobs(id) on delete set null;

-- Partial index keeps the dependency join in the claim query cheap.
create index if not exists idx_jobs_depends_on on jobs (depends_on_job_id) where depends_on_job_id is not null;

-- Queue-level priority: higher-priority queues are served first when workers fill slots.
alter table queues add column if not exists priority int not null default 0;
