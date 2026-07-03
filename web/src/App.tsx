import { useEffect, useState } from "react";
import { api, clearToken, hasToken } from "./api";
import { connectWs, disconnectWs, onStatusChange } from "./ws";
import Login from "./views/Login";
import Overview from "./views/Overview";
import Queues from "./views/Queues";
import Jobs from "./views/Jobs";
import Workers from "./views/Workers";
import Members from "./views/Members";
import OrgMembers from "./views/OrgMembers";
import {
  IconOverview,
  IconQueues,
  IconJobs,
  IconWorkers,
  IconUsers,
  IconPlus,
  IconLogout,
  IconMenu,
  IconClose,
} from "./icons";

interface Organization {
  id: string;
  name: string;
  role: "owner" | "member";
  project_count: number;
}

interface Project {
  id: string;
  name: string;
  my_role: "admin" | "viewer";
}

const TABS = [
  { key: "Overview", icon: IconOverview, sub: "Jobs and queue health at a glance" },
  { key: "Queues", icon: IconQueues, sub: "Configure queues and concurrency" },
  { key: "Jobs", icon: IconJobs, sub: "Submit and inspect jobs" },
  { key: "Workers", icon: IconWorkers, sub: "Live worker status" },
  { key: "Access", icon: IconUsers, sub: "Manage organization and project access" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [email, setEmail] = useState(localStorage.getItem("email") || "");
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [newProject, setNewProject] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [live, setLive] = useState(false);

  function loadOrgs() {
    return api.organizations().then((os: Organization[]) => {
      setOrgs(os);
      setOrgId((cur) => (os.some((o) => o.id === cur) ? cur : os[0]?.id ?? ""));
    });
  }

  useEffect(() => {
    if (!authed) return;
    loadOrgs();
  }, [authed]);

  // Projects are scoped to the selected organization.
  useEffect(() => {
    if (!authed || !orgId) {
      setProjects([]);
      setProjectId("");
      return;
    }
    api.projects(orgId).then((ps: Project[]) => {
      setProjects(ps);
      setProjectId((cur) => (ps.some((p) => p.id === cur) ? cur : ps[0]?.id ?? ""));
    });
  }, [authed, orgId]);

  useEffect(() => {
    if (!authed) {
      disconnectWs();
      return;
    }
    const token = localStorage.getItem("token");
    if (token) connectWs(token);
    const unsubscribe = onStatusChange(setLive);
    return () => {
      unsubscribe();
      disconnectWs();
    };
  }, [authed]);

  if (!authed)
    return (
      <Login
        onAuthed={(e) => {
          setEmail(e);
          setAuthed(true);
        }}
      />
    );

  async function createOrg() {
    if (!newOrg.trim()) return;
    const o = await api.createOrg(newOrg.trim());
    setOrgs((os) => [...os, o]);
    setOrgId(o.id);
    setNewOrg("");
  }

  async function createProject() {
    if (!newProject.trim() || !orgId) return;
    const p = await api.createProject(newProject.trim(), orgId);
    setProjects((ps) => [p, ...ps]);
    setProjectId(p.id);
    setNewProject("");
    setOrgs((os) => os.map((o) => (o.id === orgId ? { ...o, project_count: o.project_count + 1 } : o)));
  }

  function logout() {
    clearToken();
    localStorage.removeItem("email");
    setAuthed(false);
    setOrgs([]);
    setOrgId("");
    setProjects([]);
    setProjectId("");
  }

  function selectTab(key: Tab) {
    setTab(key);
    setNavOpen(false);
  }

  const current = TABS.find((t) => t.key === tab)!;
  const myRole = projects.find((p) => p.id === projectId)?.my_role ?? "admin";
  const myOrgRole = orgs.find((o) => o.id === orgId)?.role ?? "member";

  return (
    <div className="shell">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="mark">
            <IconOverview size={14} />
          </span>
          <span className="name">Scheduler</span>
          <button className="nav-close ghost sm" onClick={() => setNavOpen(false)}>
            <IconClose size={16} />
          </button>
        </div>

        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${tab === key ? "active" : ""}`}
              onClick={() => selectTab(key)}
            >
              <Icon size={17} />
              {key}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{email.slice(0, 1).toUpperCase() || "U"}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                {email || "user"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "capitalize" }}>{myRole}</div>
            </div>
            <button className="ghost sm" onClick={logout} title="Log out">
              <IconLogout size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <button className="hamburger" onClick={() => setNavOpen(true)}>
              <IconMenu size={17} />
            </button>
            <div>
              <h1>{tab}</h1>
              <div className="sub">{current.sub}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`live-indicator ${live ? "live" : ""}`} title={live ? "Live updates connected" : "Reconnecting…"}>
              <span className="dot" />
              {live ? "Live" : "Reconnecting"}
            </span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} title="Organization">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.project_count})
                </option>
              ))}
              {orgs.length === 0 && <option>no organizations</option>}
            </select>
            <input
              placeholder="new org"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createOrg()}
              style={{ width: 96 }}
            />
            <button className="ghost" onClick={createOrg} title="Create organization">
              <IconPlus size={15} />
            </button>
            <span className="topbar-divider" />
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} title="Project">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {projects.length === 0 && <option>no projects</option>}
            </select>
            <input
              placeholder="new project"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              style={{ width: 120 }}
            />
            <button className="primary" onClick={createProject}>
              <IconPlus size={15} />
              <span className="btn-label">Add</span>
            </button>
          </div>
        </header>

        <div className="page">
          {!projectId ? (
            <div className="panel">
              <div className="empty">Create a project above to get started.</div>
            </div>
          ) : tab === "Overview" ? (
            <Overview />
          ) : tab === "Queues" ? (
            <Queues projectId={projectId} myRole={myRole} />
          ) : tab === "Jobs" ? (
            <Jobs projectId={projectId} myRole={myRole} />
          ) : tab === "Workers" ? (
            <Workers />
          ) : (
            <>
              {orgId && <OrgMembers orgId={orgId} myOrgRole={myOrgRole} />}
              <Members projectId={projectId} myRole={myRole} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
