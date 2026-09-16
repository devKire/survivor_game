import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: process.env.PLAYWRIGHT_PRODUCTION
        ? "npm run start -- --port 3000"
        : "npm run dev -- --port 3000",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "npm run realtime",
      url: "http://localhost:3001/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  timeout: 180000,
});
