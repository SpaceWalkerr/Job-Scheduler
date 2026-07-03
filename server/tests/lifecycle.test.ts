import { describe, it, expect } from "vitest";
import { query } from "../src/db.js";
import { handleFailure, type Job } from "../src/worker.js";
import { makeFixture, cleanupUser } from "./helpers.js";

describe("failure lifecycle", () => {
  it("re-queues with a backoff delay when attempts remain", async () => {
    const { userId, queueId } = await makeFixture({
      paused: true,
      maxAttempts: 3,
      retryStrategy: "fixed",
      retryBaseMs: 5000,
    });
    const jobId = (
      await query<{ id: string }>(
        "insert into jobs (queue_id, status, max_attempts, attempt_count) values ($1, 'running', 3, 1) returning id",
        [queueId]
      )
    ).rows[0].id;
    const job: Job = { id: jobId, queue_id: queueId, payload: {}, attempt_count: 1, max_attempts: 3 };

    await handleFailure(job, 1, "boom", null);

    const row = (
      await query<{ status: string; future: boolean; last_error: string }>(
        "select status, run_at > now() as future, last_error from jobs where id = $1",
        [jobId]
      )
    ).rows[0];
    expect(row.status).toBe("queued");
    expect(row.future).toBe(true); // scheduled into the future by the backoff
    expect(row.last_error).toBe("boom");

    const warns = (
      await query<{ message: string }>(
        "select message from job_logs where job_id = $1 and level = 'warn'",
        [jobId]
      )
    ).rows;
    expect(warns.length).toBeGreaterThan(0);

    await cleanupUser(userId);
  });

  it("moves the job to the dead-letter queue when attempts are exhausted", async () => {
    const { userId, queueId } = await makeFixture({ paused: true, maxAttempts: 2 });
    const jobId = (
      await query<{ id: string }>(
        `insert into jobs (queue_id, status, max_attempts, attempt_count, payload)
         values ($1, 'running', 2, 2, '{"x":1}') returning id`,
        [queueId]
      )
    ).rows[0].id;
    const job: Job = { id: jobId, queue_id: queueId, payload: { x: 1 }, attempt_count: 2, max_attempts: 2 };

    await handleFailure(job, 2, "fatal", null);

    const status = (await query<{ status: string }>("select status from jobs where id = $1", [jobId])).rows[0].status;
    expect(status).toBe("dead_letter");

    const dlq = (
      await query<{ c: number }>(
        "select count(*)::int as c from dead_letter_jobs where original_job_id = $1",
        [jobId]
      )
    ).rows[0].c;
    expect(dlq).toBe(1);

    await cleanupUser(userId);
  });
});
