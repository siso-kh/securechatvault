import { defineConfig } from '@playwright/test'

// UI tests run against the real stack: the Vite dev server on :5173 proxying
// to the backend on :5000 (with the seeded admin) and the redactor on :4000.
// Start the backend (`npm run dev` in server/) before running these.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    channel: 'chrome', // use the installed Chrome instead of downloading browsers
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
