const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

let token = localStorage.getItem("token") || "";

export function setToken(t: string) {
  token = t;
  localStorage.setItem("token", t);
}
export function clearToken() {
  token = "";
  localStorage.removeItem("token");
}
export function hasToken() {
  return Boolean(token);
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  register: (email: string, password: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  organizations: () => req("/organizations"),
  createOrg: (name: string) => req("/organizations", { method: "POST", body: JSON.stringify({ name }) }),
  orgMembers: (orgId: string) => req(`/organizations/${orgId}/members`),
  inviteOrgMember: (orgId: string, email: string, role: string) =>
    req(`/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  removeOrgMember: (orgId: string, email: string) =>
    req(`/organizations/${orgId}/members/${encodeURIComponent(email)}`, { method: "DELETE" }),

  projects: (organizationId?: string) =>
    req(`/projects${organizationId ? `?organization_id=${organizationId}` : ""}`),
  createProject: (name: string, organizationId?: string) =>
    req("/projects", { method: "POST", body: JSON.stringify({ name, organization_id: organizationId }) }),
  members: (projectId: string) => req(`/projects/${projectId}/members`),
  inviteMember: (projectId: string, email: string, role: string) =>
    req(`/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  removeMember: (projectId: string, email: string) =>
    req(`/projects/${projectId}/members/${encodeURIComponent(email)}`, { method: "DELETE" }),

  queues: (projectId?: string) => req(`/queues${projectId ? `?project_id=${projectId}` : ""}`),
  createQueue: (body: Record<string, unknown>) =>
    req("/queues", { method: "POST", body: JSON.stringify(body) }),
  updateQueue: (id: string, body: Record<string, unknown>) =>
    req(`/queues/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  jobs: (params: Record<string, string>) => req(`/jobs?${new URLSearchParams(params)}`),
  createJob: (body: Record<string, unknown>) =>
    req("/jobs", { method: "POST", body: JSON.stringify(body) }),
  job: (id: string) => req(`/jobs/${id}`),
  retryJob: (id: string) => req(`/jobs/${id}/retry`, { method: "POST" }),

  workers: () => req("/workers"),
  workerHeartbeats: (id: string) => req(`/workers/${id}/heartbeats`),
  stats: () => req("/dashboard/stats"),
  throughput: () => req("/dashboard/stats/throughput"),
};
