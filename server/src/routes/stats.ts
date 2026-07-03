import { Router } from "express";
import { query } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth, type AuthRequest } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const byStatus = await query(
      `select j.status, count(*)::int as count
       from jobs j
       join queues q on q.id = j.queue_id
       join project_members pm on pm.project_id = q.project_id
       where pm.user_id = $1
       group by j.status`,
      [req.userId]
    );

    const byQueue = await query(
      `select q.id as queue_id, q.name, q.is_paused,
              count(j.id) filter (where j.status = 'queued')::int    as queued,
              count(j.id) filter (where j.status = 'running')::int   as running,
              count(j.id) filter (where j.status = 'completed')::int as completed,
              count(j.id) filter (where j.status = 'failed')::int    as failed,
              count(j.id) filter (where j.status = 'dead_letter')::int as dead_letter
       from queues q
       join project_members pm on pm.project_id = q.project_id
       left join jobs j on j.queue_id = q.id
       where pm.user_id = $1
       group by q.id, q.name, q.is_paused
       order by q.name`,
      [req.userId]
    );

    const status: Record<string, number> = {};
    for (const row of byStatus.rows) status[row.status] = row.count;

    res.json({ status, queues: byQueue.rows });
  })
);

router.get(
  "/throughput",
  wrap(async (req: AuthRequest, res) => {
    const { rows } = await query(
      `select to_char(date_trunc('day', e.started_at), 'YYYY-MM-DD') as day,
              count(*) filter (where e.status = 'completed')::int as completed,
              count(*) filter (where e.status = 'failed')::int as failed
       from job_executions e
       join jobs j on j.id = e.job_id
       join queues q on q.id = j.queue_id
       join project_members pm on pm.project_id = q.project_id
       where pm.user_id = $1 and e.started_at > now() - interval '7 days'
       group by 1
       order by 1`,
      [req.userId]
    );
    res.json(rows);
  })
);

export default router;
