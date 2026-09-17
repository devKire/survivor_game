import { defineConfig } from '@playwright/test';
import base from './playwright.config';
process.env.QA_ENEMIES ||= '100';
process.env.QA_PLAYERS ||= '2';
process.env.QA_SECONDS ||= '600';
export default defineConfig({
  ...base,
  testMatch: 'stability.spec.ts',
  webServer: [
    {command:'npm run dev -- --port 3000',url:'http://localhost:3000',reuseExistingServer:false,timeout:180000},
    {command:'node --conditions=react-server --import tsx scripts/stability-realtime.ts',url:'http://localhost:3001/health',reuseExistingServer:false,timeout:120000},
  ],
});
