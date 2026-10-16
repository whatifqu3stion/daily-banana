import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  outputDir: 'test-results/pages',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4180/daily-banana/',
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: 'npx vite preview --mode pages --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180/daily-banana/',
    reuseExistingServer: false,
  },
});
