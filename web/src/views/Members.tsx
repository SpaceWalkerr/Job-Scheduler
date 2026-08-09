import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";
import { UserPlus, Trash2, Mail, Shield, User, Info } from "lucide-react";

interface Member {
  email: string;
  role: string;
  created_at: string;
}

export default function Members({ projectId, myRole }: { projectId: string; myRole: string }) {
  const [tick, setTick] = useState(0);
  const { data, error } = usePolling<Member[]>(() => api.members(projectId), 10000, [projectId, tick], "projects");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [formError, setFormError] = useState("");
  const isAdmin = myRole === "admin";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    try {
      await api.inviteMember(projectId, email, role);
      setEmail("");
      setTick((t) => t + 1);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function remove(memberEmail: string) {
    await api.removeMember(projectId, memberEmail);
    setTick((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Invite Member</h2>
          </div>
          <div className="p-6">
            <form onSubmit={invite} className="flex flex-col sm:flex-row items-end gap-4">
              <div className="space-y-2 flex-1 w-full sm:w-auto">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail size={14} />
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
              <div className="space-y-2 w-full sm:w-48">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield size={14} />
                  Role
                </label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button 
                type="submit"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <UserPlus size={16} />
                Invite
              </button>
            </form>
            
            {formError && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium rounded-md border border-red-200 dark:border-red-800">
                {formError}
              </div>
            )}
            
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md border border-border/50">
              <Info size={16} className="text-blue-500 shrink-0" />
              <p>The invited person must already have an account. They can register first, then you can invite them here.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Project Members</h2>
        </div>
        
        {error && <div className="p-4 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium border-b border-red-200 dark:border-red-800">{error}</div>}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Added On</th>
                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data || []).map((m) => (
                <tr key={m.email} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <User size={16} />
                      </div>
                      {m.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      m.role === "admin" 
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" 
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {m.role === "admin" ? <Shield size={12} /> : <User size={12} />}
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric'
                    })}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => remove(m.email)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    No members found.
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
