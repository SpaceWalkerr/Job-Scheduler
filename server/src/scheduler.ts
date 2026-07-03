import parser from "cron-parser";
import { query, notifyJobsReady } from "./db.js";
import { tryBecomeLeader, type LeaderHandle } from "./leader.js";
import { broadcast } from "./ws.js";

const TICK_INTERVAL_MS = 2000;
const LEADER_RETRY_MS = 10000;
const WORKER_TIMEOUT = "30 seconds";

function wakeQueues(queueIds: string[]) {
  for (const id of new Set(queueIds)) notifyJobsReady(id);
}

async function tick() {
  let jobsChanged = false;

  // Promote one-off delayed/scheduled jobs whose time has come.
  const promoted = await query<{ queue_id: string }>(
    `update jobs set status = 'queued', updated_at = now()
     where status = 'scheduled' and type in ('delayed', 'scheduled') and run_at <= now()
     returning queue_id`
  );
  if (promoted.rowCount) {
    jobsChanged = true;
    wakeQueues(promoted.rows.map((r) => r.queue_id));
  }

  // Recurring jobs act as templates: spawn a runnable child and advance to the next cron time.
  const due = await query<{ id: string; queue_id: string; payload: any; priority: number; max_attempts: number; cron_expr: string }>(
    "select id, queue_id, payload, priority, max_attempts, cron_expr from jobs where status = 'scheduled' and type = 'recurring' and run_at <= now()"
  );
  for (const job of due.rows) {
    await query(
      `insert into jobs (queue_id, type, payload, status, priority, max_attempts)
       values ($1, 'immediate', $2, 'queued', $3, $4)`,
      [job.queue_id, job.payload, job.priority, job.max_attempts]
    );
    const next = parser.parseExpression(job.cron_expr).next().toDate();
    await query("update jobs set run_at = $2, updated_at = now() where id = $1", [job.id, next]);
    notifyJobsReady(job.queue_id);
    jobsChanged = true;
  }

  // Reap jobs stuck on workers that stopped sending heartbeats (crash recovery).
  const reaped = await query<{ queue_id: string }>(
    `update jobs set status = 'queued', worker_id = null, updated_at = now()
     where status in ('claimed', 'running')
       and worker_id in (select id from workers where last_heartbeat_at < now() - interval '${WORKER_TIMEOUT}')
     returning queue_id`
  );
  if (reaped.rowCount) {
    jobsChanged = true;
    wakeQueues(reaped.rows.map((r) => r.queue_id));
  }

  const staleWorkers = await query(
    `update workers set status = 'stopped'
     where status <> 'stopped' and last_heartbeat_at < now() - interval '${WORKER_TIMEOUT}'`
  );

  if (jobsChanged) broadcast("jobs");
  if (staleWorkers.rowCount) broadcast("workers");
}

// Only one process may run the tick loop at a time — otherwise two instances could
// both spawn a child for the same due recurring job before either advances its
// run_at. Leadership is a Postgres advisory lock (see leader.ts): whichever
// instance grabs it runs the scheduler; the rest stand by and retry periodically,
// so if the leader crashes (and its connection drops) another takes over.
export function startScheduler() {
  let handle: LeaderHandle | null = null;
  let tickTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let announcedStandby = false;

  async function attempt() {
    if (stopped || handle?.isLeader) return;
    handle = await tryBecomeLeader();
    if (handle.isLeader) {
      console.log("scheduler: leadership acquired, starting tick loop");
      tickTimer = setInterval(() => {
        tick().catch((err) => console.error("scheduler error:", err));
      }, TICK_INTERVAL_MS);
    } else if (!announcedStandby) {
      announcedStandby = true;
      console.log(
        `scheduler: another instance already holds leadership, standing by (retrying every ${LEADER_RETRY_MS / 1000}s)`
      );
    }
  }

  attempt().catch((err) => console.error("scheduler leader election error:", err));
  const retryTimer = setInterval(() => {
    attempt().catch((err) => console.error("scheduler leader election error:", err));
  }, LEADER_RETRY_MS);

  return async () => {
    stopped = true;
    clearInterval(retryTimer);
    if (tickTimer) clearInterval(tickTimer);
    if (handle) await handle.release();
  };
}
