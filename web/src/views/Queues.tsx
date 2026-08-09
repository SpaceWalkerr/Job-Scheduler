import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";
import { Plus, Edit2, Play, Pause, Save, X } from "lucide-react";

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
  
  const [isCreating, setIsCreating] = useState(false);
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
    setIsCreating(false);
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
    <div className="space-y-6">
      {/* Header Actions */}
      {isAdmin && !isCreating && !editing && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Create Queue
          </button>
        </div>
      )}

      {/* Create / Edit Form */}
      {isAdmin && (isCreating || editing) && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {editing ? `Edit Queue: ${editing.name}` : "New Queue Configuration"}
            </h2>
            <button 
              onClick={() => { setIsCreating(false); setEditing(null); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          
          <form className="p-6" onSubmit={editing ? saveEdit : create}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-2 lg:col-span-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</label>
                <input
                  placeholder="e.g. email_queue"
                  value={editing ? editing.name : name}
                  onChange={(e) => editing ? setEditing({ ...editing, name: e.target.value }) : setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
                <input
                  type="number"
                  value={editing ? editing.priority : priority}
                  onChange={(e) => editing ? setEditing({ ...editing, priority: Number(e.target.value) }) : setPriority(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  value={editing ? editing.concurrency_limit : concurrency}
                  onChange={(e) => editing ? setEditing({ ...editing, concurrency_limit: Number(e.target.value) }) : setConcurrency(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Strategy</label>
                <select
                  value={editing ? editing.retry_strategy : strategy}
                  onChange={(e) => editing ? setEditing({ ...editing, retry_strategy: e.target.value }) : setStrategy(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                >
                  <option value="fixed">Fixed</option>
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attempts</label>
                <input
                  type="number"
                  min={1}
                  value={editing ? editing.max_attempts : maxAttempts}
                  onChange={(e) => editing ? setEditing({ ...editing, max_attempts: Number(e.target.value) }) : setMaxAttempts(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
            </div>
            
            {editing && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4 items-end">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Base Delay (ms)</label>
                  <input
                    type="number"
                    min={0}
                    value={editing.retry_base_delay_ms}
                    onChange={(e) => setEditing({ ...editing, retry_base_delay_ms: Number(e.target.value) })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button type="submit" className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">
                <Save size={16} />
                {editing ? "Save Changes" : "Create Queue"}
              </button>
              <button
                type="button"
                onClick={() => { setIsCreating(false); setEditing(null); }}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Queues List */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Configured Queues</h2>
        </div>
        
        {error && <div className="p-4 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium border-b border-red-200 dark:border-red-800">{error}</div>}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Concurrency</th>
                <th className="px-6 py-4">Retry Logic</th>
                <th className="px-6 py-4">State</th>
                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data || []).map((q) => (
                <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{q.name}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{q.priority}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{q.concurrency_limit}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground capitalize">{q.retry_strategy}</span>
                      <span className="text-xs text-muted-foreground">{q.max_attempts} attempts • {q.retry_base_delay_ms}ms delay</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      q.is_paused 
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" 
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${q.is_paused ? "bg-amber-500" : "bg-emerald-500"}`}></span>
                      {q.is_paused ? "Paused" : "Active"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setEditing(q)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => toggle(q)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors ${
                            q.is_paused 
                              ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" 
                              : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          }`}
                          title={q.is_paused ? "Resume Queue" : "Pause Queue"}
                        >
                          {q.is_paused ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    {isAdmin ? "No queues configured yet. Create one above." : "No queues available."}
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
