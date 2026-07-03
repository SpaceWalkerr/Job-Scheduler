import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "../src/db.js";
import { claimJobs } from "../src/worker.js";
import { makeFixture, cleanupUser } from "./helpers.js";

describe("atomic job claiming (SKIP LOCKED)", () => {
  it("claims every job exactly once across concurrent claimers", async () => {
    const { userId, queueId } = await makeFixture({ paused: true });
    const JOBS = 80;
    const WORKERS = 4;
    const BATCH = 5;

    await query(
      `insert into jobs (queue_id, type, status, max_attempts)
       select $1, 'immediate', 'queued', 3 from generate_series(1, ${JOBS})`,
      [queueId]
    );

    const workerIds = Array.from({ length: WORKERS }, () => randomUUID());
    for (const id of workerIds) {
      await query("insert into workers (id, hostname, pid) values ($1, 'claim-test', 0)", [id]);
    }

    const buckets: string[][] = Array.from({ length: WORKERS }, () => []);
    async function claimer(workerId: string, bucket: string[]) {
      for (;;) {
        const jobs = await claimJobs(workerId, queueId, BATCH);
        if (jobs.length === 0) break;
        for (const j of jobs) bucket.push(j.id);
      }
    }
    await Promise.all(buckets.map((b, i) => claimer(workerIds[i], b)));

    const all = buckets.flat();
    expect(all.length).toBe(JOBS); // every job claimed
    expect(new Set(all).size).toBe(JOBS); // and none claimed twice

    await query("delete from workers where id = any($1)", [workerIds]);
    await cleanupUser(userId);
  });
});
