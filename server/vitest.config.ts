import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Run one file at a time (each isolated with its own pool) so the whole suite
    // stays well under the shared Supabase session pooler's client budget.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
