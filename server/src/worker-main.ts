import "dotenv/config";
import { startWorker } from "./worker.js";
import { startScheduler } from "./scheduler.js";
import { logger } from "./logger.js";

// Standalone worker process: runs a worker + scheduler with no HTTP server, so the job
// tier can be scaled horizontally (run several of these). Whichever process wins the
// scheduler advisory lock ticks; the rest just claim jobs. Run the API with
// RUN_EMBEDDED_WORKER=false alongside one or more of these.
const worker = await startWorker();
const stopScheduler = startScheduler();
logger.info("standalone worker started", { pid: process.pid });

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("standalone worker shutting down");
  await stopScheduler();
  await worker.shutdown();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
