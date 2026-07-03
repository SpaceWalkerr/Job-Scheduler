import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";

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
    <>
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <h2>Invite member</h2>
          </div>
          <form className="row end" onSubmit={invite}>
            <div>
              <label>email</label>
              <input
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: 240 }}
              />
            </div>
            <div>
              <label>role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button className="primary" type="submit">
              Invite
            </button>
          </form>
          {formError && <div className="err">{formError}</div>}
          <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
            The invited person must already have an account (they can register first, then you invite them).
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Project members</h2>
        </div>
        {error && <div className="err">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(data || []).map((m) => (
                <tr key={m.email}>
                  <td>{m.email}</td>
                  <td>
                    <span className={`badge ${m.role === "admin" ? "active" : "queued"}`}>{m.role}</span>
                  </td>
                  <td className="muted">{new Date(m.created_at).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td style={{ textAlign: "right" }}>
                      <button className="sm" onClick={() => remove(m.email)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3}>
                    <div className="empty">No members yet.</div>
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
