import { useEffect, useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";
import { Copy, Plus, RefreshCw, X, Play, Clock, AlertCircle } from "lucide-react";

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

  const getStatusBadge = (jobStatus: string, blocked: boolean) => {
    if (blocked) return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Blocked</span>;
    switch (jobStatus) {
      case "queued": return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Queued</span>;
      case "running": return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Running</span>;
      case "completed": return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Completed</span>;
      case "failed": return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</span>;
      case "dead_letter": return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300">Dead Letter</span>;
      default: return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{jobStatus}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {isAdmin ? "Submit Job" : "Job Queue"}
          </h2>
          <select 
            value={queueId} 
            onChange={(e) => setQueueId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          >
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>
        
        {isAdmin && (
          <div className="p-6">
            <form onSubmit={createJob} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</label>
                  <select 
                    value={type} 
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                  >
                    <option value="immediate">Immediate</option>
                    <option value="delayed">Delayed</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
                
                {(type === "delayed" || type === "scheduled") && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delay (ms)</label>
                    <input
                      type="number"
                      value={delayMs}
                      onChange={(e) => setDelayMs(Number(e.target.value))}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    />
                  </div>
                )}
                
                {type === "recurring" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cron</label>
                    <input 
                      value={cron} 
                      onChange={(e) => setCron(e.target.value)} 
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    />
                  </div>
                )}
                
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Depends On (Job ID, Optional)</label>
                  <input
                    value={dependsOn}
                    onChange={(e) => setDependsOn(e.target.value)}
                    placeholder="Paste a Job ID"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                  <span>Payload (JSON)</span>
                  <span className="font-normal opacity-70">Supports: {`{ ms, fail, fail_rate }`}</span>
                </label>
                <textarea 
                  value={payload} 
                  onChange={(e) => setPayload(e.target.value)} 
                  className="w-full h-24 font-mono rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm resize-y"
                />
              </div>
              
              {error && <div className="text-sm font-medium text-red-600 dark:text-red-400">{error}</div>}
              
              <div className="flex justify-end pt-2">
                <button 
                  type="submit" 
                  disabled={!queueId}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  <Plus size={16} />
                  Submit Job
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Jobs</h2>
          <select 
            value={status} 
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : "All Statuses"}</option>
            ))}
          </select>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Attempts</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(jobs || []).map((j) => (
                <tr 
                  key={j.id} 
                  onClick={() => setSelected(j.id)}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono font-semibold text-foreground">{j.id.slice(0, 8)}</td>
                  <td className="px-6 py-4 text-foreground capitalize">{j.type}</td>
                  <td className="px-6 py-4">
                    {getStatusBadge(j.status, isBlocked(j))}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <span className="font-medium text-foreground">{j.attempt_count}</span>/{j.max_attempts}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(j.created_at).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(j.id); }}
                      className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
                      title="Copy full job id"
                    >
                      <Copy size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {jobs && jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    No jobs in this queue yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <JobModal id={selected} onClose={() => setSelected(null)} isAdmin={isAdmin} />}
    </div>
  );
}

function JobModal({ id, onClose, isAdmin }: { id: string; onClose: () => void; isAdmin: boolean }) {
  const { data } = usePolling<any>(() => api.job(id), 5000, [id], "jobs");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div 
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-0 shadow-lg animate-in zoom-in-95 duration-200" 
        onClick={(e) => e.stopPropagation()}
      >
        {!data ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">
                  Job <span className="font-mono text-muted-foreground ml-1">{data.id.slice(0, 8)}</span>
                </h2>
                {isBlocked(data) ? (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Blocked</span>
                ) : (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                    data.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                    data.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                    data.status === 'running' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>{data.status}</span>
                )}
              </div>
              <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-4 rounded-lg border border-border">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</span>
                  <span className="text-sm font-medium text-foreground capitalize">{data.type}</span>
                </div>
                <div className="w-px h-8 bg-border"></div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attempts</span>
                  <span className="text-sm font-medium text-foreground">{data.attempt_count} / {data.max_attempts}</span>
                </div>
                <div className="w-px h-8 bg-border hidden sm:block"></div>
                <div className="flex gap-2 ml-auto">
                  <button 
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    onClick={() => navigator.clipboard.writeText(data.id)}
                  >
                    <Copy size={14} />
                    Copy ID
                  </button>
                  {isAdmin && (data.status === "failed" || data.status === "dead_letter") && (
                    <button 
                      className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                      onClick={() => api.retryJob(id)}
                    >
                      <RefreshCw size={14} />
                      Retry
                    </button>
                  )}
                </div>
              </div>

              {data.depends_on_job_id && (
                <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 text-sm text-blue-800 dark:text-blue-300">
                  <Clock size={16} />
                  <span>Depends on</span>
                  <span className="font-mono font-bold">{data.depends_on_job_id.slice(0, 8)}</span>
                  <span>which is</span>
                  <span className="font-semibold">{data.depends_on_status}</span>
                </div>
              )}
              
              {data.last_error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4 text-sm text-red-800 dark:text-red-300">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle size={16} />
                    Last Error
                  </div>
                  <div className="font-mono break-words opacity-90 text-xs">{data.last_error}</div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Payload</h3>
                <pre className="rounded-md border border-border bg-muted/50 p-4 text-xs font-mono overflow-x-auto text-foreground">
                  {JSON.stringify(data.payload, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Executions</h3>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/10">
                        <th className="px-4 py-2 font-medium text-muted-foreground">#</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">Started</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {data.executions.map((e: any) => (
                        <tr key={e.id}>
                          <td className="px-4 py-3">{e.attempt}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              e.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              e.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>{e.status}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(e.started_at).toLocaleTimeString()}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{e.error || "—"}</td>
                        </tr>
                      ))}
                      {data.executions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Not executed yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Logs</h3>
                <div className="rounded-md border border-border bg-[#1e1e2e] p-4 text-xs font-mono overflow-x-auto min-h-[100px]">
                  {(data.logs || []).map((l: any, i: number) => (
                    <div key={i} className="flex gap-3 py-0.5">
                      <span className="text-gray-500 shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                      <span className={`shrink-0 w-12 ${
                        l.level === 'error' ? 'text-red-400' : 
                        l.level === 'warn' ? 'text-yellow-400' : 
                        l.level === 'info' ? 'text-blue-400' : 
                        'text-gray-400'
                      }`}>[{l.level}]</span>
                      <span className="text-gray-300 whitespace-pre-wrap">{l.message}</span>
                    </div>
                  ))}
                  {(!data.logs || data.logs.length === 0) && (
                    <div className="text-gray-500 italic">No logs generated.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
