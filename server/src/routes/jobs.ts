import { Router } from "express";
import parser from "cron-parser";
import { query, notifyJobsReady } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth, type AuthRequest } from "../auth.js";
import { queueRole, jobRole } from "../membership.js";
import { broadcast } from "../ws.js";

const router = Router();
router.use(requireAuth);

const JOB_TYPES = ["immediate", "delayed", "scheduled", "recurring", "batch"];
const MAX_BATCH = 1000;

async function queueById(queueId: string) {
  const { rows } = await query("select * from queues where id = $1", [queueId]);
  return rows[0];
}

function firstRunAt(type: string, body: any): Date {
  switch (type) {
    case "delayed":
      return new Date(Date.now() + (Number(body.delay_ms) || 0));
    case "scheduled":
      return new Date(body.run_at);
    case "recurring":
      return parser.parseExpression(body.cron_expr).next().toDate();
    default:
      return new Date();
  }
}

router.post(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { queue_id, type = "immediate", payload = {}, priority = 0, depends_on_job_id = null } = req.body ?? {};
    if (!queue_id) return res.status(400).json({ error: "queue_id is required" });
    if (!JOB_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of ${JOB_TYPES.join(", ")}` });
    }
    const role = await queueRole(queue_id, req.userId!);
    if (!role) return res.status(404).json({ error: "queue not found" });
    if (role !== "admin") return res.status(403).json({ error: "viewers cannot submit jobs" });
    const queue = await queueById(queue_id);

    if (depends_on_job_id) {
      const depRole = await jobRole(depends_on_job_id, req.userId!);
      if (!depRole) return res.status(400).json({ error: "depends_on_job_id not found" });
    }

    const maxAttempts = Number(req.body?.max_attempts) || queue.max_attempts;

    // Per-type input validation, so a bad request fails with a 400 rather than a 500
    // (invalid date / cron) or an unbounded insert.
    if (type === "recurring") {
      if (!req.body?.cron_expr) {
        return res.status(400).json({ error: "cron_expr is required for recurring jobs" });
      }
      try {
        parser.parseExpression(req.body.cron_expr);
      } catch {
        return res.status(400).json({ error: "cron_expr is not a valid cron expression" });
      }
    }
    if (type === "scheduled") {
      if (!req.body?.run_at) {
        return res.status(400).json({ error: "run_at is required for scheduled jobs" });
      }
      if (Number.isNaN(Date.parse(req.body.run_at))) {
        return res.status(400).json({ error: "run_at must be a valid ISO date string" });
      }
    }
    if (type === "delayed") {
      const d = Number(req.body?.delay_ms);
      if (!Number.isFinite(d) || d < 0) {
        return res.status(400).json({ error: "delay_ms must be a non-negative number" });
      }
    }

    if (type === "batch") {
      const items = Array.isArray(payload) ? payload : [];
      if (!items.length) {
        return res.status(400).json({ error: "batch jobs require a non-empty payload array" });
      }
      if (items.length > MAX_BATCH) {
        return res.status(400).json({ error: `batch is limited to ${MAX_BATCH} items` });
      }
      const values: string[] = [];
      const params: unknown[] = [];
      items.forEach((item, i) => {
        const base = i * 4;
        values.push(`($${base + 1}, 'batch', $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(queue_id, JSON.stringify(item), priority, maxAttempts);
      });
      const { rows } = await query(
        `insert into jobs (queue_id, type, payload, priority, max_attempts)
         values ${values.join(", ")} returning id`,
        params
      );
      broadcast("jobs");
      notifyJobsReady(queue_id); // batch items are queued and immediately runnable
      return res.status(201).json({ created: rows.length, ids: rows.map((r) => r.id) });
    }

    const status = type === "immediate" ? "queued" : "scheduled";
    const runAt = firstRunAt(type, req.body ?? {});
    const { rows } = await query(
      `insert into jobs (queue_id, type, payload, status, priority, run_at, cron_expr, max_attempts, depends_on_job_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [queue_id, type, payload, status, priority, runAt, req.body?.cron_expr ?? null, maxAttempts, depends_on_job_id]
    );
    broadcast("jobs");
    // Immediate jobs are runnable now; scheduled/delayed/recurring wait for the scheduler.
    if (status === "queued" && !depends_on_job_id) notifyJobsReady(queue_id);
    res.status(201).json(rows[0]);
  })
);

router.get(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { queue_id, status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const params: unknown[] = [req.userId];
    let sql = `select j.*, dep.status as depends_on_status from jobs j
               join queues q on q.id = j.queue_id
               join project_members pm on pm.project_id = q.project_id
               left join jobs dep on dep.id = j.depends_on_job_id
               where pm.user_id = $1`;
    if (queue_id) {
      params.push(queue_id);
      sql += ` and j.queue_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` and j.status = $${params.length}`;
    }
    params.push(limit, offset);
    sql += ` order by j.created_at desc limit $${params.length - 1} offset $${params.length}`;
    const { rows } = await query(sql, params);
    res.json(rows);
  })
);

router.get(
  "/:id",
  wrap(async (req: AuthRequest, res) => {
    const { rows } = await query(
      `select j.*, dep.status as depends_on_status from jobs j
       join queues q on q.id = j.queue_id
       join project_members pm on pm.project_id = q.project_id
       left join jobs dep on dep.id = j.depends_on_job_id
       where j.id = $1 and pm.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "job not found" });
    const executions = await query(
      "select * from job_executions where job_id = $1 order by started_at",
      [req.params.id]
    );
    const logs = await query(
      "select level, message, attempt, created_at from job_logs where job_id = $1 order by created_at",
      [req.params.id]
    );
    res.json({ ...rows[0], executions: executions.rows, logs: logs.rows });
  })
);

router.post(
  "/:id/retry",
  wrap(async (req: AuthRequest, res) => {
    const role = await jobRole(req.params.id, req.userId!);
    if (!role) return res.status(404).json({ error: "job not found" });
    if (role !== "admin") return res.status(403).json({ error: "viewers cannot retry jobs" });

    const { rows } = await query(
      `update jobs set status = 'queued', run_at = now(), attempt_count = 0,
                       worker_id = null, last_error = null, updated_at = now()
       where id = $1 and status in ('failed', 'dead_letter')
       returning *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "retryable job not found" });
    broadcast("jobs");
    res.json(rows[0]);
  })
);

export default router;
