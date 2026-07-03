import { randomUUID } from "node:crypto";
import { query, pool } from "../db.js";
import { claimJobs } from "../worker.js";

// Overridable so the test can fit within a constrained connection budget (e.g. a
// Supabase session-mode pooler shared with a running dev server).
const JOB_COUNT = Number(process.env.CLAIM_TEST_JOBS) || 300;
const WORKERS = Number(process.env.CLAIM_TEST_WORKERS) || 10;
const BATCH = Number(process.env.CLAIM_TEST_BATCH) || 7;

async function setup() {
  const user = await query<{ id: string }>(
    "insert into users (email, password_hash) values ($1, 'x') returning id",
    [`claimtest+${randomUUID()}@test.com`]
  );
  const org = await query<{ id: string }>(
    "insert into organizations (name, owner_user_id) values ('claim-test', $1) returning id",
    [user.rows[0].id]
  );
  const project = await query<{ id: string }>(
    "insert into projects (user_id, organization_id, name) values ($1, $2, 'claim-test') returning id",
    [user.rows[0].id, org.rows[0].id]
  );
  // Paused so the live worker ignores it; the test claims directly.
  const queue = await query<{ id: string }>(
    "insert into queues (project_id, name, is_paused) values ($1, 'claim-test', true) returning id",
    [project.rows[0].id]
  );
  await query(
    `insert into jobs (queue_id, type, status, max_attempts)
     select $1, 'immediate', 'queued', 3 from generate_series(1, ${JOB_COUNT})`,
    [queue.rows[0].id]
  );
  return { userId: user.rows[0].id, queueId: queue.rows[0].id };
}

async function claimer(workerId: string, queueId: string, claimed: string[]) {
  while (true) {
    const jobs = await claimJobs(workerId, queueId, BATCH);
    if (jobs.length === 0) break;
    for (const j of jobs) claimed.push(j.id);
  }
}

async function main() {
  const { userId, queueId } = await setup();
  console.log(`seeded ${JOB_COUNT} jobs, launching ${WORKERS} concurrent claimers...`);

  const workerIds = Array.from({ length: WORKERS }, () => randomUUID());
  for (const id of workerIds) {
    await query("insert into workers (id, hostname, pid) values ($1, 'claim-test', 0)", [id]);
  }

  const perWorker: string[][] = Array.from({ length: WORKERS }, () => []);
  await Promise.all(perWorker.map((bucket, i) => claimer(workerIds[i], queueId, bucket)));

  const all = perWorker.flat();
  const unique = new Set(all);
  const duplicates = all.length - unique.size;

  console.log(`claimed total: ${all.length}`);
  console.log(`unique jobs:   ${unique.size}`);
  console.log(`duplicates:    ${duplicates}`);
  console.log(`per-worker:    ${perWorker.map((b) => b.length).join(", ")}`);

  const ok = all.length === JOB_COUNT && duplicates === 0 && unique.size === JOB_COUNT;
  console.log(ok ? "\nPASS: every job claimed exactly once" : "\nFAIL: claim was not exclusive");

  await query("delete from users where id = $1", [userId]);
  await query("delete from workers where id = any($1)", [workerIds]);
  await pool.end();
  process.exit(ok ? 0 : 1);
}

main();
