import os from "node:os";
import { randomUUID } from "node:crypto";
import { pool, query, notifyJobsReady } from "./db.js";
import { nextRetryDelayMs, type RetryStrategy } from "./retry.js";
import { broadcast } from "./ws.js";

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 5000;
const SHUTDOWN_GRACE_MS = 10000;

export interface Job {
  id: string;
  queue_id: string;
  payload: any;
  attempt_count: number;
  max_attempts: number;
}

// Append a human-readable log line for a job. Logging must never break execution,
// so failures here are swallowed.
async function logJob(
  jobId: string,
  executionId: string | null,
  attempt: number | null,
  level: "info" | "warn" | "error",
  message: string
) {
  await query(
    "insert into job_logs (job_id, execution_id, attempt, level, message) values ($1, $2, $3, $4, $5)",
    [jobId, executionId, attempt, level, message]
  ).catch(() => {});
}

// Atomically claim up to `limit` due jobs from a queue. SKIP LOCKED lets many
// workers hit the same queue concurrently without ever grabbing the same row.
//
// A job with `depends_on_job_id` set is only eligible once that dependency has
// completed. The dependency row is read via LEFT JOIN but must NOT be locked —
// only the candidate job (`j`) is being claimed — so this uses
// `FOR UPDATE OF j SKIP LOCKED` rather than a plain `FOR UPDATE SKIP LOCKED`,
// which would otherwise also try to lock the joined dependency rows.
export async function claimJobs(workerId: string, queueId: string, limit: number): Promise<Job[]> {
  const { rows } = await query<Job>(
    `update jobs set status = 'claimed', worker_id = $1, updated_at = now()
     where id in (
       select j.id from jobs j
       left join jobs dep on dep.id = j.depends_on_job_id
       where j.queue_id = $2 and j.status = 'queued' and j.run_at <= now()
         and (j.depends_on_job_id is null or dep.status = 'completed')
       order by j.priority desc, j.run_at
       limit $3
       for update of j skip locked
     )
     returning id, queue_id, payload, attempt_count, max_attempts`,
    [workerId, queueId, limit]
  );
  return rows;
}

// Claim jobs while enforcing the queue's concurrency limit as a HARD bound across all
// workers. A per-queue advisory lock (held for the transaction) serializes the
// "count in-flight → claim remaining slots" step, so two workers can't both read the
// same in-flight count and each fill the queue.
export async function claimWithConcurrencyLimit(
  workerId: string,
  queueId: string,
  concurrencyLimit: number,
  rateLimitPerMinute: number | null,
  numWorkers: number,
  workerIndex: number
): Promise<Job[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [queueId]);
    
    // 1. Rate Limiting: Token Bucket
    let availableTokens = Infinity;
    if (rateLimitPerMinute !== null) {
      const q = await client.query<{ tokens: number, last_refill_at: Date }>(
        "select tokens, last_refill_at from queues where id = $1", [queueId]
      );
      if (q.rows.length) {
        const { tokens, last_refill_at } = q.rows[0];
        const now = Date.now();
        const elapsedMs = now - last_refill_at.getTime();
        const refillRatePerMs = rateLimitPerMinute / 60000;
        let newTokens = tokens + (elapsedMs * refillRatePerMs);
        if (newTokens > rateLimitPerMinute) newTokens = rateLimitPerMinute;
        
        await client.query(
          "update queues set tokens = $1, last_refill_at = now() where id = $2",
          [newTokens, queueId]
        );
        availableTokens = Math.floor(newTokens);
      }
    }

    const inflight = await client.query<{ c: number }>(
      "select count(*)::int as c from jobs where queue_id = $1 and status in ('claimed', 'running')",
      [queueId]
    );
    let slots = concurrencyLimit - inflight.rows[0].c;
    
    if (rateLimitPerMinute !== null) {
      slots = Math.min(slots, availableTokens);
    }

    if (slots <= 0) {
      await client.query("commit");
      return [];
    }

    // 2. Claim with Consistent Hashing support (affinity_key)
    const { rows } = await client.query<Job>(
      `update jobs set status = 'claimed', worker_id = $1, updated_at = now()
       where id in (
         select j.id from jobs j
         left join jobs dep on dep.id = j.depends_on_job_id
         where j.queue_id = $2 and j.status = 'queued' and j.run_at <= now()
           and (j.depends_on_job_id is null or dep.status = 'completed')
           and (j.affinity_key is null or abs(hashtext(j.affinity_key)) % $4 = $5)
         order by j.priority desc, j.run_at
         limit $3
         for update of j skip locked
       )
       returning id, queue_id, payload, attempt_count, max_attempts`,
      [workerId, queueId, slots, numWorkers, workerIndex]
    );
    
    // Deduct tokens used
    if (rateLimitPerMinute !== null && rows.length > 0) {
      await client.query(
        "update queues set tokens = tokens - $1 where id = $2",
        [rows.length, queueId]
      );
    }

    await client.query("commit");
    return rows;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Demo job handler. The payload can steer behaviour so we can exercise the
// success / retry / dead-letter paths: { ms, fail, fail_rate }.
async function execute(payload: any): Promise<void> {
  if (payload?.fail === true) throw new Error("forced failure");
  if (typeof payload?.fail_rate === "number" && Math.random() < payload.fail_rate) {
    throw new Error("random failure");
  }
  await new Promise((r) => setTimeout(r, Number(payload?.ms) || 200));
}

// Decide what happens to a job whose attempt just failed: exhaust it to the
// dead-letter queue, or re-queue it with a backoff delay from the queue's retry
// policy. Module-level and dependency-free (only a job + the failed attempt) so the
// retry/dead-letter transition can be unit-tested directly.
export async function handleFailure(job: Job, failedAttempt: number, message: string, execId: string | null) {
  if (failedAttempt >= job.max_attempts) {
    await query(
      `insert into dead_letter_jobs (original_job_id, queue_id, payload, failure_reason, attempts)
       values ($1, $2, $3, $4, $5)`,
      [job.id, job.queue_id, job.payload, message, failedAttempt]
    );
    await query("update jobs set status = 'dead_letter', last_error = $2, updated_at = now() where id = $1", [
      job.id,
      message,
    ]);
    await logJob(job.id, execId, failedAttempt, "error", `exhausted ${failedAttempt} attempts — moved to dead-letter queue`);
    return;
  }
  const { rows } = await query<{ retry_strategy: RetryStrategy; retry_base_delay_ms: number }>(
    "select retry_strategy, retry_base_delay_ms from queues where id = $1",
    [job.queue_id]
  );
  const delay = nextRetryDelayMs(rows[0].retry_strategy, rows[0].retry_base_delay_ms, failedAttempt);
  await query(
    `update jobs set status = 'queued', worker_id = null, last_error = $2,
                     run_at = now() + ($3::bigint) * interval '1 millisecond', updated_at = now()
     where id = $1`,
    [job.id, message, delay]
  );
  await logJob(
    job.id,
    execId,
    failedAttempt,
    "warn",
    `retry ${failedAttempt + 1}/${job.max_attempts} scheduled in ${delay}ms (${rows[0].retry_strategy})`
  );
}

export async function startWorker() {
  const workerId = randomUUID();
  await query("insert into workers (id, hostname, pid) values ($1, $2, $3)", [
    workerId,
    os.hostname(),
    process.pid,
  ]);
  await query("insert into worker_heartbeats (worker_id, active_jobs) values ($1, 0)", [workerId]).catch(() => {});
  console.log(`worker ${workerId.slice(0, 8)} registered`);
  broadcast("workers");

  const inFlight = new Set<string>();
  let running = true;

  async function runJob(job: Job) {
    const attempt = job.attempt_count + 1;
    await query("update jobs set status = 'running', attempt_count = $2, updated_at = now() where id = $1", [
      job.id,
      attempt,
    ]);
    const exec = await query<{ id: string }>(
      "insert into job_executions (job_id, worker_id, attempt, status) values ($1, $2, $3, 'running') returning id",
      [job.id, workerId, attempt]
    );
    const execId = exec.rows[0].id;
    await logJob(job.id, execId, attempt, "info", `attempt ${attempt} started on worker ${workerId.slice(0, 8)}`);
    const startedAt = Date.now();

    try {
      await execute(job.payload);
      await query("update jobs set status = 'completed', updated_at = now() where id = $1", [job.id]);
      await query("update job_executions set status = 'completed', finished_at = now() where id = $1", [execId]);
      await logJob(job.id, execId, attempt, "info", `completed in ${Date.now() - startedAt}ms`);
      // A completion may unblock jobs that depend on this one — wake the queue.
      notifyJobsReady(job.queue_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await query("update job_executions set status = 'failed', finished_at = now(), error = $2 where id = $1", [
        execId,
        message,
      ]);
      await logJob(job.id, execId, attempt, "error", `attempt ${attempt} failed: ${message}`);
      await handleFailure(job, attempt, message, execId);
    }
    broadcast("jobs");
  }

  async function poll() {
    if (!running) return;
    
    // 1. Get active workers for consistent hashing
    const activeWorkers = await query<{id: string}>(
      "select id from workers where status = 'active' order by id"
    );
    const numWorkers = activeWorkers.rows.length || 1;
    const workerIndex = activeWorkers.rows.findIndex(w => w.id === workerId) >= 0 
      ? activeWorkers.rows.findIndex(w => w.id === workerId) 
      : 0;

    // Higher-priority queues are claimed first so their jobs win scarce worker
    // capacity; within a queue, jobs are still ordered by their own priority. Each
    // queue's concurrency limit is enforced atomically as a hard bound.
    const queues = await query<{ id: string; concurrency_limit: number, rate_limit_per_minute: number | null }>(
      "select id, concurrency_limit, rate_limit_per_minute from queues where is_paused = false order by priority desc, created_at"
    );
    for (const q of queues.rows) {
      const jobs = await claimWithConcurrencyLimit(
        workerId, 
        q.id, 
        q.concurrency_limit,
        q.rate_limit_per_minute,
        numWorkers,
        workerIndex
      );
      if (jobs.length) broadcast("jobs");
      for (const job of jobs) {
        inFlight.add(job.id);
        runJob(job).finally(() => inFlight.delete(job.id));
      }
    }
  }

  // Event-driven wakeup: LISTEN for enqueue notifications and poll immediately,
  // coalescing bursts into a single poll. The interval below stays as a safety-net
  // fallback (and covers delayed/scheduled jobs that become due without a NOTIFY).
  let pollQueued = false;
  function triggerPoll() {
    if (pollQueued || !running) return;
    pollQueued = true;
    setImmediate(() => {
      pollQueued = false;
      poll().catch((err) => console.error("poll error:", err));
    });
  }
  const listenClient = await pool.connect();
  await listenClient.query("LISTEN jobs_ready");
  listenClient.on("notification", () => triggerPoll());
  listenClient.on("error", (err) => console.error("listen client error:", err.message));

  const pollTimer = setInterval(() => {
    poll().catch((err) => console.error("poll error:", err));
  }, POLL_INTERVAL_MS);

  const heartbeatTimer = setInterval(() => {
    const active = inFlight.size;
    query("update workers set last_heartbeat_at = now() where id = $1", [workerId]).catch(() => {});
    query("insert into worker_heartbeats (worker_id, active_jobs) values ($1, $2)", [workerId, active]).catch(() => {});
    // Bounded retention: keep the last hour of pings per worker.
    query("delete from worker_heartbeats where worker_id = $1 and created_at < now() - interval '1 hour'", [
      workerId,
    ]).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  async function shutdown() {
    running = false;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    listenClient.removeAllListeners("notification");
    listenClient.release();
    await query("update workers set status = 'draining' where id = $1", [workerId]).catch(() => {});

    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while (inFlight.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    // Release anything that didn't finish so another worker can pick it up.
    await query(
      "update jobs set status = 'queued', worker_id = null, updated_at = now() where worker_id = $1 and status in ('claimed', 'running')",
      [workerId]
    ).catch(() => {});
    await query("update workers set status = 'stopped' where id = $1", [workerId]).catch(() => {});
    broadcast("jobs");
    broadcast("workers");
    console.log(`worker ${workerId.slice(0, 8)} stopped`);
  }

  return { workerId, shutdown };
}
