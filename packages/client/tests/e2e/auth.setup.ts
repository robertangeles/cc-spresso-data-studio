import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Auth fixture — runs once before every authenticated test suite.
 *
 *  1. If `.auth/user.json` already exists AND contains a refresh cookie
 *     that /api/auth/refresh accepts, skip login entirely. This avoids
 *     burning through the auth rate limit (5 per 15 min) on repeated
 *     local test runs.
 *  2. Otherwise POST to /api/auth/login and save cookies for reuse.
 *
 * Depends on the `e2e-test@test.com` user existing. Run
 * `pnpm -C packages/server db:seed-e2e` once before executing tests.
 */

const STORAGE_PATH = 'tests/e2e/.auth/user.json';
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3006';
const E2E_EMAIL = 'e2e-test@test.com';
const E2E_PASSWORD = 'e2e-test-password-123';

setup('authenticate e2e-test@test.com', async ({ request, playwright }) => {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  // Try to reuse an existing storageState via /api/auth/refresh first.
  if (fs.existsSync(STORAGE_PATH)) {
    try {
      const reuse = await playwright.request.newContext({ storageState: STORAGE_PATH });
      const refresh = await reuse.post(`${API_BASE}/api/auth/refresh`);
      if (refresh.ok()) {
        await reuse.storageState({ path: STORAGE_PATH });
        await reuse.dispose();
        return;
      }
      await reuse.dispose();
    } catch {
      // fall through to fresh login
    }
  }

  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.status(), 'login should return 200').toBe(200);

  const body = await res.json();
  expect(body?.success, 'login response should have success: true').toBe(true);
  expect(body?.data?.accessToken, 'login response should include accessToken').toBeTruthy();

  await request.storageState({ path: STORAGE_PATH });
});
