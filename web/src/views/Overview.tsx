import { usePolling } from "../hooks";
import { api } from "../api";
import ThroughputChart from "./ThroughputChart";
import { Activity, CheckCircle2, Clock, PlayCircle, XCircle, AlertOctagon } from "lucide-react";

interface Stats {
  status: Record<string, number>;
  queues: {
    queue_id: string;
    name: string;
    is_paused: boolean;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    dead_letter: number;
  }[];
}

const STATUS_CONFIG = [
  { key: "queued", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  { key: "scheduled", icon: Activity, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  { key: "running", icon: PlayCircle, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
  { key: "completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  { key: "failed", icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
  { key: "dead_letter", icon: AlertOctagon, color: "text-red-700", bg: "bg-red-200 dark:bg-red-900/50" },
];

interface ThroughputPoint {
  day: string;
  completed: number;
  failed: number;
}

export default function Overview() {
  const { data } = usePolling<Stats>(api.stats, 8000, [], ["jobs", "queues"]);
  const { data: throughput } = usePolling<ThroughputPoint[]>(api.throughput, 30000, [], "jobs");
  
  if (!data) return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
        <p className="text-sm font-medium text-muted-foreground">Loading overview...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {STATUS_CONFIG.map(({ key, icon: Icon, color, bg }) => (
          <div key={key} className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {key.replace("_", " ")}
              </span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-md ${bg} ${color}`}>
                <Icon size={16} />
              </div>
            </div>
            <div className="text-3xl font-black tabular-nums tracking-tight text-foreground">
              {data.status[key] || 0}
            </div>
          </div>
        ))}
      </div>

      {/* Throughput Chart Panel */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Throughput (Last 7 Days)</h2>
        </div>
        <div className="p-6">
          <ThroughputChart data={throughput || []} />
        </div>
      </div>

      {/* Queue Health Panel */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Queue Health</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">Queue Name</th>
                <th className="px-6 py-4">State</th>
                <th className="px-6 py-4">Queued</th>
                <th className="px-6 py-4">Running</th>
                <th className="px-6 py-4">Completed</th>
                <th className="px-6 py-4">Failed</th>
                <th className="px-6 py-4">Dead-letter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.queues.map((q) => (
                <tr key={q.queue_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{q.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      q.is_paused 
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${q.is_paused ? "bg-red-500" : "bg-emerald-500"}`}></span>
                      {q.is_paused ? "Paused" : "Active"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{q.queued}</td>
                  <td className="px-6 py-4 font-mono text-amber-600 font-medium">{q.running}</td>
                  <td className="px-6 py-4 font-mono text-emerald-600 font-medium">{q.completed}</td>
                  <td className="px-6 py-4 font-mono text-red-600 font-medium">{q.failed}</td>
                  <td className="px-6 py-4 font-mono text-red-700 font-medium">{q.dead_letter}</td>
                </tr>
              ))}
              {data.queues.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    No queues configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
