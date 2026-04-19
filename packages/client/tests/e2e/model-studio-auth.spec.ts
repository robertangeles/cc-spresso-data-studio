import { test, expect } from '@playwright/test';

/**
 * First authenticated E2E test — proves the auth fixture
 * (auth.setup.ts) actually produces a usable session.
 *
 * Flag-state-agnostic: whether the flag is ON (empty state) or OFF
 * (stub), the page always renders the `Model Studio` heading, so this
 * test is stable across toggles. State-specific assertions come in
 * the next spec once we can toggle the flag reliably from Playwright.
 */
test('authenticated user can load /model-studio (no redirect to login)', async ({ page }) => {
  await page.goto('/model-studio');
  await page.waitForLoadState('networkidle');

  // ProtectedRoute would have sent us to /login if the session were missing.
  expect(page.url()).not.toMatch(/\/login/);

  await expect(page.getByRole('heading', { name: 'Model Studio' })).toBeVisible();
});
