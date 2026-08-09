import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";
import { UserPlus, Trash2, Mail, Shield, User, Building } from "lucide-react";

interface OrgMember {
  email: string;
  role: string;
  created_at: string;
}

export default function OrgMembers({ orgId, myOrgRole }: { orgId: string; myOrgRole: string }) {
  const [tick, setTick] = useState(0);
  const { data, error } = usePolling<OrgMember[]>(() => api.orgMembers(orgId), 10000, [orgId, tick], "projects");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [formError, setFormError] = useState("");
  const isOwner = myOrgRole === "owner";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    try {
      await api.inviteOrgMember(orgId, email, role);
      setEmail("");
      setTick((t) => t + 1);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function remove(memberEmail: string) {
    try {
      await api.removeOrgMember(orgId, memberEmail);
      setTick((t) => t + 1);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Add Organization Member</h2>
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
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <button 
                type="submit"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <UserPlus size={16} />
                Add Member
              </button>
            </form>
            
            {formError && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium rounded-md border border-red-200 dark:border-red-800">
                {formError}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Organization Members</h2>
        </div>
        
        {error && <div className="p-4 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium border-b border-red-200 dark:border-red-800">{error}</div>}
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Added On</th>
                {isOwner && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data || []).map((m) => (
                <tr key={m.email} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <Building size={16} />
                      </div>
                      {m.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      m.role === "owner" 
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" 
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {m.role === "owner" ? <Shield size={12} /> : <User size={12} />}
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric'
                    })}
                  </td>
                  {isOwner && (
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
                  <td colSpan={isOwner ? 4 : 3} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                    No organization members found.
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
