# Distributed Job Scheduler

A job scheduling platform that runs asynchronous background jobs across workers, with
priorities, per-queue concurrency limits, retries with backoff, a dead-letter queue,
scheduled/delayed/recurring jobs, worker heartbeats, and a live dashboard.

The design goal was correctness of the hard parts — **atomic job claiming** (no job is
ever run twice), the full job lifecycle, and crash recovery — rather than feature count.

## Bonus features

Beyond the core requirements, this also implements:

- **Workflow dependencies** — a job can require another job to `complete` before it's
  eligible to run (`depends_on_job_id`), enforced in the same atomic claim query.
- **Fair Scheduling / Priority** — High-priority queues take precedence across the worker cluster automatically.
- **Token Bucket Rate Limiting** — Set a strict max limit of jobs per minute on a queue, enforced atomically without blocking using PostgreSQL.
- **Consistent Hashing / Worker Pinning** — Submit jobs with an `affinity_key` to route them predictably to the same worker process (preventing race conditions and maximizing cache hits).
- **Recurring Jobs** — Provide a standard CRON expression to automatically spawn repeated tasks on a schedule.
- **Distributed locking** — Postgres advisory-lock leader election so exactly one server
  instance runs the scheduler tick loop, with automatic failover if the leader dies.
- **Role-based access control** — projects have `admin`/`viewer` members; viewers can see
  everything but every mutating endpoint is blocked for them, enforced server-side.
- **WebSocket live updates** — a push channel notifies the dashboard of changes in under a
  second, with polling kept on as an automatic fallback if the socket drops.
- **API Rate limiting** — tiered per-IP limits (tight on `/auth`, looser elsewhere).
- **Throughput chart** — daily completed-vs-failed executions on the Overview page.

See [docs/design-decisions.md](docs/design-decisions.md) for the reasoning behind each.

## Stack

- **Backend**: Node.js + TypeScript, Express, raw SQL via `pg`, `ws` for WebSockets
- **Database**: PostgreSQL (`SELECT ... FOR UPDATE SKIP LOCKED` for atomic claiming,
  `pg_advisory_lock` for scheduler leader election)
- **Frontend**: React + TypeScript (Vite)

## Layout

```
server/   Express API + worker poll loop + scheduler (one process)
web/      React dashboard
docs/     architecture, ER diagram, design decisions
```

## Setup

### 1. Database

Any PostgreSQL 13+ works (local, Docker, or a hosted provider such as Supabase/Neon).
Put the connection string in `server/.env`:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=change-me
PORT=4000
```

> If the password contains special characters, URL-encode them (e.g. `@` → `%40`).
> With Supabase, use the **Session pooler** connection string (IPv4-compatible).

### 2. Backend

```bash
cd server
npm install
npm run migrate     # applies versioned migrations (src/migrations/, tracked in schema_migrations)
npm run dev         # API on http://localhost:4000, with an embedded worker + scheduler
```

Registering an account creates a personal **organization**; projects live under an org, and
you can create more orgs (org → projects → queues → jobs).

**Scaling the worker out (optional).** The worker runs embedded in the API by default. To run
it as its own process (or several), start the API with the embedded worker off and launch
standalone workers — they coordinate via the scheduler's advisory lock and claim jobs safely:

```bash
RUN_EMBEDDED_WORKER=false npm run dev   # API only
npm run worker                          # a standalone worker + scheduler (run as many as you like)
```

### 3. Frontend

```bash
cd web
npm install
npm run dev         # dashboard on http://localhost:5173
```

Open the dashboard, register an account, create a project → queue → job, and watch it run.
The account that creates a project becomes its `admin`; invite other registered accounts
as `admin` or `viewer` from the **Access** tab.

### 4. Demo data (optional)

To see the dashboard populated with realistic projects, queues, and job history instead
of starting from an empty workspace:

```bash
cd server
npm run seed
```

Creates three sample projects (Notification Service, Data Pipeline, Billing & Payments)
with multiple queues, hundreds of jobs across every status, retry history, and a mix of
active/stopped workers. Log in with:

```
demo@northwind.dev / demo1234
```

Safe to re-run — it skips queues that already exist rather than duplicating them.

## Tests

Automated suite (Vitest) covering the critical paths — atomic claiming under concurrency,
retry backoff, dependency gating, the failure → retry → dead-letter lifecycle, and API
auth/RBAC:

```bash
cd server
npm test             # runs the full Vitest suite (tests/)
npm run test:watch   # watch mode
```

The suite runs against the configured Postgres, creating and cleaning up isolated data per
test. It runs files serially with a small connection pool (`PG_POOL_MAX=4`) so it stays under
a shared pooler's client budget. Standalone stress scripts are also available:

```bash
npm run test:claim   # heavier concurrency stress: N jobs, many claimers, zero double-claims
npm run test:retry   # backoff math (fixed / linear / exponential)
npm run test:deps    # dependent jobs stay blocked until their dependency completes
```

## Job payloads

The demo handler reads the job payload so you can exercise every path:

| Payload | Behaviour |
|---|---|
| `{ "ms": 500 }` | succeeds after 500ms |
| `{ "fail": true }` | always fails → retries → dead-letter |
| `{ "fail_rate": 0.5 }` | fails ~50% of the time |

## API

See [docs/api.md](docs/api.md). All routes except `/auth/*` and `/health` require a
`Bearer <token>` header.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the pieces fit together
- [docs/er-diagram.md](docs/er-diagram.md) — schema and rationale
- [docs/design-decisions.md](docs/design-decisions.md) — trade-offs and why
