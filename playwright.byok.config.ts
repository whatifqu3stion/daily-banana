import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/byok.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'VITE_E2E_MOCKS=false npm run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
});
