import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { cleanupUsersByEmail } from "./helpers.js";

const app = createApp();

async function register(email: string) {
  const res = await request(app).post("/auth/register").send({ email, password: "pass1234" });
  return res.body.token as string;
}
const authHeader = (token: string) => ["authorization", `Bearer ${token}`] as const;

describe("authentication", () => {
  it("rejects unauthenticated access to protected routes", async () => {
    await request(app).get("/projects").expect(401);
  });

  it("registers, logs in, and rejects bad credentials", async () => {
    const email = `api+${randomUUID()}@example.com`;
    const reg = await request(app).post("/auth/register").send({ email, password: "pass1234" });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();

    const ok = await request(app).post("/auth/login").send({ email, password: "pass1234" });
    expect(ok.status).toBe(200);

    const bad = await request(app).post("/auth/login").send({ email, password: "wrong" });
    expect(bad.status).toBe(401);

    await cleanupUsersByEmail([email]);
  });

  it("creates a personal organization on registration", async () => {
    const email = `apiorg+${randomUUID()}@example.com`;
    const token = await register(email);
    const orgs = await request(app).get("/organizations").set(...authHeader(token));
    expect(orgs.status).toBe(200);
    expect(orgs.body).toHaveLength(1);
    expect(orgs.body[0].role).toBe("owner");
    await cleanupUsersByEmail([email]);
  });
});

describe("role-based access control", () => {
  it("blocks viewers from mutations and hides projects from non-members", async () => {
    const adminEmail = `admin+${randomUUID()}@example.com`;
    const viewerEmail = `viewer+${randomUUID()}@example.com`;
    const strangerEmail = `stranger+${randomUUID()}@example.com`;
    const adminTok = await register(adminEmail);
    const viewerTok = await register(viewerEmail);
    const strangerTok = await register(strangerEmail);

    const proj = await request(app).post("/projects").set(...authHeader(adminTok)).send({ name: "rbac-proj" });
    const projectId = proj.body.id;
    const queue = await request(app)
      .post("/queues")
      .set(...authHeader(adminTok))
      .send({ project_id: projectId, name: "rbac-q" });
    const queueId = queue.body.id;

    // Invite the viewer.
    await request(app)
      .post(`/projects/${projectId}/members`)
      .set(...authHeader(adminTok))
      .send({ email: viewerEmail, role: "viewer" })
      .expect(201);

    // Viewer can read but not submit jobs.
    await request(app).get(`/jobs?queue_id=${queueId}`).set(...authHeader(viewerTok)).expect(200);
    const forbidden = await request(app).post("/jobs").set(...authHeader(viewerTok)).send({ queue_id: queueId });
    expect(forbidden.status).toBe(403);

    // A non-member gets 404 (membership isn't leaked as 403).
    const notFound = await request(app).post("/jobs").set(...authHeader(strangerTok)).send({ queue_id: queueId });
    expect(notFound.status).toBe(404);

    await cleanupUsersByEmail([adminEmail, viewerEmail, strangerEmail]);
  });
});
