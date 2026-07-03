import { randomUUID } from "node:crypto";
import { query, pool } from "./db.js";
import { hashPassword } from "./auth.js";

const DEMO_EMAIL = "demo@northwind.dev";
const DEMO_PASSWORD = "demo1234";

function daysAgo(d: number) {
  return new Date(Date.now() - (d * 86400000 + Math.random() * 20 * 3600000));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ERRORS = [
  "SMTP connection timeout",
  "Rate limit exceeded (429)",
  "Invalid recipient address",
  "Downstream service returned 503",
  "Connection reset by peer",
  "Template render error: missing variable 'first_name'",
  "Upstream gateway timeout after 30000ms",
];

const EMAIL_TEMPLATES = ["welcome_email", "password_reset", "order_confirmation", "weekly_digest", "trial_ending"];

function payloadFor(kind: string) {
  switch (kind) {
    case "email":
      return { to: `user${Math.floor(Math.random() * 9999)}@example.com`, template: pick(EMAIL_TEMPLATES) };
    case "push":
      return { device_id: randomUUID(), title: "You have a new message" };
    case "sms":
      return {
        to: `+1415555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
        body: "Your verification code is 482913",
      };
    case "etl":
      return { source: "postgres.orders", target: "warehouse.fact_orders", date: daysAgo(0).toISOString().slice(0, 10) };
    case "report":
      return { report: pick(["daily_revenue", "churn_summary", "cohort_retention"]), format: "pdf" };
    case "invoice":
      return { customer_id: `cus_${randomUUID().slice(0, 8)}`, amount_cents: Math.floor(Math.random() * 90000) + 1000 };
    case "webhook":
      return { provider: pick(["stripe", "paddle"]), event: pick(["invoice.paid", "charge.failed", "subscription.updated"]) };
    case "dunning":
      return { customer_id: `cus_${randomUUID().slice(0, 8)}`, attempt: Math.floor(Math.random() * 3) + 1 };
    default:
      return {};
  }
}

interface QueueDef {
  name: string;
  concurrency: number;
  retry: "fixed" | "linear" | "exponential";
  base: number;
  max: number;
  kind: string;
  paused?: boolean;
}

const PROJECTS: { name: string; queues: QueueDef[] }[] = [
  {
    name: "Notification Service",
    queues: [
      { name: "transactional-email", concurrency: 8, retry: "exponential", base: 2000, max: 4, kind: "email" },
      { name: "push-notifications", concurrency: 15, retry: "fixed", base: 1000, max: 3, kind: "push" },
      { name: "sms-delivery", concurrency: 5, retry: "linear", base: 3000, max: 3, kind: "sms" },
    ],
  },
  {
    name: "Data Pipeline",
    queues: [
      { name: "nightly-etl", concurrency: 2, retry: "fixed", base: 60000, max: 2, kind: "etl" },
      { name: "report-generation", concurrency: 4, retry: "exponential", base: 5000, max: 3, kind: "report" },
    ],
  },
  {
    name: "Billing & Payments",
    queues: [
      { name: "invoice-generation", concurrency: 6, retry: "exponential", base: 2000, max: 5, kind: "invoice" },
      { name: "payment-webhooks", concurrency: 10, retry: "fixed", base: 500, max: 3, kind: "webhook" },
      { name: "dunning-retries", concurrency: 3, retry: "linear", base: 10000, max: 4, kind: "dunning", paused: true },
    ],
  },
];

async function seedJob(queueId: string, q: QueueDef) {
  const roll = Math.random();
  const createdAt = daysAgo(Math.random() * 6);
  let status: string;
  let type = "immediate";
  let runAt = createdAt;
  let cronExpr: string | null = null;
  let attemptCount = 1;

  if (roll < 0.66) {
    status = "completed";
  } else if (roll < 0.78) {
    status = "queued";
  } else if (roll < 0.85) {
    status = "scheduled";
    const recurring = Math.random() < 0.4;
    type = recurring ? "recurring" : "scheduled";
    if (recurring) {
      cronExpr = pick(["*/5 * * * *", "*/10 * * * *", "*/15 * * * *"]);
      runAt = new Date(Date.now() + (1 + Math.random() * 4) * 60000);
    } else {
      runAt = new Date(Date.now() + (1 + Math.random() * 20) * 3600000);
    }
  } else if (roll < 0.9) {
    status = "running";
  } else if (roll < 0.95) {
    status = "failed";
    attemptCount = Math.floor(Math.random() * (q.max - 1)) + 1;
  } else {
    status = "dead_letter";
    attemptCount = q.max;
  }

  const payload = payloadFor(q.kind);
  const lastError = status === "failed" || status === "dead_letter" ? pick(ERRORS) : null;

  const jobRes = await query<{ id: string }>(
    `insert into jobs (queue_id, type, payload, status, priority, run_at, cron_expr, attempt_count, max_attempts, created_at, updated_at, last_error)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [queueId, type, payload, status, Math.floor(Math.random() * 3), runAt, cronExpr, attemptCount, q.max, createdAt, createdAt, lastError]
  );
  const jobId = jobRes.rows[0].id;

  if (status === "completed" || status === "failed" || status === "dead_letter") {
    const attempts = status === "completed" ? 1 : attemptCount;
    for (let a = 1; a <= attempts; a++) {
      const started = new Date(createdAt.getTime() + a * 1500);
      const finished = new Date(started.getTime() + 200 + Math.random() * 3000);
      const execStatus = a === attempts && status === "completed" ? "completed" : "failed";
      await query(
        `insert into job_executions (job_id, worker_id, attempt, status, started_at, finished_at, error)
         values ($1, null, $2, $3, $4, $5, $6)`,
        [jobId, a, execStatus, started, finished, execStatus === "failed" ? pick(ERRORS) : null]
      );
    }
  }

  if (status === "dead_letter") {
    await query(
      `insert into dead_letter_jobs (original_job_id, queue_id, payload, failure_reason, attempts, moved_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [jobId, queueId, payload, lastError, attemptCount, createdAt]
    );
  }
}

async function main() {
  console.log("Seeding demo workspace...");

  let userId: string;
  const existingUser = await query<{ id: string }>("select id from users where email = $1", [DEMO_EMAIL]);
  if (existingUser.rowCount) {
    userId = existingUser.rows[0].id;
    console.log("Demo user already exists, reusing.");
  } else {
    const hash = await hashPassword(DEMO_PASSWORD);
    const r = await query<{ id: string }>(
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [DEMO_EMAIL, hash]
    );
    userId = r.rows[0].id;
    console.log(`Created demo user ${DEMO_EMAIL}`);
  }

  // Every project needs an organization; ensure the demo user has a personal one.
  let orgId: string;
  const existingOrg = await query<{ id: string }>(
    "select id from organizations where owner_user_id = $1 order by created_at limit 1",
    [userId]
  );
  if (existingOrg.rowCount) {
    orgId = existingOrg.rows[0].id;
  } else {
    const r = await query<{ id: string }>(
      "insert into organizations (name, owner_user_id) values ($1, $2) returning id",
      ["Northwind", userId]
    );
    orgId = r.rows[0].id;
    await query(
      "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing",
      [orgId, userId]
    );
  }

  for (const p of PROJECTS) {
    let projectId: string;
    const existingP = await query<{ id: string }>("select id from projects where user_id = $1 and name = $2", [
      userId,
      p.name,
    ]);
    if (existingP.rowCount) {
      projectId = existingP.rows[0].id;
    } else {
      const r = await query<{ id: string }>(
        "insert into projects (user_id, organization_id, name) values ($1, $2, $3) returning id",
        [userId, orgId, p.name]
      );
      projectId = r.rows[0].id;
    }

    for (const q of p.queues) {
      const existingQ = await query<{ id: string }>("select id from queues where project_id = $1 and name = $2", [
        projectId,
        q.name,
      ]);
      if (existingQ.rowCount) {
        console.log(`  ${p.name} / ${q.name} already seeded, skipping`);
        continue;
      }
      const r = await query<{ id: string }>(
        `insert into queues (project_id, name, concurrency_limit, retry_strategy, retry_base_delay_ms, max_attempts, is_paused)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [projectId, q.name, q.concurrency, q.retry, q.base, q.max, Boolean(q.paused)]
      );
      const queueId = r.rows[0].id;

      const jobCount = 18 + Math.floor(Math.random() * 18);
      for (let i = 0; i < jobCount; i++) {
        await seedJob(queueId, q);
      }
      console.log(`  ${p.name} / ${q.name}: seeded ${jobCount} jobs`);
    }
  }

  // Historical/scaled-down workers: kept as "stopped" (not "active") so their status
  // is stable across page loads rather than flipping to "stale" ~30s after seeding.
  const fakeWorkers = [
    { hostname: "ip-10-0-4-12.ec2.internal", pid: 4521, heartbeatAgo: 3 * 3600 },
    { hostname: "ip-10-0-4-19.ec2.internal", pid: 4522, heartbeatAgo: 7 * 3600 },
    { hostname: "ip-10-0-2-88.ec2.internal", pid: 3390, heartbeatAgo: 26 * 3600 },
  ];
  for (const w of fakeWorkers) {
    const exists = await query("select id from workers where hostname = $1", [w.hostname]);
    if (exists.rowCount) continue;
    await query(
      `insert into workers (id, hostname, pid, status, started_at, last_heartbeat_at)
       values ($1,$2,$3,'stopped',$4,$5)`,
      [randomUUID(), w.hostname, w.pid, daysAgo(3), new Date(Date.now() - w.heartbeatAgo * 1000)]
    );
  }

  console.log(`\nDone. Log in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
