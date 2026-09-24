import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const appPort = Number(process.env.PLAYWRIGHT_PORT || '3000');
const realtimePort = Number(process.env.PLAYWRIGHT_REALTIME_PORT || '3001');
const appUrl = `http://localhost:${appPort}`;
const appCommand = process.env.PLAYWRIGHT_PRODUCTION ? 'npm run start' : 'npm run dev';
process.env.QA_ENEMIES ||= '100';
process.env.QA_PLAYERS ||= '2';
process.env.QA_SECONDS ||= '600';
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: appUrl },
  testMatch: 'stability.spec.ts',
  webServer: [
    {
      command:`${appCommand} -- --port ${appPort}`,
      url:appUrl,
      env: { ...process.env, BETTER_AUTH_URL: appUrl },
      reuseExistingServer:false,
      timeout:180000,
    },
    {
      command:'node --conditions=react-server --import tsx scripts/stability-realtime.ts',
      url:`http://localhost:${realtimePort}/health`,
      env: {
        ...process.env,
        REALTIME_PORT: String(realtimePort),
        REALTIME_ORIGIN: appUrl,
      },
      reuseExistingServer:false,
      timeout:120000,
    },
  ],
});
