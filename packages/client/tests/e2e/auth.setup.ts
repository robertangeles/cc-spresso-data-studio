import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Auth fixture — runs once before every authenticated test suite.
 *
 *  1. POST to /api/auth/login (no CAPTCHA on login path — verified).
 *  2. Save cookies as storageState for consuming tests.
 *
 * Depends on the `e2e-test@test.com` user existing. Run
 * `pnpm -C packages/server db:seed-e2e` once before executing tests.
 */

const STORAGE_PATH = 'tests/e2e/.auth/user.json';
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3006';
const E2E_EMAIL = 'e2e-test@test.com';
const E2E_PASSWORD = 'e2e-test-password-123';

setup('authenticate e2e-test@test.com', async ({ request }) => {
  // Ensure the output dir exists so `storageState({ path })` can write it.
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.status(), 'login should return 200').toBe(200);

  const body = await res.json();
  expect(body?.success, 'login response should have success: true').toBe(true);
  expect(body?.data?.accessToken, 'login response should include accessToken').toBeTruthy();

  // Save cookies — including the httpOnly refresh cookie — for browser contexts.
  await request.storageState({ path: STORAGE_PATH });
});
