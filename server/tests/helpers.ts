import { randomUUID } from "node:crypto";
import { query } from "../src/db.js";

interface QueueOpts {
  paused?: boolean;
  maxAttempts?: number;
  retryStrategy?: "fixed" | "linear" | "exponential";
  retryBaseMs?: number;
}

// Create an isolated user → org → project → queue for a test. Deleting the user
// cascades through org, project, queue, and jobs, so `cleanupUser` is all that's needed.
export async function makeFixture(opts: QueueOpts = {}) {
  const email = `test+${randomUUID()}@example.com`;
  const user = await query<{ id: string }>(
    "insert into users (email, password_hash) values ($1, 'x') returning id",
    [email]
  );
  const userId = user.rows[0].id;
  const org = await query<{ id: string }>(
    "insert into organizations (name, owner_user_id) values ('test-org', $1) returning id",
    [userId]
  );
  const project = await query<{ id: string }>(
    "insert into projects (user_id, organization_id, name) values ($1, $2, 'test-proj') returning id",
    [userId, org.rows[0].id]
  );
  const queue = await query<{ id: string }>(
    `insert into queues (project_id, name, is_paused, max_attempts, retry_strategy, retry_base_delay_ms)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      project.rows[0].id,
      `q-${randomUUID().slice(0, 8)}`,
      opts.paused ?? true,
      opts.maxAttempts ?? 3,
      opts.retryStrategy ?? "exponential",
      opts.retryBaseMs ?? 1000,
    ]
  );
  return { userId, email, orgId: org.rows[0].id, projectId: project.rows[0].id, queueId: queue.rows[0].id };
}

export async function cleanupUser(userId: string) {
  await query("delete from users where id = $1", [userId]);
}

export async function cleanupUsersByEmail(emails: string[]) {
  await query("delete from users where email = any($1)", [emails]);
}
