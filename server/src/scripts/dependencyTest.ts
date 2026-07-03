import { randomUUID } from "node:crypto";
import { query, pool } from "../db.js";
import { claimJobs } from "../worker.js";

async function main() {
  const user = await query<{ id: string }>(
    "insert into users (email, password_hash) values ($1, 'x') returning id",
    [`deptest+${randomUUID()}@test.com`]
  );
  const org = await query<{ id: string }>(
    "insert into organizations (name, owner_user_id) values ('dep-test', $1) returning id",
    [user.rows[0].id]
  );
  const project = await query<{ id: string }>(
    "insert into projects (user_id, organization_id, name) values ($1, $2, 'dep-test') returning id",
    [user.rows[0].id, org.rows[0].id]
  );
  const queue = await query<{ id: string }>(
    "insert into queues (project_id, name, is_paused) values ($1, 'dep-test', true) returning id",
    [project.rows[0].id]
  );
  const queueId = queue.rows[0].id;
  const workerId = randomUUID();
  await query("insert into workers (id, hostname, pid) values ($1, 'dep-test', 0)", [workerId]);

  // Job A: no dependency. Job B: depends on A. Job C: depends on a job that's already completed.
  const jobA = await query<{ id: string }>(
    "insert into jobs (queue_id, status, max_attempts) values ($1, 'queued', 3) returning id",
    [queueId]
  );
  const jobB = await query<{ id: string }>(
    "insert into jobs (queue_id, status, max_attempts, depends_on_job_id) values ($1, 'queued', 3, $2) returning id",
    [queueId, jobA.rows[0].id]
  );
  const alreadyDone = await query<{ id: string }>(
    "insert into jobs (queue_id, status, max_attempts) values ($1, 'completed', 3) returning id",
    [queueId]
  );
  const jobC = await query<{ id: string }>(
    "insert into jobs (queue_id, status, max_attempts, depends_on_job_id) values ($1, 'queued', 3, $2) returning id",
    [queueId, alreadyDone.rows[0].id]
  );

  // Round 1: A and C should be claimable (no pending dependency), B should NOT be (depends on unfinished A).
  const round1 = await claimJobs(workerId, queueId, 10);
  const round1Ids = round1.map((j) => j.id).sort();
  const expectedRound1 = [jobA.rows[0].id, jobC.rows[0].id].sort();
  const round1Ok = JSON.stringify(round1Ids) === JSON.stringify(expectedRound1);
  console.log("round1 claimed:", round1.length, "expected 2 (A + C, not B) ->", round1Ok ? "PASS" : "FAIL");

  // Complete A.
  await query("update jobs set status = 'completed' where id = $1", [jobA.rows[0].id]);

  // Round 2: B should now be claimable.
  const round2 = await claimJobs(workerId, queueId, 10);
  const round2Ok = round2.length === 1 && round2[0].id === jobB.rows[0].id;
  console.log("round2 claimed:", round2.length, "expected 1 (B, now unblocked) ->", round2Ok ? "PASS" : "FAIL");

  const ok = round1Ok && round2Ok;
  console.log(ok ? "\nPASS: dependency gating works correctly" : "\nFAIL: dependency gating broken");

  await query("delete from users where id = $1", [user.rows[0].id]);
  await query("delete from workers where id = $1", [workerId]);
  await pool.end();
  process.exit(ok ? 0 : 1);
}

main();
