import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "../src/db.js";
import { claimJobs } from "../src/worker.js";
import { makeFixture, cleanupUser } from "./helpers.js";

describe("workflow dependencies", () => {
  it("keeps a dependent job unclaimable until its dependency completes", async () => {
    const { userId, queueId } = await makeFixture({ paused: true });
    const workerId = randomUUID();
    await query("insert into workers (id, hostname, pid) values ($1, 'dep-test', 0)", [workerId]);

    const A = (
      await query<{ id: string }>(
        "insert into jobs (queue_id, status, max_attempts) values ($1, 'queued', 3) returning id",
        [queueId]
      )
    ).rows[0].id;
    const B = (
      await query<{ id: string }>(
        "insert into jobs (queue_id, status, max_attempts, depends_on_job_id) values ($1, 'queued', 3, $2) returning id",
        [queueId, A]
      )
    ).rows[0].id;
    // C depends on a job that's already completed, so it should be immediately eligible.
    const done = (
      await query<{ id: string }>(
        "insert into jobs (queue_id, status, max_attempts) values ($1, 'completed', 3) returning id",
        [queueId]
      )
    ).rows[0].id;
    const C = (
      await query<{ id: string }>(
        "insert into jobs (queue_id, status, max_attempts, depends_on_job_id) values ($1, 'queued', 3, $2) returning id",
        [queueId, done]
      )
    ).rows[0].id;

    // Round 1: A (no dep) and C (dep already done) are claimable; B is blocked on A.
    const round1 = (await claimJobs(workerId, queueId, 10)).map((j) => j.id);
    expect(round1).toContain(A);
    expect(round1).toContain(C);
    expect(round1).not.toContain(B);

    // Complete A → B becomes eligible.
    await query("update jobs set status = 'completed' where id = $1", [A]);
    const round2 = (await claimJobs(workerId, queueId, 10)).map((j) => j.id);
    expect(round2).toContain(B);

    await query("delete from workers where id = $1", [workerId]);
    await cleanupUser(userId);
  });
});
