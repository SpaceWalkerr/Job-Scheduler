const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";

export type Category = "jobs" | "queues" | "workers" | "projects";
type Listener = (category: Category) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectDelay = 1000;
let connected = false;
const statusListeners = new Set<(connected: boolean) => void>();

function setConnected(value: boolean) {
  connected = value;
  for (const l of statusListeners) l(value);
}

export function isConnected() {
  return connected;
}

export function onStatusChange(fn: (connected: boolean) => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function connectWs(token: string) {
  if (socket) socket.close();
  socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

  socket.onopen = () => {
    reconnectDelay = 1000;
    setConnected(true);
  };
  socket.onclose = () => {
    setConnected(false);
    setTimeout(() => connectWs(token), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
  };
  socket.onerror = () => socket?.close();
  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type) for (const l of listeners) l(msg.type);
    } catch {
      // ignore malformed messages
    }
  };
}

export function disconnectWs() {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  setConnected(false);
}
