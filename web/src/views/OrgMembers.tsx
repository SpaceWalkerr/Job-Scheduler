import { useState } from "react";
import { usePolling } from "../hooks";
import { api } from "../api";

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
    <>
      {isOwner && (
        <div className="panel">
          <div className="panel-head">
            <h2>Add organization member</h2>
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
                <option value="member">member</option>
                <option value="owner">owner</option>
              </select>
            </div>
            <button className="primary" type="submit">
              Add
            </button>
          </form>
          {formError && <div className="err">{formError}</div>}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Organization members</h2>
        </div>
        {error && <div className="err">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(data || []).map((m) => (
                <tr key={m.email}>
                  <td>{m.email}</td>
                  <td>
                    <span className={`badge ${m.role === "owner" ? "active" : "queued"}`}>{m.role}</span>
                  </td>
                  <td className="muted">{new Date(m.created_at).toLocaleDateString()}</td>
                  {isOwner && (
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
                  <td colSpan={isOwner ? 4 : 3}>
                    <div className="empty">No organization members yet.</div>
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
