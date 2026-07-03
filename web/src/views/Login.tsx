import { useState } from "react";
import { api, setToken } from "../api";
import { IconOverview } from "../icons";

type Status = "idle" | "loading" | "created" | "authing";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Login({ onAuthed }: { onAuthed: (email: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const busy = status !== "idle";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setStatus("loading");
    try {
      const res =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password);
      setToken(res.token);
      localStorage.setItem("email", res.user.email);

      if (mode === "register") {
        setStatus("created");
        await wait(700);
      }
      setStatus("authing");
      await wait(500);
      onAuthed(res.user.email);
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  function button() {
    switch (status) {
      case "loading":
        return (
          <>
            <span className="spinner" />
            {mode === "login" ? "Logging you in…" : "Creating account…"}
          </>
        );
      case "created":
        return <>✓ Account created</>;
      case "authing":
        return (
          <>
            <span className="spinner" />
            Logging you in…
          </>
        );
      default:
        return mode === "login" ? "Log in" : "Create account";
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="mark">
            <IconOverview size={14} />
          </span>
          <h1>Scheduler</h1>
        </div>
        <p className="tagline">Distributed background jobs, queues, and workers.</p>

        <form onSubmit={submit}>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          {error && <div className="err">{error}</div>}
          <button
            className={`primary${status === "created" ? " done" : ""}`}
            style={{ width: "100%", justifyContent: "center" }}
            type="submit"
            disabled={busy}
          >
            {button()}
          </button>
        </form>

        <div className="switch">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <a
            onClick={() => {
              if (busy) return;
              setError("");
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? "Register" : "Log in"}
          </a>
        </div>

        <div className="demo-hint">
          Demo account: <b>demo@northwind.dev</b> / <b>demo1234</b>
        </div>
      </div>
    </div>
  );
}
