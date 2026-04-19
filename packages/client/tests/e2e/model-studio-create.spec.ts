import { test, expect } from '@playwright/test';

/**
 * S2-E1 — create a model via the UI, assert it:
 *   1. Appears in the list view.
 *   2. Is reachable via its /model-studio/:modelId detail route.
 *   3. Survives a page reload.
 *
 * Cleanup: deletes the test model via the API at the end of the
 * test so repeated runs don't pile up rows in the DB (lesson 8).
 * Uses a timestamp-suffixed name so parallel-failed runs never
 * collide on the (org_id, owner_id, name) unique index.
 */

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3006';

test.describe('Model Studio — create flow', () => {
  test('Start blank creates a model, lists it, detail persists on reload', async ({
    page,
    request,
  }) => {
    const testName = `E2E Smoke ${Date.now()}`;

    await page.goto('/model-studio');
    await page.waitForLoadState('networkidle');

    // If the flag is OFF, this test cannot proceed. Skip explicitly rather
    // than fail — the Step-1 E2E already covers the stub case.
    const enableBtn = page.getByRole('button', { name: /enable model studio/i });
    if (await enableBtn.isVisible().catch(() => false)) {
      test.skip(true, 'Model Studio flag is OFF in this environment — skipping create flow.');
    }

    // Open the create dialog — either from Start blank (empty state)
    // or from New model (list view). Try both in order.
    const startBlank = page.getByRole('button', { name: /start blank/i });
    const newModelBtn = page.getByRole('button', { name: /new model/i });
    if (await startBlank.isVisible().catch(() => false)) {
      await startBlank.click();
    } else {
      await newModelBtn.click();
    }

    // Fill + submit
    await page.getByLabel(/model name/i).fill(testName);
    await page.getByRole('button', { name: /create model/i }).click();

    // Expect redirect to detail route. React Router uses client-side
    // navigation so URL should update to /model-studio/<uuid> quickly.
    await page.waitForURL(/\/model-studio\/[0-9a-f-]{36}/, { timeout: 10_000 });
    const detailUrl = page.url();
    const modelId = detailUrl.match(/\/model-studio\/([0-9a-f-]{36})/)?.[1];
    expect(modelId, 'detail URL should include a UUID').toBeTruthy();

    // Detail page should show the model name + the Step-3 canvas placeholder
    await expect(page.getByRole('heading', { name: testName })).toBeVisible();
    await expect(page.getByText(/canvas coming in step 3/i)).toBeVisible();

    // Reload → state persists (server is authoritative)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: testName })).toBeVisible();

    // Back to the list → the model must be present
    await page.getByRole('link', { name: /all models/i }).click();
    await page.waitForURL(/\/model-studio$/);
    await expect(page.getByText(testName)).toBeVisible();

    // Cleanup — best-effort, don't fail the test if cleanup fails
    if (modelId) {
      const storageState = await page.context().storageState();
      const cookieHeader = storageState.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      // Use the API directly with the refresh cookie; first refresh to
      // obtain a fresh access token, then delete.
      const refresh = await request.post(`${API_BASE}/api/auth/refresh`, {
        headers: { cookie: cookieHeader },
      });
      if (refresh.ok()) {
        const token = (await refresh.json())?.data?.accessToken;
        if (token) {
          await request.delete(`${API_BASE}/api/model-studio/models/${modelId}`, {
            headers: { authorization: `Bearer ${token}` },
          });
        }
      }
    }
  });
});
