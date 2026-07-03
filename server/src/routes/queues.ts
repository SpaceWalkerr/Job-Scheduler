import { Router } from "express";
import { query } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth, type AuthRequest } from "../auth.js";
import { projectRole, queueRole } from "../membership.js";
import { broadcast } from "../ws.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { project_id } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Number(req.query.offset) || 0;
    const params: unknown[] = [req.userId];
    let sql = `select q.* from queues q
               join project_members pm on pm.project_id = q.project_id
               where pm.user_id = $1`;
    if (project_id) {
      params.push(project_id);
      sql += ` and q.project_id = $${params.length}`;
    }
    params.push(limit, offset);
    sql += ` order by q.priority desc, q.created_at desc limit $${params.length - 1} offset $${params.length}`;
    const { rows } = await query(sql, params);
    res.json(rows);
  })
);

router.post(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { project_id, name, priority, concurrency_limit, retry_strategy, retry_base_delay_ms, max_attempts } =
      req.body ?? {};
    if (!project_id || !name) {
      return res.status(400).json({ error: "project_id and name are required" });
    }
    const role = await projectRole(project_id, req.userId!);
    if (!role) return res.status(404).json({ error: "project not found" });
    if (role !== "admin") return res.status(403).json({ error: "viewers cannot create queues" });

    const { rows } = await query(
      `insert into queues (project_id, name, priority, concurrency_limit, retry_strategy, retry_base_delay_ms, max_attempts)
       values ($1, $2, coalesce($3, 0), coalesce($4, 5), coalesce($5, 'exponential'), coalesce($6, 1000), coalesce($7, 3))
       returning *`,
      [project_id, name, priority, concurrency_limit, retry_strategy, retry_base_delay_ms, max_attempts]
    );
    broadcast("queues");
    res.status(201).json(rows[0]);
  })
);

const EDITABLE = [
  "name",
  "priority",
  "concurrency_limit",
  "retry_strategy",
  "retry_base_delay_ms",
  "max_attempts",
  "is_paused",
];

router.patch(
  "/:id",
  wrap(async (req: AuthRequest, res) => {
    const role = await queueRole(req.params.id, req.userId!);
    if (!role) return res.status(404).json({ error: "queue not found" });
    if (role !== "admin") return res.status(403).json({ error: "viewers cannot modify queues" });

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const field of EDITABLE) {
      if (req.body?.[field] !== undefined) {
        params.push(req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "no editable fields provided" });

    params.push(req.params.id);
    const { rows } = await query(
      `update queues set ${sets.join(", ")} where id = $${params.length} returning *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "queue not found" });
    broadcast("queues");
    res.json(rows[0]);
  })
);

export default router;
