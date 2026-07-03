import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import authRoutes from "./routes/auth.js";
import organizationRoutes from "./routes/organizations.js";
import projectRoutes from "./routes/projects.js";
import queueRoutes from "./routes/queues.js";
import jobRoutes from "./routes/jobs.js";
import workerRoutes from "./routes/workers.js";
import statsRoutes from "./routes/stats.js";
import { logger, requestLogger } from "./logger.js";

// Builds the Express app (routes + middleware) without listening or starting the
// worker/scheduler, so tests can drive it via supertest in-process. index.ts owns the
// bootstrap (listen + background services).
export function createApp() {
  const isTest = process.env.NODE_ENV === "test";
  const app = express();
  app.use(cors());
  app.use(express.json());
  if (!isTest) app.use(requestLogger);

  // General API throttle: generous enough for dashboard polling (~1 req/sec per view)
  // across a few open tabs, but stops runaway/abusive clients.
  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many requests, slow down" },
  });

  // Auth is limited separately and much tighter to blunt credential-stuffing/brute force.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many auth attempts, try again later" },
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  // Rate limiting is disabled under NODE_ENV=test so it can't flake the suite.
  app.use("/auth", ...(isTest ? [] : [authLimiter]), authRoutes);
  if (!isTest) app.use(apiLimiter);
  app.use("/organizations", organizationRoutes);
  app.use("/projects", projectRoutes);
  app.use("/queues", queueRoutes);
  app.use("/jobs", jobRoutes);
  app.use("/workers", workerRoutes);
  app.use("/dashboard/stats", statsRoutes);

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error("unhandled error", { path: req.originalUrl, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
