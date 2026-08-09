import { usePolling } from "../hooks";
import { api } from "../api";
import { Server, Activity, PowerOff, AlertTriangle } from "lucide-react";

interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: string;
  seconds_since_heartbeat: number;
  active_jobs: number;
  heartbeats_15m: number;
}

function formatAgo(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export default function Workers() {
  const { data } = usePolling<Worker[]>(api.workers, 5000, [], "workers");

  const getStatusIcon = (label: string) => {
    switch(label) {
      case "active": return <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />;
      case "stopped": return <PowerOff size={14} className="text-gray-500 dark:text-gray-400" />;
      case "stale": return <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />;
      default: return <Server size={14} className="text-blue-500" />;
    }
  };

  const getStatusBadgeClass = (label: string) => {
    switch(label) {
      case "active": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "stopped": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      case "stale": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Registered Workers</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Host</th>
                <th className="px-6 py-4">PID</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Last Heartbeat</th>
                <th className="px-6 py-4 text-center">Pings (15m)</th>
                <th className="px-6 py-4 text-center">Active Jobs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data || []).map((w) => {
                const stale = w.seconds_since_heartbeat > 30;
                const healthy = w.status === "active" && !stale;
                const label = w.status === "stopped" ? "stopped" : stale ? "stale" : w.status;
                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-foreground">{w.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{w.hostname}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">{w.pid}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${getStatusBadgeClass(label)}`}>
                        {getStatusIcon(label)}
                        {label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{formatAgo(w.seconds_since_heartbeat)}</td>
                    <td className="px-6 py-4 text-center font-mono text-muted-foreground">{w.heartbeats_15m}</td>
                    <td className="px-6 py-4 text-center font-mono font-medium text-amber-600">{w.active_jobs}</td>
                  </tr>
                );
              })}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    No workers registered.
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
