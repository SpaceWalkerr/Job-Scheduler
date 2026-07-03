import { useEffect, useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";

interface Queue {
  id: string;
  name: string;
}
interface Job {
  id: string;
  type: string;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  depends_on_job_id?: string | null;
  depends_on_status?: string | null;
}

function isBlocked(j: Job) {
  return Boolean(j.depends_on_job_id) && j.depends_on_status !== "completed" && j.status === "queued";
}

const STATUS_FILTERS = ["", "queued", "scheduled", "running", "completed", "failed", "dead_letter"];

export default function Jobs({ projectId, myRole }: { projectId: string; myRole: string }) {
  const isAdmin = myRole === "admin";
  const [queues, setQueues] = useState<Queue[]>([]);
  const [queueId, setQueueId] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const [type, setType] = useState("immediate");
  const [payload, setPayload] = useState('{ "ms": 500 }');
  const [delayMs, setDelayMs] = useState(5000);
  const [cron, setCron] = useState("*/1 * * * *");
  const [dependsOn, setDependsOn] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.queues(projectId).then((qs: Queue[]) => {
      setQueues(qs);
      if (qs.length && !queueId) setQueueId(qs[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const { data: jobs } = usePolling<Job[]>(
    () => (queueId ? api.jobs({ queue_id: queueId, ...(status ? { status } : {}) }) : Promise.resolve([])),
    8000,
    [queueId, status],
    "jobs"
  );

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const body: Record<string, unknown> = { queue_id: queueId, type, payload: JSON.parse(payload) };
      if (type === "delayed") body.delay_ms = delayMs;
      if (type === "scheduled") body.run_at = new Date(Date.now() + delayMs).toISOString();
      if (type === "recurring") body.cron_expr = cron;
      if (dependsOn.trim()) body.depends_on_job_id = dependsOn.trim();
      await api.createJob(body);
      setDependsOn("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>{isAdmin ? "Submit job" : "Job queue"}</h2>
          <select value={queueId} onChange={(e) => setQueueId(e.target.value)}>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <>
            <div className="row end">
              <div>
                <label>type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="immediate">immediate</option>
                  <option value="delayed">delayed</option>
                  <option value="scheduled">scheduled</option>
                  <option value="recurring">recurring</option>
                </select>
              </div>
              {(type === "delayed" || type === "scheduled") && (
                <div>
                  <label>delay (ms)</label>
                  <input
                    type="number"
                    value={delayMs}
                    onChange={(e) => setDelayMs(Number(e.target.value))}
                    style={{ width: 100 }}
                  />
                </div>
              )}
              {type === "recurring" && (
                <div>
                  <label>cron</label>
                  <input value={cron} onChange={(e) => setCron(e.target.value)} style={{ width: 130 }} />
                </div>
              )}
              <div>
                <label>depends on (job id, optional)</label>
                <input
                  value={dependsOn}
                  onChange={(e) => setDependsOn(e.target.value)}
                  placeholder="paste a job id"
                  style={{ width: 230 }}
                />
              </div>
            </div>
            <form onSubmit={createJob}>
              <div className="field" style={{ marginTop: 10 }}>
                <label>payload (JSON) — supports {"{ ms, fail, fail_rate }"}</label>
                <textarea value={payload} onChange={(e) => setPayload(e.target.value)} />
              </div>
              {error && <div className="err">{error}</div>}
              <button className="primary" type="submit" disabled={!queueId}>
                Submit
              </button>
            </form>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Jobs</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s || "all statuses"}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(jobs || []).map((j) => (
                <tr key={j.id} className="clickable" onClick={() => setSelected(j.id)}>
                  <td className="mono">{j.id.slice(0, 8)}</td>
                  <td>{j.type}</td>
                  <td>
                    {isBlocked(j) ? (
                      <span className="badge scheduled">blocked</span>
                    ) : (
                      <span className={`badge ${j.status}`}>{j.status}</span>
                    )}
                  </td>
                  <td>
                    {j.attempt_count}/{j.max_attempts}
                  </td>
                  <td className="muted">{new Date(j.created_at).toLocaleTimeString()}</td>
                  <td>
                    <button
                      className="ghost sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(j.id);
                      }}
                      title="Copy full job id"
                    >
                      Copy id
                    </button>
                  </td>
                </tr>
              ))}
              {jobs && jobs.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">No jobs in this queue yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <JobModal id={selected} onClose={() => setSelected(null)} isAdmin={isAdmin} />}
    </>
  );
}

function JobModal({ id, onClose, isAdmin }: { id: string; onClose: () => void; isAdmin: boolean }) {
  const { data } = usePolling<any>(() => api.job(id), 5000, [id], "jobs");

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!data ? (
          <div className="muted">Loading…</div>
        ) : (
          <>
            <div className="modal-head">
              <h2>
                Job <span className="mono faint">{data.id.slice(0, 8)}</span>
                {isBlocked(data) ? (
                  <span className="badge scheduled">blocked</span>
                ) : (
                  <span className={`badge ${data.status}`}>{data.status}</span>
                )}
              </h2>
              <button className="ghost sm" onClick={onClose}>
                Close
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted">
                type <b style={{ color: "var(--text)" }}>{data.type}</b>
              </span>
              <span className="dot-sep">·</span>
              <span className="muted">
                attempts{" "}
                <b style={{ color: "var(--text)" }}>
                  {data.attempt_count}/{data.max_attempts}
                </b>
              </span>
              <div className="spacer" />
              <button className="ghost sm" onClick={() => navigator.clipboard.writeText(data.id)}>
                Copy full id
              </button>
              {isAdmin && (data.status === "failed" || data.status === "dead_letter") && (
                <button className="primary sm" onClick={() => api.retryJob(id)}>
                  Retry job
                </button>
              )}
            </div>
            {data.depends_on_job_id && (
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Depends on <span className="mono">{data.depends_on_job_id.slice(0, 8)}</span> —{" "}
                <span className={`badge ${data.depends_on_status}`}>{data.depends_on_status}</span>
              </div>
            )}
            {data.last_error && <div className="err">Last error: {data.last_error}</div>}
            <div className="field" style={{ marginTop: 16 }}>
              <label>Payload</label>
              <pre>{JSON.stringify(data.payload, null, 2)}</pre>
            </div>
            <label style={{ marginTop: 8 }}>Executions</label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.executions.map((e: any) => (
                    <tr key={e.id}>
                      <td>{e.attempt}</td>
                      <td>
                        <span className={`badge ${e.status}`}>{e.status}</span>
                      </td>
                      <td className="muted">{new Date(e.started_at).toLocaleTimeString()}</td>
                      <td className="muted">{e.error || "—"}</td>
                    </tr>
                  ))}
                  {data.executions.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <div className="empty">Not executed yet.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <label style={{ marginTop: 16 }}>Logs</label>
            <div className="log-view">
              {(data.logs || []).map((l: any, i: number) => (
                <div key={i} className="log-line">
                  <span className="log-time">{new Date(l.created_at).toLocaleTimeString()}</span>
                  <span className={`log-level ${l.level}`}>{l.level}</span>
                  <span className="log-msg">{l.message}</span>
                </div>
              ))}
              {(!data.logs || data.logs.length === 0) && <div className="empty">No logs yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
