import "dotenv/config";
import { afterAll } from "vitest";
import { pool } from "../src/db.js";

// Each isolated test file gets its own pool; close it so the process can exit cleanly.
afterAll(async () => {
  await pool.end().catch(() => {});
});
