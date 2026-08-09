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
import { Cpu } from "lucide-react";

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
    <div className="flex h-screen bg-background w-full">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform flex flex-col bg-card border-r border-border transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cpu className="h-5 w-5" />
            </div>
            <span className="font-bold tracking-tight text-foreground text-lg">Scheduler</span>
          </div>
          <button
            className="lg:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setNavOpen(false)}
          >
            <IconClose size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-3">
            Workspace
          </div>
          {TABS.map(({ key, icon: Icon }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => selectTab(key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <span className={`${isActive ? "text-primary" : "text-muted-foreground"} transition-colors`}>
                  <Icon size={18} />
                </span>
                {key}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 bg-card/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary border border-border text-sm font-bold text-foreground">
              {email.slice(0, 1).toUpperCase() || "U"}
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold text-foreground">
                {email || "user"}
              </span>
              <span className="text-xs font-medium text-muted-foreground capitalize">
                {myRole}
              </span>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Log out"
            >
              <IconLogout size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/50 px-6 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden -ml-2 p-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setNavOpen(true)}
            >
              <IconMenu size={20} />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground tracking-tight m-0">{tab}</h1>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">{current.sub}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                live ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`relative flex h-2 w-2`}>
                {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? "bg-emerald-500" : "bg-muted-foreground"}`}></span>
              </span>
              {live ? "Live" : "Reconnecting"}
            </div>

            <div className="h-6 w-px bg-border hidden md:block mx-1"></div>

            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.project_count})
                </option>
              ))}
              {orgs.length === 0 && <option>No Orgs</option>}
            </select>
            <div className="flex items-center gap-1">
              <input
                placeholder="New Org"
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createOrg()}
                className="h-9 w-24 rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm hidden md:block"
              />
              <button
                onClick={createOrg}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors hidden md:flex"
                title="Create organization"
              >
                <IconPlus size={16} />
              </button>
            </div>

            <div className="h-6 w-px bg-border hidden md:block mx-1"></div>

            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {projects.length === 0 && <option>No Projects</option>}
            </select>
            
            <div className="flex items-center gap-2">
              <input
                placeholder="New Project"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                className="h-9 w-28 rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm hidden lg:block"
              />
              <button
                onClick={createProject}
                className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                <IconPlus size={16} />
                <span className="hidden xl:inline">Add</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-6xl w-full">
            {!projectId ? (
              <div className="flex h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-center shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <IconJobs size={24} />
                </div>
                <h3 className="mb-1 text-lg font-bold text-foreground">No Project Selected</h3>
                <p className="text-sm font-medium text-muted-foreground max-w-[250px]">
                  Create a new project using the input field in the top navigation bar to get started.
                </p>
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
              <div className="space-y-6">
                {orgId && <OrgMembers orgId={orgId} myOrgRole={myOrgRole} />}
                <Members projectId={projectId} myRole={myRole} />
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Mobile overlay */}
      {navOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setNavOpen(false)}
        />
      )}
    </div>
  );
}
