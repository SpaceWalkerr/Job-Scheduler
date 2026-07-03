import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { cleanupUsersByEmail } from "./helpers.js";

const app = createApp();
const email = `valid+${randomUUID()}@example.com`;
let token = "";
let queueId = "";
const auth = () => ["authorization", `Bearer ${token}`] as const;

beforeAll(async () => {
  const reg = await request(app).post("/auth/register").send({ email, password: "pass1234" });
  token = reg.body.token;
  const proj = await request(app).post("/projects").set(...auth()).send({ name: "valid-proj" });
  const q = await request(app).post("/queues").set(...auth()).send({ project_id: proj.body.id, name: "valid-q" });
  queueId = q.body.id;
});

afterAll(async () => {
  await cleanupUsersByEmail([email]);
});

describe("job submission validation", () => {
  const post = (body: Record<string, unknown>) =>
    request(app).post("/jobs").set(...auth()).send({ queue_id: queueId, ...body });

  it("rejects an unknown job type", async () => {
    expect((await post({ type: "bogus" })).status).toBe(400);
  });
  it("rejects scheduled without run_at", async () => {
    expect((await post({ type: "scheduled" })).status).toBe(400);
  });
  it("rejects scheduled with an invalid run_at", async () => {
    expect((await post({ type: "scheduled", run_at: "not-a-date" })).status).toBe(400);
  });
  it("rejects recurring with an invalid cron_expr", async () => {
    expect((await post({ type: "recurring", cron_expr: "definitely not cron" })).status).toBe(400);
  });
  it("rejects delayed with a negative delay", async () => {
    expect((await post({ type: "delayed", delay_ms: -5 })).status).toBe(400);
  });
  it("rejects an over-sized batch", async () => {
    const payload = Array.from({ length: 1001 }, () => ({}));
    expect((await post({ type: "batch", payload })).status).toBe(400);
  });
  it("accepts a valid immediate job", async () => {
    expect((await post({ payload: { ms: 10 } })).status).toBe(201);
  });
});
