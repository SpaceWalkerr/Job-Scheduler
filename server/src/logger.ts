import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

type Level = "info" | "warn" | "error";

// One structured JSON line per event on stdout/stderr — greppable and ready to ship
// to any log aggregator, without pulling in a logging dependency.
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};

// Logs one line per HTTP request once the response is sent, with a per-request id
// echoed back in the `x-request-id` header so a client error can be traced to its log.
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  const requestId = randomUUID().slice(0, 8);
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level: Level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    emit(level, "request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    });
  });
  next();
};
