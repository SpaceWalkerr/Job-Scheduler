import { usePolling } from "../hooks";
import { api } from "../api";

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
  // Heartbeats update continuously but aren't broadcast individually over the
  // websocket (too chatty) — only discrete events (registered/stopped/stale) are.
  // Keep a shorter fallback interval here so "time since heartbeat" stays fresh.
  const { data } = usePolling<Worker[]>(api.workers, 5000, [], "workers");

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Registered workers</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Host</th>
              <th>PID</th>
              <th>Status</th>
              <th>Last heartbeat</th>
              <th>Pings (15m)</th>
              <th>Active jobs</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((w) => {
              const stale = w.seconds_since_heartbeat > 30;
              const healthy = w.status === "active" && !stale;
              // "stale" only applies to a worker whose last known status was still
              // active/draining but its heartbeat expired (crash, not a clean shutdown).
              const label = w.status === "stopped" ? "stopped" : stale ? "stale" : w.status;
              return (
                <tr key={w.id}>
                  <td className="mono">{w.id.slice(0, 8)}</td>
                  <td>{w.hostname}</td>
                  <td>{w.pid}</td>
                  <td>
                    <span className={`badge ${healthy ? "active" : "stopped"}`}>{label}</span>
                  </td>
                  <td className="muted">{formatAgo(w.seconds_since_heartbeat)}</td>
                  <td className="muted">{w.heartbeats_15m}</td>
                  <td>{w.active_jobs}</td>
                </tr>
              );
            })}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No workers registered.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
