import { defineConfig, devices } from '@playwright/test';

// Deliberately independent of the normal configs (which record failed traces).
export default defineConfig({
  testDir: './tests/live',
  testMatch: 'google-image.spec.ts',
  timeout: 480_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  repeatEach: 1,
  forbidOnly: true,
  reporter: 'line',
  outputDir: 'test-results/google-live',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4176',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 4176 --local-test-http',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 120_000,
    // The Vite/app child has no need for the live credential or enablement.
    env: { VITE_E2E_MOCKS: 'false', GOOGLE_IMAGE_SMOKE_API_KEY: '', GOOGLE_IMAGE_SMOKE: '' },
  },
});
