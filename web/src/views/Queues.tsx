import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";

interface Queue {
  id: string;
  name: string;
  priority: number;
  concurrency_limit: number;
  retry_strategy: string;
  retry_base_delay_ms: number;
  max_attempts: number;
  is_paused: boolean;
}

export default function Queues({ projectId, myRole }: { projectId: string; myRole: string }) {
  const isAdmin = myRole === "admin";
  const [tick, setTick] = useState(0);
  const { data, error } = usePolling<Queue[]>(() => api.queues(projectId), 8000, [projectId, tick], "queues");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [concurrency, setConcurrency] = useState(5);
  const [strategy, setStrategy] = useState("exponential");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [editing, setEditing] = useState<Queue | null>(null);

  const refresh = () => setTick((t) => t + 1);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.createQueue({
      project_id: projectId,
      name,
      priority,
      concurrency_limit: concurrency,
      retry_strategy: strategy,
      max_attempts: maxAttempts,
    });
    setName("");
    setPriority(0);
    refresh();
  }

  async function toggle(q: Queue) {
    await api.updateQueue(q.id, { is_paused: !q.is_paused });
    refresh();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await api.updateQueue(editing.id, {
      name: editing.name,
      priority: editing.priority,
      concurrency_limit: editing.concurrency_limit,
      retry_strategy: editing.retry_strategy,
      retry_base_delay_ms: editing.retry_base_delay_ms,
      max_attempts: editing.max_attempts,
    });
    setEditing(null);
    refresh();
  }

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <h2>New queue</h2>
          </div>
          <form className="row end" onSubmit={create}>
            <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} required />
            <div>
              <label>priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
            <div>
              <label>concurrency</label>
              <input
                type="number"
                min={1}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
            <div>
              <label>retry strategy</label>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                <option value="fixed">fixed</option>
                <option value="linear">linear</option>
                <option value="exponential">exponential</option>
              </select>
            </div>
            <div>
              <label>max attempts</label>
              <input
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
            <button className="primary" type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      {isAdmin && editing && (
        <div className="panel">
          <div className="panel-head">
            <h2>Edit “{editing.name}”</h2>
          </div>
          <form className="row end" onSubmit={saveEdit}>
            <div>
              <label>name</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </div>
            <div>
              <label>priority</label>
              <input
                type="number"
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <div>
              <label>concurrency</label>
              <input
                type="number"
                min={1}
                value={editing.concurrency_limit}
                onChange={(e) => setEditing({ ...editing, concurrency_limit: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <div>
              <label>retry strategy</label>
              <select
                value={editing.retry_strategy}
                onChange={(e) => setEditing({ ...editing, retry_strategy: e.target.value })}
              >
                <option value="fixed">fixed</option>
                <option value="linear">linear</option>
                <option value="exponential">exponential</option>
              </select>
            </div>
            <div>
              <label>base delay ms</label>
              <input
                type="number"
                min={0}
                value={editing.retry_base_delay_ms}
                onChange={(e) => setEditing({ ...editing, retry_base_delay_ms: Number(e.target.value) })}
                style={{ width: 100 }}
              />
            </div>
            <div>
              <label>max attempts</label>
              <input
                type="number"
                min={1}
                value={editing.max_attempts}
                onChange={(e) => setEditing({ ...editing, max_attempts: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <button className="primary" type="submit">
              Save
            </button>
            <button className="ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Queues</h2>
        </div>
        {error && <div className="err">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Priority</th>
                <th>Concurrency</th>
                <th>Retry</th>
                <th>Max attempts</th>
                <th>State</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(data || []).map((q) => (
                <tr key={q.id}>
                  <td>{q.name}</td>
                  <td>{q.priority}</td>
                  <td>{q.concurrency_limit}</td>
                  <td className="muted">
                    {q.retry_strategy} · {q.retry_base_delay_ms}ms
                  </td>
                  <td>{q.max_attempts}</td>
                  <td>
                    <span className={`badge ${q.is_paused ? "queued" : "active"}`}>
                      {q.is_paused ? "paused" : "active"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="sm" onClick={() => setEditing(q)}>
                        Edit
                      </button>{" "}
                      <button className="sm" onClick={() => toggle(q)}>
                        {q.is_paused ? "Resume" : "Pause"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6}>
                    <div className="empty">
                      {isAdmin ? "No queues yet. Create one above." : "No queues yet."}
                    </div>
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
