import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Model Studio (and future) E2E tests.
 *
 * Test scope lives in `tests/e2e/`. Tests expect:
 *   - Client dev server on :5176 (Vite)
 *   - Backend dev server on :3006 (Express)
 *
 * Run BOTH servers before executing: `pnpm dev` in two terminals.
 * We do NOT use Playwright's webServer option to start them because
 * the monorepo's tsx watch + Vite HMR are already better at hot-reload
 * during normal development — CI will get its own webServer config later.
 *
 * Auth: globalSetup.ts logs in as `e2e-test@test.com` via the real
 * login flow and persists cookies + storage to `.auth/user.json`.
 * Individual tests consume this via `use.storageState`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Run tests sequentially — we share one DB and one test user.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5176',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Smoke tests that don't need a signed-in user.
    {
      name: 'smoke',
      testMatch: /.*\.smoke\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Auth setup — signs in, saves `.auth/user.json` for the authenticated project.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Authenticated tests — depend on the setup project.
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /.*\.smoke\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
    },
  ],
});
