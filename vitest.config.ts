import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // Database suites install fault-injection triggers on shared tables. Keep
    // suites isolated; concurrency within each test still uses real transactions.
    fileParallelism: process.env.RUN_DATABASE_TESTS !== "1",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: process.env.RUN_DATABASE_TESTS ? 120000 : 20000,
    hookTimeout: 30000,
  },
});
