import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, notifyJobsReady } from "../src/db.js";

describe("event-driven wakeups (LISTEN/NOTIFY)", () => {
  it("delivers a jobs_ready notification carrying the queue id", async () => {
    const client = await pool.connect();
    try {
      await client.query("LISTEN jobs_ready");
      const queueId = randomUUID();

      const received = new Promise<string>((resolve) => {
        client.on("notification", (msg) => {
          if (msg.payload === queueId) resolve(msg.payload);
        });
      });

      await notifyJobsReady(queueId);

      const payload = await Promise.race([
        received,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("no notification within 5s")), 5000)
        ),
      ]);
      expect(payload).toBe(queueId);
    } finally {
      client.removeAllListeners("notification");
      await client.query("UNLISTEN jobs_ready").catch(() => {});
      client.release();
    }
  });
});
