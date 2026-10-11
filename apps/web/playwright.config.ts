import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end tests against the real stack: React (Vite) → NestJS API → PostgreSQL
 * + S3 storage. Requires `npm run db:up` and migrations applied (see docs/DEVELOPMENT.md).
 * Uses the locally installed Google Chrome, so no Playwright browser download is needed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run build -w @job-assist/api && npm run start:prod -w @job-assist/api',
      cwd: '../..',
      url: 'http://localhost:3000/api/v1/health/ready',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 4200 --strictPort',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
