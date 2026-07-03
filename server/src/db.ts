import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres (e.g. Supabase) needs SSL; a local/CI Postgres doesn't — set
  // DATABASE_SSL=false there.
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  // Overridable so tests can run with a small footprint under a shared pooler budget.
  max: Number(process.env.PG_POOL_MAX) || 10,
  // Fail fast if a new connection can't be established instead of blocking a request.
  connectionTimeoutMillis: 8000,
  // Recycle idle clients before the Supabase pooler silently drops them server-side,
  // so we never hand out a dead connection from the pool.
  idleTimeoutMillis: 30000,
  // TCP keepalive detects a peer that went away (also protects the leader's long-held
  // advisory-lock connection in leader.ts from being dropped without us noticing).
  keepAlive: true,
  // Last-resort guards: a query on a half-open socket errors out instead of hanging
  // forever and leaking its pool client (which is what exhausted the pool).
  statement_timeout: 15000,
  query_timeout: 15000,
});

// Idle clients can emit errors in the background (e.g. the pooler closing a connection).
// Without a listener node-pg escalates this to an uncaught 'error' and crashes the
// process; instead log it and let the pool evict the bad client.
pool.on("error", (err) => {
  console.error("pg pool: idle client error (evicting):", err.message);
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

// Wake any worker LISTENing on 'jobs_ready' for this queue (event-driven execution).
// Best-effort: a missed notification just means the job waits for the next poll tick.
export function notifyJobsReady(queueId: string) {
  return query("select pg_notify('jobs_ready', $1)", [queueId]).catch(() => {});
}
