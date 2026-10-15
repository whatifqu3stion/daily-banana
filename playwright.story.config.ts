import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testIgnore: [], testMatch: ['**/story.spec.ts', '**/numeric-facts.spec.ts'], retries: 0,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176' },
  webServer: { command: 'VITE_E2E_MOCKS=false npm run dev -- --port 4176 --local-test-http',
    url: 'http://127.0.0.1:4176', reuseExistingServer: false },
});
