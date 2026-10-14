import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/news.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'VITE_E2E_MOCKS=false npm run dev -- --port 4175 --local-test-http',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
