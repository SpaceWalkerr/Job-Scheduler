import type { PoolClient } from "pg";
import { pool } from "./db.js";

// Fixed key identifying the "scheduler" role. Postgres advisory locks are held
// per-session (per-connection), so we check out a dedicated client from the pool
// and hold onto it for as long as we hold the lock — never returning it until we
// release. If this process crashes, Postgres drops the connection and the lock
// is freed automatically, letting another instance take over.
const SCHEDULER_LOCK_KEY = 727386;

export interface LeaderHandle {
  isLeader: boolean;
  release: () => Promise<void>;
}

export async function tryBecomeLeader(): Promise<LeaderHandle> {
  const client: PoolClient = await pool.connect();
  const { rows } = await client.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1) as locked",
    [SCHEDULER_LOCK_KEY]
  );
  if (!rows[0].locked) {
    client.release();
    return { isLeader: false, release: async () => {} };
  }
  return {
    isLeader: true,
    release: async () => {
      try {
        await client.query("select pg_advisory_unlock($1)", [SCHEDULER_LOCK_KEY]);
      } finally {
        client.release();
      }
    },
  };
}
