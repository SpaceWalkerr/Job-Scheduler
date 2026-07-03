# API Reference

Base URL: `http://localhost:4000`. All routes except `/health` and `/auth/*` require an
`Authorization: Bearer <token>` header. Bodies and responses are JSON.

**Rate limits:** `/auth/*` allows 20 requests / 15 min per IP. Everything else allows 600
requests / 5 min per IP. Both return `429 { "error": "..." }` when exceeded.

**Access control:** two membership tiers. An **organization** has members
(`owner`|`member`); a **project** has members (`admin`|`viewer`). Viewers/members can call
`GET` endpoints but get `403` from endpoints that create or modify data. `404` is returned
(not `403`) when the caller isn't a member at all, so membership isn't leaked to non-members.

**Logging:** every response carries an `x-request-id` header, and the server emits one
structured JSON log line per request (method, path, status, duration, request id).

## Auth

### `POST /auth/register`
```json
{ "email": "you@example.com", "password": "secret" }
```
→ `201 { "user": { "id", "email", "created_at" }, "token": "<jwt>" }`.
Also creates the user's personal organization (they become its `owner`).

### `POST /auth/login`
Same body as register → `200 { "user", "token" }`. `401` on bad credentials.

## Organizations

### `GET /organizations`
→ orgs the caller belongs to: `[{ id, name, role, project_count, created_at }]`.

### `POST /organizations`
```json
{ "name": "Acme Inc" }
```
→ `201` the created org (caller becomes its `owner`).

### `GET /organizations/:id/members`
→ `[{ email, role, created_at }]`. Any member can view.

### `POST /organizations/:id/members` — owner only
```json
{ "email": "teammate@company.com", "role": "member" }
```
Adds an existing account as `owner` or `member` (defaults to `member`). `404` if no account
exists with that email.

### `DELETE /organizations/:id/members/:email` — owner only
Removes a member. `400` if it would remove the last owner. → `204`.

## Projects

### `GET /projects?organization_id=<id>`
→ projects the caller is a member of, each with `my_role` (`admin`|`viewer`) and
`organization_name`. Optionally filtered to one organization.

### `POST /projects`
```json
{ "name": "my-project", "organization_id": "<id>" }
```
→ `201` the created project (caller becomes its `admin`). `organization_id` is optional —
omitted, the project goes into the caller's personal org; if provided, the caller must be a
member of that org.

### `GET /projects/:id/members`
→ `[{ email, role, created_at }]`. Any member can view.

### `POST /projects/:id/members` — admin only
```json
{ "email": "teammate@company.com", "role": "viewer" }
```
Invites an existing account (they must already have one) to the project. `role` is
`"admin"` or `"viewer"` (defaults to `"viewer"`). Re-inviting an existing member updates
their role. `404` if no account exists with that email.

### `DELETE /projects/:id/members/:email` — admin only
Removes a member's access. → `204`.

## Queues

### `GET /queues?project_id=<id>&limit=100&offset=0`
→ queues under the caller's projects (optionally filtered by project), highest-priority
first, with `limit`/`offset` pagination.

### `POST /queues` — admin only
```json
{
  "project_id": "<id>",
  "name": "emails",
  "priority": 0,
  "concurrency_limit": 5,
  "retry_strategy": "exponential",
  "retry_base_delay_ms": 1000,
  "max_attempts": 3
}
```
Only `project_id` and `name` are required; the rest have defaults. `priority` (default
`0`) is a queue-level rank — workers fill higher-priority queues' concurrency slots first.

### `PATCH /queues/:id` — admin only
Any subset of `name`, `priority`, `concurrency_limit`, `retry_strategy`, `retry_base_delay_ms`,
`max_attempts`, `is_paused`. Used for pause/resume and reconfiguration.
```json
{ "is_paused": true }
```

## Jobs

### `POST /jobs` — admin only

Common fields: `queue_id` (required), `type`, `payload`, `priority`, `depends_on_job_id`
(optional).

| type | extra fields | initial state |
|---|---|---|
| `immediate` (default) | — | `queued` |
| `delayed` | `delay_ms` | `scheduled` until due |
| `scheduled` | `run_at` (ISO string) | `scheduled` until due |
| `recurring` | `cron_expr` | `scheduled`, fans out each tick |
| `batch` | `payload` is an **array** | one `queued` job per item |

```json
{ "queue_id": "<id>", "type": "delayed", "delay_ms": 5000, "payload": { "ms": 200 } }
```

`depends_on_job_id`, if set, must reference a job the caller can already see. The job stays
`queued` (never claimed) until that dependency's status is `completed` — see
[design-decisions.md](design-decisions.md#workflow-dependencies-gate-the-claim-dont-chain-the-jobs).

### `GET /jobs?queue_id=<id>&status=<status>&limit=50&offset=0`
→ jobs (newest first) scoped to the caller, with optional filters and pagination. Each job
includes `depends_on_status` (the dependency's current status, if any) so the UI can show a
"blocked" state without a second request.

### `GET /jobs/:id`
→ the job (with `depends_on_status`), its `executions` array (per-attempt metrics: status,
`started_at`/`finished_at`, error), and its `logs` array (`[{ level, message, attempt,
created_at }]`) — the human-readable lifecycle trail.

### `POST /jobs/:id/retry` — admin only
Requeues a `failed` or `dead_letter` job (resets attempts). → the updated job.

## Workers

### `GET /workers?limit=100&offset=0`
→ registered workers with `status`, `seconds_since_heartbeat`, `active_jobs`, and
`heartbeats_15m` (count of heartbeat pings in the last 15 minutes); `limit`/`offset` paginated.

### `GET /workers/:id/heartbeats`
→ the last 100 heartbeat pings for one worker (newest first): `[{ active_jobs, created_at }]`.

## Dashboard

### `GET /dashboard/stats`
→ `{ "status": { <status>: count }, "queues": [ { queue_id, name, is_paused, queued,
running, completed, failed, dead_letter } ] }`

### `GET /dashboard/stats/throughput`
→ `[{ day: "YYYY-MM-DD", completed, failed }]` — daily execution counts for the last 7 days,
scoped to the caller's projects. Powers the Overview throughput chart.

## Live updates (WebSocket)

### `ws(s)://<host>/ws?token=<jwt>`
Authenticated the same way as the REST API (JWT, but passed as a query param since the
WebSocket handshake can't carry a custom header). On connect, the server pushes a message
whenever something changes:

```json
{ "type": "jobs" }
```

`type` is one of `jobs`, `queues`, `workers`, `projects` — a hint for *what* changed, not the
changed data itself. Clients are expected to re-fetch the relevant REST endpoint on receipt
(this is exactly what the dashboard's `usePolling` hook does — see
[design-decisions.md](design-decisions.md#websockets-for-push-polling-as-the-fallback--not-one-or-the-other)).
The connection closes with code `4001` if the token is missing or invalid.
