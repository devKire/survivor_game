import { defineConfig } from "@playwright/test";
const appPort = Number(process.env.PLAYWRIGHT_PORT || "3000");
const realtimePort = Number(process.env.PLAYWRIGHT_REALTIME_PORT || "3001");
const appUrl = `http://localhost:${appPort}`;
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  expect: { timeout: 30000 },
  use: {
    baseURL: appUrl,
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: process.env.PLAYWRIGHT_PRODUCTION
        ? `npm run start -- --port ${appPort}`
        : `npm run dev -- --port ${appPort}`,
      url: appUrl,
      env: {
        ...process.env,
        BETTER_AUTH_URL: appUrl,
        NEXT_PUBLIC_REALTIME_URL: `ws://localhost:${realtimePort}`,
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: process.env.QA_ENEMIES ? "node --conditions=react-server --import tsx scripts/stability-realtime.ts" : "npm run realtime",
      url: `http://localhost:${realtimePort}/health`,
      env: {
        ...process.env,
        REALTIME_PORT: String(realtimePort),
        REALTIME_ORIGIN: appUrl,
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  timeout: 180000,
});
