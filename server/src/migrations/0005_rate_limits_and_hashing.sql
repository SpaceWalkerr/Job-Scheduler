-- Rate limits and consistent hashing

-- Token bucket for rate limiting at the queue level
alter table queues add column if not exists rate_limit_per_minute int check (rate_limit_per_minute > 0);
alter table queues add column if not exists tokens float not null default 0;
alter table queues add column if not exists last_refill_at timestamptz not null default now();

-- Affinity key for consistent hashing (routing jobs to specific workers)
alter table jobs add column if not exists affinity_key text;
