import { test, expect } from '@playwright/test';

/**
 * Smoke — no auth needed.
 * Confirms the dev stack is actually running and Playwright can
 * talk to it. Fast failure here tells us the env is broken, not
 * our code.
 */

test('dev server responds at /', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
});

test('unauthenticated /model-studio redirects to or renders login gate', async ({ page }) => {
  await page.goto('/model-studio');
  // ProtectedRoute either redirects to /login or renders login gate;
  // both states should surface either "Sign in" copy or the URL.
  await page.waitForLoadState('networkidle');
  const url = page.url();
  const content = await page.content();
  const landedOnLogin = /\/login/.test(url);
  const renderedLoginCopy = /sign\s*in|log\s*in/i.test(content);
  expect(landedOnLogin || renderedLoginCopy).toBe(true);
});
