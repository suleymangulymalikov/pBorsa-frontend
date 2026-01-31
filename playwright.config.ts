import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: './e2e/tests',
  // Folder for test artifacts such as screenshots, videos, traces, etc.
  outputDir: 'e2e/test-results',

  timeout: 10000,
  workers:undefined, // auto count

  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },

  // Run your local dev server before starting the tests.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true // if port already used
  },
});
