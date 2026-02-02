import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: './e2e/tests',
  // Folder for test artifacts such as screenshots, videos, traces, etc.
  outputDir: 'e2e/test-results',
  workers: process.env.CI ? 1 : undefined, // Opt out of parallel tests on CI
  fullyParallel: true,
  /* Fail the suite with first failed test */
  maxFailures: process.env.CI ? 1 : 0,
  timeout: process.env.NODE_ENV === 'production' ? 40000 : 220000,
  expect: {
    timeout: process.env.NODE_ENV === 'production' ? 40000 : 220000,
  },
  retries: process.env.CI ? 2 : 0, // retry in CI only
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    headless: true,
    actionTimeout: 0
  },

  // Run your local dev server before starting the tests.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false, // if port already used or for CI
    timeout: 60000, // wait max 60s for server to boot
  },
});
