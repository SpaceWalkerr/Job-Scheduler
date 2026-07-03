import { usePolling } from "../hooks";
import { api } from "../api";
import ThroughputChart from "./ThroughputChart";

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

const STATUSES = ["queued", "scheduled", "running", "completed", "failed", "dead_letter"];

interface ThroughputPoint {
  day: string;
  completed: number;
  failed: number;
}

export default function Overview() {
  const { data } = usePolling<Stats>(api.stats, 8000, [], ["jobs", "queues"]);
  const { data: throughput } = usePolling<ThroughputPoint[]>(api.throughput, 30000, [], "jobs");
  if (!data) return <div className="muted">Loading…</div>;

  return (
    <>
      <div className="cards" style={{ marginBottom: 20 }}>
        {STATUSES.map((s) => (
          <div className={`stat ${s}`} key={s}>
            <div className="n">{data.status[s] || 0}</div>
            <div className="l">{s.replace("_", " ")}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Throughput — last 7 days</h2>
        </div>
        <ThroughputChart data={throughput || []} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Queue health</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Queue</th>
                <th>State</th>
                <th>Queued</th>
                <th>Running</th>
                <th>Completed</th>
                <th>Failed</th>
                <th>Dead-letter</th>
              </tr>
            </thead>
            <tbody>
              {data.queues.map((q) => (
                <tr key={q.queue_id}>
                  <td>{q.name}</td>
                  <td>
                    <span className={`badge ${q.is_paused ? "failed" : "active"}`}>
                      {q.is_paused ? "paused" : "active"}
                    </span>
                  </td>
                  <td>{q.queued}</td>
                  <td>{q.running}</td>
                  <td>{q.completed}</td>
                  <td>{q.failed}</td>
                  <td>{q.dead_letter}</td>
                </tr>
              ))}
              {data.queues.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">No queues yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
