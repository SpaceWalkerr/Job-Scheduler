import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "../src/db.js";
import { claimWithConcurrencyLimit } from "../src/worker.js";
import { makeFixture, cleanupUser } from "./helpers.js";

describe("per-queue concurrency limit", () => {
  it("never lets concurrent workers exceed the queue's concurrency limit", async () => {
    const LIMIT = 3;
    // A fixture queue's concurrency_limit isn't directly settable via makeFixture, so set it.
    const { userId, queueId } = await makeFixture({ paused: true });
    await query("update queues set concurrency_limit = $1 where id = $2", [LIMIT, queueId]);

    // 10 runnable jobs, but only LIMIT slots.
    await query(
      `insert into jobs (queue_id, type, status, max_attempts)
       select $1, 'immediate', 'queued', 3 from generate_series(1, 10)`,
      [queueId]
    );

    // Four workers all try to claim at once. Nothing completes, so in-flight only grows —
    // the hard bound must cap total claimed at LIMIT.
    const workerIds = Array.from({ length: 4 }, () => randomUUID());
    for (const id of workerIds) {
      await query("insert into workers (id, hostname, pid) values ($1, 'conc-test', 0)", [id]);
    }
    const claims = await Promise.all(
      workerIds.map((wid) => claimWithConcurrencyLimit(wid, queueId, LIMIT))
    );
    const totalClaimed = claims.reduce((n, c) => n + c.length, 0);
    expect(totalClaimed).toBe(LIMIT);

    const inflight = (
      await query<{ c: number }>(
        "select count(*)::int as c from jobs where queue_id = $1 and status in ('claimed','running')",
        [queueId]
      )
    ).rows[0].c;
    expect(inflight).toBe(LIMIT);

    await query("delete from workers where id = any($1)", [workerIds]);
    await cleanupUser(userId);
  });
});
