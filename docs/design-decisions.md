# Design Decisions

## Postgres `SKIP LOCKED` instead of Redis / a dedicated queue

The core requirement is that a job is never executed twice. Rather than pull in Redis or an
external broker, the claim is done in Postgres with `FOR UPDATE SKIP LOCKED`:

```sql
update jobs set status = 'claimed', worker_id = $1
where id in (
  select j.id from jobs j
  left join jobs dep on dep.id = j.depends_on_job_id
  where j.queue_id = $2 and j.status = 'queued' and j.run_at <= now()
    and (j.depends_on_job_id is null or dep.status = 'completed')
  order by j.priority desc, j.run_at
  limit $3
  for update of j skip locked
)
returning *;
```

`SKIP LOCKED` lets many workers poll the same queue concurrently: each locks and takes rows
the others aren't touching, with no blocking and no double-claims. This keeps the whole
system on one dependency (the database), which is the right call at this scale.
`test:claim` proves it — 300 jobs, 10 concurrent claimers, zero duplicates.

The `LEFT JOIN` supports workflow dependencies (see below): a job only becomes claimable
once its dependency has completed. `FOR UPDATE OF j` — not a plain `FOR UPDATE` — is
required here: without `OF j`, Postgres would also try to lock the joined dependency rows,
which are only being *read*, not claimed. Locking them would let two jobs that happen to
share a dependency block each other's claim attempts for no reason.

**Trade-off:** polling has a small latency floor (the poll interval) and the queue table is
the throughput ceiling. At much larger scale a purpose-built broker or `LISTEN/NOTIFY` to
wake workers would reduce idle polling — but that complexity isn't warranted here.

## Single process for API + worker + scheduler

Everything runs in one Node process so the project starts with one command. The worker and
scheduler are isolated modules that only depend on the database, so splitting the worker
into its own process (or running several) needs no API changes — you'd just run a second
entrypoint that calls `startWorker()`. Concurrency is still enforced correctly because the
free-slot check and claim both go through the shared `jobs` table.

## WebSockets for push, polling as the fallback — not one or the other

The dashboard uses both. A WebSocket at `/ws` pushes a coarse event (`{"type": "jobs"}`,
`"queues"`, `"workers"`, or `"projects"`) whenever something in that category changes — job
claimed/completed/failed, queue paused, worker registered, member invited. The client
doesn't trust the socket alone, though: `usePolling` keeps its interval running (relaxed to
8–30s now that push handles the common case) as a safety net if the socket is dropped,
blocked by a proxy, or briefly disconnected. This is why job status changes appear in well
under a second in normal operation, while the dashboard still degrades gracefully — never
silently stops updating — if WebSockets aren't available at all.

The payload is deliberately just a category name, not the changed data itself. The client
re-fetches via the normal authenticated REST endpoints, so the WebSocket layer never needs
to duplicate the per-row RBAC checks that already live in the route handlers — it's a "go
refresh" signal, not a data channel.

## Role-based access control: project membership, not a global user flag

Each project has members (`project_members`: project_id, user_id, role). The creator is
auto-added as `admin`; an admin can invite any other registered user by email as `admin` or
`viewer`. Viewers can read everything in a project — queues, jobs, executions, members — but
every mutating endpoint (create/pause a queue, submit/retry a job, invite/remove a member)
checks the caller's role and returns `403` for viewers.

This was chosen over a simpler global `users.role` column because a flag on the user alone
doesn't model anything real: in a schema where projects belong to a single owner, a "viewer"
account would just have its own empty projects. Project-level membership is what actually
lets a company share one dashboard across people with different permission levels, which is
the point of RBAC in a tool like this.

## Workflow dependencies: gate the claim, don't chain the jobs

A job can carry `depends_on_job_id`, checked at both submission time (the dependency must
exist and belong to a project the caller is a member of) and claim time (see the `SKIP
LOCKED` section above). A blocked job's `status` stays `queued` in the database — it's
"blocked" only in the sense that the claim query skips it — so no new status value or state
machine transition was needed. The dashboard computes "blocked" client-side by comparing
`depends_on_status` (joined in on read) against the job's own status.

**Scope:** this supports a single dependency per job, not an arbitrary DAG. A chain (A → B →
C) works because each link only cares about its immediate predecessor, but there's no cycle
detection — creating a dependency loop would deadlock two jobs against each other forever.
For this project's scope that's an accepted limitation rather than a bug: a full DAG
scheduler with cycle detection is a meaningfully larger feature.

## Distributed locking: Postgres advisory lock for scheduler leader election

If more than one server instance runs the scheduler tick loop, two instances could both see
the same due recurring job and spawn two children before either advances `run_at` — a real
race, not a theoretical one. `leader.ts` uses `pg_try_advisory_lock` to make leadership
exclusive: each instance checks out a dedicated pooled connection and tries to acquire a
fixed lock key. Whichever instance succeeds runs `tick()`; the rest retry every 10s and stay
idle otherwise. Because advisory locks are tied to the session that holds them, a crashed
leader's connection drops and Postgres releases the lock automatically — the next standby's
retry picks up leadership within one cycle. This was verified by hand: killing the leader
process mid-session, the standby instance acquired leadership and resumed ticking within the
10s retry window, with the correct log lines on both sides.

## Rate limiting: two tiers, not one

`/auth/*` gets a tight limiter (20 requests / 15 min per IP) to blunt credential-stuffing —
login/register are the only endpoints worth throttling hard, since they're the brute-force
target. Everything else gets a much looser limiter (600 requests / 5 min per IP), sized to
comfortably cover a few open dashboard tabs polling every few seconds, while still stopping
a runaway or abusive client. Splitting them avoids the common mistake of one blanket limit
that's either too loose to matter for auth or so tight it locks out normal dashboard use.

## At-least-once, with idempotency left to the handler

If a worker dies mid-job, the reaper requeues the job after the heartbeat timeout — so a job
can run more than once in a crash scenario. This is the standard at-least-once guarantee;
exactly-once isn't achievable in general. Job handlers are expected to be idempotent for
work that must not repeat.

## Recurring jobs as templates

A recurring job row isn't executed directly. Each scheduler tick, a due recurring job
spawns a one-off child (which the worker runs) and advances its own `run_at` to the next
cron time. This gives each run its own job + execution history instead of piling every run
onto one row, which reads much better in the dashboard.

## Per-queue concurrency as a hard bound

Before claiming, a worker counts in-flight jobs (`claimed` + `running`) for the queue and
claims at most `concurrency_limit − in_flight`. Done naively that count+claim races across
workers and can overshoot the limit. To make the limit a *hard* bound, the count and the
claim run in one transaction guarded by a per-queue advisory lock
(`pg_advisory_xact_lock(hashtext(queue_id))`), so claims on a given queue are serialized —
two workers can't both read the same in-flight count and each fill the queue. The lock is
per-queue, so different queues still claim fully in parallel. `claimWithConcurrencyLimit`
implements this; a test asserts four concurrent workers never exceed the limit.

## Raw SQL instead of an ORM

Queries are written directly with `pg`. For a project whose most important line of code is a
carefully-worded `SKIP LOCKED` statement, keeping SQL visible and explicit is clearer than
hiding it behind an ORM — and it keeps the dependency list small.

## Organizations as the tenancy root, with a personal org per user

Projects live under an organization rather than directly under a user, so the same schema
supports both a solo user and a team without a special case. To keep that from adding
friction, registration creates the user, their personal org, and the `owner` membership in
one transaction — so a project always has an org to belong to, and the common solo flow never
has to think about orgs. Team orgs are just additional orgs the user owns; the personal org
is simply their earliest-created one, which is where org-less project creation falls back to.

## Job logs separate from job executions

Two tables record what happened to a job because they answer different questions.
`job_executions` is the metrics record — one row per attempt with start/finish timestamps and
a terminal status, so throughput and durations are a plain aggregate. `job_logs` is the
narrative — many lines per attempt (started, completed, failed, retry scheduled,
dead-lettered), each tagged `info`/`warn`/`error`. Merging them would mean either parsing
free text to compute metrics or losing the step-by-step trail; keeping them apart lets each
stay simple. Log writes are best-effort (failures are swallowed) so logging can never break
execution.

## Structured request logging without a dependency

Every request emits one JSON line (method, path, status, duration, and a short request id
that's also returned as `x-request-id`), written straight to stdout by a tiny middleware
rather than a logging library. One line per event is greppable and ready for any aggregator,
and skipping a dependency keeps the footprint small — consistent with the raw-SQL choice
above. `4xx` logs at `warn`, `5xx` at `error`, everything else at `info`.

## Event-driven execution, with polling as the floor

Workers don't only poll. When a job becomes runnable — an immediate submit, a scheduler
promotion, a reaped job, or a completion that may unblock a dependent — the server issues
`pg_notify('jobs_ready', queue_id)`. Each worker holds a dedicated `LISTEN` connection and
polls immediately on notification (coalescing bursts), so latency from submit to execution is
near-zero instead of up to a poll interval. Polling stays on as a safety net (and to catch
delayed/scheduled jobs coming due), so a missed notification degrades to "picked up on the
next tick" rather than a stuck job. Postgres is already the source of truth, so using its
`LISTEN/NOTIFY` avoids bolting on a separate message broker.

## Worker runs embedded by default, standalone when scaling out

The API process runs an embedded worker + scheduler so `npm run dev` is a single command.
Set `RUN_EMBEDDED_WORKER=false` and run one or more `npm run worker` processes to scale the
job tier independently of the API; they coordinate through the scheduler advisory lock
(exactly one ticks) and claim jobs safely via `SKIP LOCKED`. Same code path, two deployment
shapes.

## Versioned migrations over a single schema file

Schema lives in ordered `migrations/NNNN_*.sql` files applied once each and recorded in a
`schema_migrations` table, inside a transaction per file. Re-running is a no-op; a new change
is a new numbered file. This gives a reproducible, forward-only history (validated on a fresh
Postgres in CI) instead of one big idempotent script whose application order is implicit.

## Worker heartbeats: latest value on the row, history in its own table

`workers.last_heartbeat_at` is all the reaper needs for liveness (is this worker past the
30s timeout?), so that stays a single column updated in place. The append-only
`worker_heartbeats` table answers a different question — recent activity over time — and each
worker prunes its own rows past an hour, so the history table stays bounded without a
background job.
