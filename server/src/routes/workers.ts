import { Router } from "express";
import { query } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Number(req.query.offset) || 0;
    const { rows } = await query(
      `select w.*,
              extract(epoch from now() - w.last_heartbeat_at) as seconds_since_heartbeat,
              (select count(*) from jobs j
               where j.worker_id = w.id and j.status in ('claimed', 'running')) as active_jobs,
              (select count(*) from worker_heartbeats h
               where h.worker_id = w.id and h.created_at > now() - interval '15 minutes') as heartbeats_15m
       from workers w
       order by w.last_heartbeat_at desc
       limit $1 offset $2`,
      [limit, offset]
    );
    res.json(rows);
  })
);

// Recent heartbeat pings for one worker (newest first).
router.get(
  "/:id/heartbeats",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select active_jobs, created_at from worker_heartbeats
       where worker_id = $1 order by created_at desc limit 100`,
      [req.params.id]
    );
    res.json(rows);
  })
);

export default router;
