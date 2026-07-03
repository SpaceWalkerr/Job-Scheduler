import "dotenv/config";
import { createApp } from "./app.js";
import { startWorker } from "./worker.js";
import { startScheduler } from "./scheduler.js";
import { attachWebSocketServer } from "./ws.js";
import { logger } from "./logger.js";

const app = createApp();
const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => logger.info("api listening", { port }));
attachWebSocketServer(server);

// The API process runs an embedded worker + scheduler by default (single-process dev).
// Set RUN_EMBEDDED_WORKER=false to run the API alone and scale workers out as separate
// processes (see worker-main.ts) — they coordinate via the scheduler advisory lock.
const embedWorker = process.env.RUN_EMBEDDED_WORKER !== "false";
let worker: Awaited<ReturnType<typeof startWorker>> | null = null;
let stopScheduler: () => Promise<void> = async () => {};
if (embedWorker) {
  worker = await startWorker();
  stopScheduler = startScheduler();
} else {
  logger.info("embedded worker disabled (RUN_EMBEDDED_WORKER=false)");
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("shutting down...");
  await stopScheduler();
  await worker?.shutdown();
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
