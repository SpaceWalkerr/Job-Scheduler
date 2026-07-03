import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export type Category = "jobs" | "queues" | "workers" | "projects";

const clients = new Set<WebSocket>();

export function broadcast(category: Category) {
  const payload = JSON.stringify({ type: category });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// Push channel for dashboard updates. Deliberately coarse: a message just names
// which resource category changed ("jobs", "queues", ...) and the client re-fetches
// via the normal authorized REST endpoints — no data is serialized over the socket,
// so there's no need to duplicate per-row RBAC checks here. Polling stays on as a
// fallback in the frontend, so a dropped/blocked socket degrades gracefully rather
// than freezing the UI.
export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    try {
      if (!token) throw new Error("missing token");
      jwt.verify(token, SECRET);
    } catch {
      ws.close(4001, "unauthorized");
      return;
    }

    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  console.log("websocket server attached at /ws");
  return wss;
}
