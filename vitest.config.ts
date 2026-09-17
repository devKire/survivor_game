import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: process.env.RUN_DATABASE_TESTS ? 120000 : 20000,
    hookTimeout: 30000,
  },
});
