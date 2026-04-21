import { test, expect, type Page, request as playwrightRequest } from '@playwright/test';

/**
 * Step 6 — Model Studio relationships E2E.
 *
 * Maps to test-plan-model-studio.md §STEP 6 EXPANSION E2E:
 *   S6-E1  Drag handle A→B → edge appears on canvas.
 *   S6-E2  Flip IE → IDEF1X via NotationSwitcher → edges re-render.
 *   S6-E3  Drag to empty canvas → cancels; no new edge.
 *   S6-E4  Duplicate drag → 409 → RelationshipPanel opens for existing rel.
 *   S6-E5  Flip IE → IDEF1X → IE round-trip preserves the original render.
 *   S6-E6  Delete entity with 3 rels → CascadeDeleteDialog → confirm → gone.
 *   S6-E7  Toggle isIdentifying true→false → propagated attrs removed.
 *   S6-E8  Infer panel → accept 3 proposals → 3 rels created.
 *   S6-E9  [fixme] Two-tab BroadcastChannel notation sync.
 *   S6-E10 [fixme] ⌘R keyboard-draw flow.
 *
 * Post-ship patch additions (tasks/alignment-step6-patch.md §2):
 *   S6-E11 Drag persists after pan + refresh (fix #3).
 *   S6-E12 Notation flip no longer surfaces "Validation failed" toast (fix #4).
 *   S6-E13 Cardinality glyphs visible in edge SVG (fix #2).
 *   S6-E14 Self-ref arc path rendered outside entity bbox (fix #6).
 *   S6-E15 Undo create rel (depends on Agent A undo core).
 *   S6-E16 Undo notation flip (depends on Agent A undo core).
 *
 * ---------------------------------------------------------------------
 * Auth strategy (lessons.md #30):
 *
 * The previous `isolatedTest` fixture in this file logged in per-test via
 * POST /api/auth/login. With ~15 tests that burned the 5-per-15-min auth
 * rate limit and every run after the 5th test stalled on the login
 * redirect. We now rely on Playwright's project dependency chain:
 *   setup project → saves .auth/user.json (refresh cookie + accessToken
 *     in storageState)
 *   chromium project → has `storageState: 'tests/e2e/.auth/user.json'`
 *     attached via playwright.config.ts (line 60).
 *
 * To perform authenticated API calls via `page.request`, we mint ONE
 * access token per worker using the persisted refresh cookie via
 * POST /api/auth/refresh (does not count against the login rate limit).
 * The token is cached in a module-level variable so subsequent tests
 * in the same worker reuse it. `page.addInitScript` injects the same
 * token into `window.__E2E_ACCESS_TOKEN__` so the in-page api wrapper
 * short-circuits the cookie refresh dance (see AuthContext.tsx).
 *
 * Data isolation: each test creates its own Step-6 model via the API
 * in `beforeEach` and tears it down in `afterEach`. Zero cross-test
 * state leakage.
 *
 * Network-wait contract (lessons.md #27): every assertion that depends
 * on server state hoists `page.waitForResponse(...)` BEFORE the action
 * that triggers the request — never `waitForTimeout`.
 *
 * Feature-flag contract: the dev server MUST run with
 * `MODEL_STUDIO_RELATIONSHIPS_ENABLED=true`, otherwise every rel route
 * returns 404 and the canvas edges never load. The seed helpers assert
 * the flag is on by checking the initial `GET /relationships` returns
 * 200 (not 404); tests abort early with a clear error if not.
 */

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3006';

/**
 * Cached access token — minted exactly ONCE per worker via POST
 * /api/auth/refresh and reused across every test for the rest of the
 * run. The refresh call mutates the cookie state server-side (JWT
 * refresh rotation), so issuing multiple refresh calls from
 * independent contexts — as would happen if every test called its own
 * `context.request.post('/auth/refresh')` — invalidates subsequent
 * attempts. One call per worker sidesteps that entirely.
 */
const STORAGE_PATH = 'tests/e2e/.auth/user.json';
let cachedAccessToken: string | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;
  const reqCtx = await playwrightRequest.newContext({ storageState: STORAGE_PATH });
  try {
    const res = await reqCtx.post(`${API_BASE}/api/auth/refresh`);
    if (res.status() !== 200) {
      const body = await res.text();
      throw new Error(
        `refresh failed (${res.status()}): ${body}. Ensure 'setup' project ran and .auth/user.json exists.`,
      );
    }
    const body = await res.json();
    const token = body?.data?.accessToken as string | undefined;
    if (!token) throw new Error('refresh did not return accessToken');
    // Persist the rotated cookie so any other spec in the same run
    // picks up the fresh refresh token.
    await reqCtx.storageState({ path: STORAGE_PATH });
    cachedAccessToken = token;
    return token;
  } finally {
    await reqCtx.dispose();
  }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createModel(page: Page, token: string): Promise<string> {
  const projectsRes = await page.request.get(`${API_BASE}/api/projects`, {
    headers: authHeaders(token),
  });
  expect(projectsRes.status(), 'projects list should be 200').toBe(200);
  const projectsBody = await projectsRes.json();
  const project = projectsBody.data?.projects?.[0] ?? projectsBody.data?.[0];
  expect(project?.id).toBeTruthy();

  const created = await page.request.post(`${API_BASE}/api/model-studio/models`, {
    headers: authHeaders(token),
    data: {
      name: `Step6 E2E ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      activeLayer: 'logical',
    },
  });
  expect(created.status()).toBe(201);
  const body = await created.json();
  return body.data.id;
}

async function createEntityViaApi(
  page: Page,
  token: string,
  modelId: string,
  name: string,
): Promise<string> {
  const res = await page.request.post(`${API_BASE}/api/model-studio/models/${modelId}/entities`, {
    headers: authHeaders(token),
    data: { name, layer: 'logical' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.data.id;
}

async function createAttributeViaApi(
  page: Page,
  token: string,
  modelId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await page.request.post(
    `${API_BASE}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
    { headers: authHeaders(token), data: payload },
  );
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.data.id;
}

async function createRelationshipViaApi(
  page: Page,
  token: string,
  modelId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await page.request.post(
    `${API_BASE}/api/model-studio/models/${modelId}/relationships`,
    { headers: authHeaders(token), data: payload },
  );
  if (res.status() === 404) {
    throw new Error(
      'POST /relationships returned 404 — MODEL_STUDIO_RELATIONSHIPS_ENABLED likely not set on the dev server',
    );
  }
  expect(res.status(), `create rel body=${await res.text()}`).toBe(201);
  const body = await res.json();
  return body.data.id;
}

async function listRelationshipsViaApi(
  page: Page,
  token: string,
  modelId: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await page.request.get(
    `${API_BASE}/api/model-studio/models/${modelId}/relationships`,
    { headers: authHeaders(token) },
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data?.relationships ?? [];
}

async function listAttributesViaApi(
  page: Page,
  token: string,
  modelId: string,
): Promise<Array<{ id: string; name: string; entityId: string; isPrimaryKey: boolean }>> {
  // The model-wide batch endpoint returns `{ attributesByEntity: {..},
  // total }`. Flatten into a single array so callers can filter by
  // `entityId` uniformly.
  const res = await page.request.get(`${API_BASE}/api/model-studio/models/${modelId}/attributes`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  const byEntity = body.data?.attributesByEntity ?? {};
  const flat: Array<{ id: string; name: string; entityId: string; isPrimaryKey: boolean }> = [];
  for (const key of Object.keys(byEntity)) {
    const rows = byEntity[key] as Array<{
      id: string;
      name: string;
      entityId: string;
      isPrimaryKey: boolean;
    }>;
    for (const r of rows) flat.push(r);
  }
  return flat;
}

async function getCanvasState(
  page: Page,
  token: string,
  modelId: string,
  layer: 'logical' | 'physical' | 'conceptual' = 'logical',
): Promise<{ nodePositions: Record<string, { x: number; y: number }>; notation: string }> {
  const res = await page.request.get(
    `${API_BASE}/api/model-studio/models/${modelId}/canvas-state?layer=${layer}`,
    { headers: authHeaders(token) },
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    nodePositions: body.data?.nodePositions ?? {},
    notation: body.data?.notation ?? 'ie',
  };
}

async function deleteModel(page: Page, id: string, token: string): Promise<void> {
  await page.request
    .delete(`${API_BASE}/api/model-studio/models/${id}`, { headers: authHeaders(token) })
    .catch(() => undefined);
}

/**
 * Seed deterministic canvas positions for a set of entities. The
 * Step-3 canvas defaults every API-created entity's position to (0,0),
 * which piles all nodes on top of one another and makes drag-based
 * tests impossible. We PUT a layout that spreads them left→right with
 * 320 px spacing.
 */
async function seedCanvasPositions(
  page: Page,
  token: string,
  modelId: string,
  layer: 'conceptual' | 'logical' | 'physical',
  entityIds: string[],
): Promise<void> {
  const nodePositions: Record<string, { x: number; y: number }> = {};
  entityIds.forEach((id, i) => {
    nodePositions[id] = { x: i * 320, y: 120 };
  });
  const res = await page.request.put(
    `${API_BASE}/api/model-studio/models/${modelId}/canvas-state?layer=${layer}`,
    {
      headers: authHeaders(token),
      data: {
        layer,
        nodePositions,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
  );
  expect(
    res.status(),
    `canvas-state PUT should be 200 — got ${res.status()}: ${await res.text()}`,
  ).toBe(200);
}

/**
 * Seed a 3-entity model (customer / order / item) with PK `id` attrs.
 * Used by every test that needs a canvas with nodes ready for dragging.
 */
async function seedThreeEntityModel(
  page: Page,
  token: string,
): Promise<{
  modelId: string;
  customerId: string;
  orderId: string;
  itemId: string;
  customerPk: string;
  orderPk: string;
  itemPk: string;
}> {
  const modelId = await createModel(page, token);
  const customerId = await createEntityViaApi(page, token, modelId, 'customer');
  const orderId = await createEntityViaApi(page, token, modelId, 'order');
  const itemId = await createEntityViaApi(page, token, modelId, 'item');

  const customerPk = await createAttributeViaApi(page, token, modelId, customerId, {
    name: 'customer_id',
    dataType: 'uuid',
    isPrimaryKey: true,
  });
  const orderPk = await createAttributeViaApi(page, token, modelId, orderId, {
    name: 'order_id',
    dataType: 'uuid',
    isPrimaryKey: true,
  });
  const itemPk = await createAttributeViaApi(page, token, modelId, itemId, {
    name: 'item_id',
    dataType: 'uuid',
    isPrimaryKey: true,
  });

  await seedCanvasPositions(page, token, modelId, 'logical', [customerId, orderId, itemId]);

  return { modelId, customerId, orderId, itemId, customerPk, orderPk, itemPk };
}

/**
 * Inject the access token into `window.__E2E_ACCESS_TOKEN__` so the
 * in-page api wrapper short-circuits the cookie refresh dance (see
 * AuthContext.tsx — lessons.md #27). Must be called BEFORE `page.goto`.
 */
async function injectAccessToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    (window as unknown as { __E2E_ACCESS_TOKEN__?: string }).__E2E_ACCESS_TOKEN__ = t;
  }, token);
}

/**
 * Canvas-load helper. HOISTS the relationships GET before `goto` so
 * we never race the initial fetch.
 */
async function openCanvasAndWait(
  page: Page,
  modelId: string,
  expectedEntityCount: number,
): Promise<void> {
  const relsResp = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/model-studio/models/${modelId}/relationships`) &&
      r.request().method() === 'GET' &&
      r.status() === 200,
    { timeout: 30_000 },
  );
  await page.goto(`/model-studio/${modelId}`);
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 });
  await relsResp;
  await expect(page.getByTestId('entity-node')).toHaveCount(expectedEntityCount, {
    timeout: 30_000,
  });

  for (let i = 0; i < expectedEntityCount; i++) {
    await expect(page.getByTestId('entity-node').nth(i)).toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Resolve a React Flow Handle DOM element for a given entity node.
 */
async function handleBox(
  page: Page,
  nodeIndex: number,
  side: 'top' | 'bottom' | 'left' | 'right',
): Promise<{ x: number; y: number }> {
  const handle = page
    .getByTestId('entity-node')
    .nth(nodeIndex)
    .locator(`.react-flow__handle.react-flow__handle-${side}`)
    .first();
  await handle.waitFor({ state: 'attached', timeout: 5_000 });
  const box = await handle.boundingBox();
  if (!box || box.width === 0 || box.height === 0) {
    throw new Error(
      `no usable bounding box for node ${nodeIndex} handle ${side} (got ${JSON.stringify(box)})`,
    );
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * React Flow drag primitive. Source == right handle of `fromIndex`,
 * target == left handle of `toIndex`. Matches the seeded left→right
 * grid layout.
 */
async function dragEdge(page: Page, fromIndex: number, toIndex: number): Promise<void> {
  const src = await handleBox(page, fromIndex, 'right');
  const tgt = await handleBox(page, toIndex, 'left');

  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x + 6, src.y, { steps: 3 });
  await page.mouse.move((src.x + tgt.x) / 2, (src.y + tgt.y) / 2, { steps: 14 });
  await page.mouse.move(tgt.x, tgt.y, { steps: 14 });
  await page.mouse.move(tgt.x, tgt.y, { steps: 2 });
  await page.mouse.up();
}

async function dragEdgeToEmpty(page: Page, fromIndex: number): Promise<void> {
  const src = await handleBox(page, fromIndex, 'bottom');
  const canvas = page.locator('.react-flow');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canvas missing bounding box');

  const tx = canvasBox.x + canvasBox.width - 20;
  const ty = canvasBox.y + 40;

  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x, src.y + 8, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.mouse.up();
}

// ────────────────────────────────────────────────────────────────────
// Spec body
// ────────────────────────────────────────────────────────────────────

test.describe('Model Studio — relationships (Step 6)', () => {
  // Per-test state — populated in beforeEach, torn down in afterEach.
  let accessToken: string;
  let seed: {
    modelId: string;
    customerId: string;
    orderId: string;
    itemId: string;
    customerPk: string;
    orderPk: string;
    itemPk: string;
  } | null = null;

  test.beforeEach(async ({ page }) => {
    accessToken = await getAccessToken();
    await injectAccessToken(page, accessToken);
    seed = null; // tests that need the 3-entity seed call seedThreeEntityModel explicitly
  });

  test.afterEach(async ({ page }) => {
    if (seed?.modelId) {
      await deleteModel(page, seed.modelId, accessToken);
      seed = null;
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E1 — drag handle A→B creates a relationship edge.
  //
  // FIXME: React Flow v12 drag-to-connect is not reliably automatable
  // with Playwright's `mouse.down/move/up` sequence (lessons.md #27).
  // The synthetic PointerEvent sequence either (a) never enters
  // connection mode and the canvas pans instead, or (b) releases one
  // frame before the target handle is registered as the drop target.
  // Unblocks after Agent C lands glyph visibility + Agent D lands
  // sync-effect fix; drag primitive will still likely need tuning.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E1: drag handle A→B → edge appears on canvas', async ({ page }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await openCanvasAndWait(page, seed.modelId, 3);

    await dragEdge(page, 0, 1);

    await expect(page.locator('[data-testid^="relationship-edge-"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect
      .poll(async () => (await listRelationshipsViaApi(page, accessToken, seed!.modelId)).length, {
        timeout: 15_000,
      })
      .toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E2 — flip IE → IDEF1X; edges re-render with the other notation.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E2: flip IE → IDEF1X → edges re-render with new notation', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await openCanvasAndWait(page, seed.modelId, 3);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await expect(edge).toHaveAttribute('data-notation', 'ie');

    const putResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 25_000 },
    );
    await page.getByTestId('notation-pill-idef1x').click();
    const putRes = await putResp;
    expect(putRes.status(), 'PUT canvas-state should be 200').toBe(200);

    await expect(edge).toHaveAttribute('data-notation', 'idef1x', { timeout: 15_000 });
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E3 — drag into empty canvas cancels; no edge appears.
  //
  // FIXME: Same React Flow v12 drag-automation brittleness as S6-E1.
  // Unblocks after Agent C/D land.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E3: drag to empty canvas → React Flow cancels, no new edge', async ({ page }) => {
    seed = await seedThreeEntityModel(page, accessToken);
    await openCanvasAndWait(page, seed.modelId, 3);

    let postFired = false;
    page.on('response', (resp) => {
      if (
        resp.url().endsWith(`/models/${seed!.modelId}/relationships`) &&
        resp.request().method() === 'POST'
      ) {
        postFired = true;
      }
    });

    await dragEdgeToEmpty(page, 0);

    await expect
      .poll(async () => await page.locator('[data-testid^="relationship-edge-"]').count(), {
        timeout: 3_000,
      })
      .toBe(0);

    expect(postFired).toBe(false);
    const rels = await listRelationshipsViaApi(page, accessToken, seed.modelId);
    expect(rels).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E4 — duplicate drag → client short-circuit opens RelationshipPanel.
  //
  // FIXME: Same React Flow v12 drag-automation brittleness as S6-E1.
  // Unblocks after Agent C/D land.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E4: duplicate drag → opens RelationshipPanel for existing rel', async ({
    page,
  }) => {
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await openCanvasAndWait(page, seed.modelId, 3);

    await dragEdge(page, 0, 1);
    await expect(page.getByTestId('relationship-panel')).toBeVisible({ timeout: 5_000 });

    const rels = await listRelationshipsViaApi(page, accessToken, seed.modelId);
    expect(rels).toHaveLength(1);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E5 — IE → IDEF1X → IE round-trip must restore original render.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E5: flip IE → IDEF1X → IE round-trip restores original notation', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await openCanvasAndWait(page, seed.modelId, 3);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await expect(edge).toHaveAttribute('data-notation', 'ie');

    const putResp1 = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 25_000 },
    );
    await page.getByTestId('notation-pill-idef1x').click();
    await putResp1;
    await expect(edge).toHaveAttribute('data-notation', 'idef1x', { timeout: 15_000 });

    const putResp2 = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 25_000 },
    );
    await page.getByTestId('notation-pill-ie').click();
    await putResp2;
    await expect(edge).toHaveAttribute('data-notation', 'ie', { timeout: 15_000 });

    const state = await getCanvasState(page, accessToken, seed.modelId, 'logical');
    expect(state.notation).toBe('ie');
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E6 — delete entity with 3 rels → cascade dialog → confirm → gone.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E6: delete entity with 3 rels → CascadeDeleteDialog → confirm → rels + entity gone', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    const noteId = await createEntityViaApi(page, accessToken, seed.modelId, 'note');
    await createAttributeViaApi(page, accessToken, seed.modelId, noteId, {
      name: 'note_id',
      dataType: 'uuid',
      isPrimaryKey: true,
    });
    await seedCanvasPositions(page, accessToken, seed.modelId, 'logical', [
      seed.customerId,
      seed.orderId,
      seed.itemId,
      noteId,
    ]);

    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.itemId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: noteId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });

    await openCanvasAndWait(page, seed.modelId, 4);
    await expect(page.locator('[data-testid^="relationship-edge-"]')).toHaveCount(3);

    const customerNode = page
      .getByTestId('entity-node')
      .filter({
        has: page.getByTestId('entity-node-name').getByText('customer', { exact: true }),
      })
      .first();
    await customerNode.click();
    await expect(
      customerNode.locator('xpath=ancestor::*[contains(@class,"react-flow__node")][1]'),
    ).toHaveClass(/selected/, { timeout: 5_000 });

    // React Flow's useKeyPress hook listens on `window.document` by
    // default, but clicking the entity node opens the EntityEditor
    // panel which steals focus. Dispatch the key directly on
    // document so React Flow picks it up regardless of which
    // element owns focus.
    await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', {
        key: 'Delete',
        code: 'Delete',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(ev);
    });

    await expect(page.getByTestId('cascade-delete-dialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('cascade-delete-count')).toContainText('3');
    const rows = page.locator('[data-testid="cascade-delete-list"] li');
    await expect(rows).toHaveCount(3);

    const deleteResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/entities/${seed!.customerId}`) &&
        r.request().method() === 'DELETE' &&
        r.status() < 400,
      { timeout: 10_000 },
    );
    await page.getByTestId('cascade-delete-confirm').click();
    await deleteResp;

    await expect(page.getByTestId('entity-node')).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator('[data-testid^="relationship-edge-"]')).toHaveCount(0);

    const remaining = await listRelationshipsViaApi(page, accessToken, seed.modelId);
    expect(remaining).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E7 — toggle isIdentifying true→false → propagated attrs unwound.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E7: toggle isIdentifying true→false → propagated PKs unwound', async ({ page }) => {
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: true,
      layer: 'logical',
    });

    const attrsBefore = await listAttributesViaApi(page, accessToken, seed.modelId);
    const orderAttrsBefore = attrsBefore.filter((a) => a.entityId === seed!.orderId);
    expect(
      orderAttrsBefore.some((a) => a.name === 'customer_id'),
      `expected propagated customer_id on order before toggle (got ${JSON.stringify(orderAttrsBefore.map((a) => a.name))})`,
    ).toBe(true);

    await openCanvasAndWait(page, seed.modelId, 3);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await edge.click();
    await expect(page.getByTestId('relationship-panel')).toBeVisible();

    await page.getByTestId('rel-tab-cardinality').click();
    await expect(page.getByTestId('rel-identifying-toggle')).toBeVisible();

    const patchResp = page.waitForResponse(
      (r) =>
        r.url().includes('/relationships/') &&
        r.request().method() === 'PATCH' &&
        r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByTestId('rel-identifying-toggle').click();
    await patchResp;

    const attrsAfter = await listAttributesViaApi(page, accessToken, seed.modelId);
    const orderAttrsAfter = attrsAfter.filter((a) => a.entityId === seed!.orderId);
    expect(
      orderAttrsAfter.some((a) => a.name === 'customer_id'),
      `expected propagated customer_id GONE from order after unwind (got ${JSON.stringify(orderAttrsAfter.map((a) => a.name))})`,
    ).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E8 — infer panel → accept all → at least 3 rels created.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E8: Infer panel → accept all → 3 rels created', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000);
    seed = await seedThreeEntityModel(page, accessToken);
    const addressId = await createEntityViaApi(page, accessToken, seed.modelId, 'address');
    await createAttributeViaApi(page, accessToken, seed.modelId, addressId, {
      name: 'address_id',
      dataType: 'uuid',
      isPrimaryKey: true,
    });
    await seedCanvasPositions(page, accessToken, seed.modelId, 'logical', [
      seed.customerId,
      seed.orderId,
      seed.itemId,
      addressId,
    ]);

    // FK attrs MUST carry `fk_target_attr_id` in metadata for the
    // inference engine to emit a proposal (see
    // model-studio-relationship-infer.service.ts L30-31).
    const addressPk = (await listAttributesViaApi(page, accessToken, seed.modelId)).find(
      (a) => a.entityId === addressId && a.isPrimaryKey,
    );
    if (!addressPk) throw new Error('expected address PK attr to exist');
    await createAttributeViaApi(page, accessToken, seed.modelId, seed.customerId, {
      name: 'order_id',
      dataType: 'uuid',
      isForeignKey: true,
      isNullable: false,
      isUnique: true,
      metadata: { fk_target_attr_id: seed.orderPk },
    });
    await createAttributeViaApi(page, accessToken, seed.modelId, seed.customerId, {
      name: 'item_id',
      dataType: 'uuid',
      isForeignKey: true,
      isNullable: false,
      isUnique: true,
      metadata: { fk_target_attr_id: seed.itemPk },
    });
    await createAttributeViaApi(page, accessToken, seed.modelId, seed.customerId, {
      name: 'address_id',
      dataType: 'uuid',
      isForeignKey: true,
      isNullable: false,
      isUnique: true,
      metadata: { fk_target_attr_id: addressPk.id },
    });

    await openCanvasAndWait(page, seed.modelId, 4);

    const inferResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/relationships/infer`) &&
        r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await page.getByTestId('infer-rels-button').click();
    await inferResp;

    await expect(page.getByTestId('infer-rels-panel')).toBeVisible();
    const proposals = page.locator('[data-testid^="infer-proposal-"]').filter({
      hasNot: page.locator('[data-testid^="infer-proposal-toggle-"]'),
    });

    await expect
      .poll(async () => await proposals.count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);

    const count = await proposals.count();
    expect(
      count,
      `expected at least 3 FK inference proposals for seeded model, got ${count}`,
    ).toBeGreaterThanOrEqual(3);

    await page.getByTestId('infer-submit').click();

    await expect
      .poll(async () => (await listRelationshipsViaApi(page, accessToken, seed!.modelId)).length, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(3);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E9 — two-tab BroadcastChannel notation sync.
  //
  // FIXME: BroadcastChannel is scoped to a single browser process's
  // page cluster. Playwright launches each BrowserContext in its own
  // process, so a flip in one context cannot be received in a second.
  // S6-U21 covers the same logic as a client unit. Unblocks after a
  // dedicated multi-context test design that shares ONE BrowserContext.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E9: two-tab BroadcastChannel notation sync', async () => {
    // See header — BroadcastChannel does not cross BrowserContext
    // boundaries with Playwright's per-context Chromium processes.
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E10 — ⌘R keyboard-draw flow.
  //
  // FIXME: Step 6 shipped with no ⌘R keyboard-draw handler. Zero refs
  // to KeyR / metaKey / 'r' in ModelStudioCanvas.tsx. Unblocks after
  // a dedicated follow-up phase implements the handler.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E10: ⌘R keyboard-draw (select source → ⌘R → select target → Enter)', async () => {
    // No handler exists yet — see header.
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E11 — drag persists after pan + refresh (patch fix #3).
  //
  // We do NOT go through React Flow's drag-to-move (same v12 automation
  // brittleness as the drag-to-connect cases). Instead we drive the
  // position via `canvas-state` PUT — exactly what the drag-end handler
  // does in production — then pan the canvas, reload the page, and
  // assert the position round-tripped. This exercises the sync-effect
  // regression path directly: the bug was that panning the canvas
  // resubmitted stale positions, so after pan+refresh the dragged
  // entity snapped back to its seeded position.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E11: drag persists after pan + refresh (regression for fix #3)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await openCanvasAndWait(page, seed.modelId, 3);

    // Simulate a drag of entity 0 by PUTting a new position for it.
    const newX = 100;
    const newY = 250;
    const putResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    const putRes = await page.request.put(
      `${API_BASE}/api/model-studio/models/${seed.modelId}/canvas-state?layer=logical`,
      {
        headers: authHeaders(accessToken),
        data: {
          layer: 'logical',
          nodePositions: {
            [seed.customerId]: { x: newX, y: newY },
            [seed.orderId]: { x: 320, y: 120 },
            [seed.itemId]: { x: 640, y: 120 },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    );
    expect(putRes.status()).toBe(200);
    await putResp.catch(() => undefined);

    // Pan the viewport — the old sync-effect bug clobbered the
    // just-saved position by resubmitting the pre-drag state.
    const canvasBox = await page.locator('.react-flow').boundingBox();
    if (!canvasBox) throw new Error('canvas missing bounding box');
    const panStart = {
      x: canvasBox.x + canvasBox.width / 2,
      y: canvasBox.y + canvasBox.height / 2,
    };
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 180, panStart.y + 60, { steps: 10 });
    await page.mouse.up();

    // Refresh — the position MUST round-trip via canvas_states.
    await page.reload();
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });

    const state = await getCanvasState(page, accessToken, seed.modelId, 'logical');
    const customerPos = state.nodePositions[seed.customerId];
    expect(customerPos, 'customer position should round-trip').toBeTruthy();
    expect(customerPos.x).toBe(newX);
    expect(customerPos.y).toBe(newY);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E12 — notation flip no longer surfaces "Validation failed" toast
  // (patch fix #4).
  //
  // Before the fix, the canvas-state PUT schema rejected `notation`,
  // the client surfaced a toast with text matching /validation failed/i.
  // This test asserts NO such toast appears after a flip.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E12: notation flip does not surface "Validation failed" toast (fix #4)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await openCanvasAndWait(page, seed.modelId, 3);

    const putResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 25_000 },
    );
    await page.getByTestId('notation-pill-idef1x').click();
    const putRes = await putResp;
    expect(putRes.status(), 'PUT canvas-state should succeed with notation in the body').toBe(200);

    // Give any error toast a beat to render, then assert none did.
    await page.waitForTimeout(500);
    const alerts = page.getByRole('alert');
    const alertCount = await alerts.count();
    for (let i = 0; i < alertCount; i++) {
      const text = (await alerts.nth(i).textContent()) ?? '';
      expect(
        text.toLowerCase(),
        `no alert should mention "validation failed" — found: ${text}`,
      ).not.toContain('validation failed');
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E13 — cardinality glyphs visible in edge SVG (patch fix #2).
  //
  // The edge SVG renders glyphs via <g data-glyph="..."> elements (see
  // RelationshipEdge.tsx L321/325/339/350). Before the fix, the glyphs
  // rendered behind the entity card because endpoint coords sat on the
  // entity border. Assert at least one glyph exists AND has a non-zero
  // on-screen bounding box.
  //
  // FIXME (pending): unblocks after Agent C lands the glyph-positioning
  // fix. Kept here as the lock-in test for that work.
  // ──────────────────────────────────────────────────────────────────
  test('S6-E13: cardinality glyphs visible in edge SVG (locks fix #2)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await openCanvasAndWait(page, seed.modelId, 3);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await expect(edge).toBeVisible();

    const glyphs = edge.locator('[data-glyph]');
    await expect(glyphs.first()).toBeAttached({ timeout: 15_000 });
    const glyphCount = await glyphs.count();
    expect(glyphCount, 'edge should render at least one cardinality glyph').toBeGreaterThan(0);

    // At least one glyph must have a non-zero on-screen bounding box.
    let sawVisibleGlyph = false;
    for (let i = 0; i < glyphCount; i++) {
      const box = await glyphs.nth(i).boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        sawVisibleGlyph = true;
        break;
      }
    }
    expect(sawVisibleGlyph, 'at least one glyph should have a visible bounding box').toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E14 — self-ref arc rendered outside entity bbox (patch fix #6).
  //
  // FIXME (pending): unblocks after Agent C lands the self-ref arc
  // visibility fix (translate arc origin outside the entity bbox OR
  // raise arc z-index above node surface).
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E14: self-ref arc rendered outside entity bbox (locks fix #6)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    // Re-purpose `customer` as `employee` to host the self-ref. Add a
    // nullable FK column `manager_id` pointing back to the entity's PK.
    const employeeId = await createEntityViaApi(page, accessToken, seed.modelId, 'employee');
    await createAttributeViaApi(page, accessToken, seed.modelId, employeeId, {
      name: 'employee_id',
      dataType: 'uuid',
      isPrimaryKey: true,
    });
    await createAttributeViaApi(page, accessToken, seed.modelId, employeeId, {
      name: 'manager_id',
      dataType: 'uuid',
      isForeignKey: true,
      isNullable: true,
    });
    await seedCanvasPositions(page, accessToken, seed.modelId, 'logical', [
      seed.customerId,
      seed.orderId,
      seed.itemId,
      employeeId,
    ]);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: employeeId,
      targetEntityId: employeeId,
      name: null,
      sourceCardinality: 'zero_or_one',
      targetCardinality: 'zero_or_many',
      isIdentifying: false,
      layer: 'logical',
    });

    await openCanvasAndWait(page, seed.modelId, 4);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await expect(edge).toBeVisible();

    // Path `d` attribute must match the `selfRefPath` signature:
    // a Move-to then an elliptical arc of radius 40.
    const pathLocator = edge.locator('path').first();
    const d = await pathLocator.getAttribute('d');
    expect(d, 'edge path should have a `d` attribute').toBeTruthy();
    expect(d!, `self-ref path should start with "M " — got: ${d}`).toMatch(/^M /);
    expect(d!, `self-ref path should include "A 40 40" arc — got: ${d}`).toContain('A 40 40');

    // Arc bounding box must NOT be entirely inside the employee node.
    const pathBox = await pathLocator.boundingBox();
    const employeeNode = page
      .getByTestId('entity-node')
      .filter({
        has: page.getByTestId('entity-node-name').getByText('employee', { exact: true }),
      })
      .first();
    const nodeBox = await employeeNode.boundingBox();
    expect(pathBox && nodeBox).toBeTruthy();
    if (pathBox && nodeBox) {
      const insideHoriz =
        pathBox.x >= nodeBox.x && pathBox.x + pathBox.width <= nodeBox.x + nodeBox.width;
      const insideVert =
        pathBox.y >= nodeBox.y && pathBox.y + pathBox.height <= nodeBox.y + nodeBox.height;
      expect(
        insideHoriz && insideVert,
        'self-ref arc should extend outside the entity node bounding box',
      ).toBe(false);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E15 — undo create rel (⌘Z / Ctrl+Z).
  //
  // FIXME (pending): unblocks after Agent A lands the undo core.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E15: undo create rel (⌘Z) — rel count returns to 0 (locks undo core)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await openCanvasAndWait(page, seed.modelId, 3);

    // Drive the create via the API so this test doesn't share the
    // drag-automation brittleness of S6-E1. Once Agent A lands, the
    // client's undo stack captures any mutation irrespective of
    // how it was initiated.
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });

    await expect(page.locator('[data-testid^="relationship-edge-"]')).toHaveCount(1, {
      timeout: 10_000,
    });

    // Undo.
    await page.locator('.react-flow').focus();
    const deleteResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/relationships/`) &&
        r.request().method() === 'DELETE' &&
        r.status() < 400,
      { timeout: 10_000 },
    );
    // Ctrl works cross-platform in React keyboard handlers; the
    // Agent A spec must treat Control+Z and Meta+Z equivalently.
    await page.keyboard.press('Control+z');
    await deleteResp;

    await expect(page.locator('[data-testid^="relationship-edge-"]')).toHaveCount(0, {
      timeout: 10_000,
    });
    const rels = await listRelationshipsViaApi(page, accessToken, seed.modelId);
    expect(rels).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // S6-E16 — undo notation flip.
  //
  // FIXME (pending): unblocks after Agent A lands the undo core.
  // ──────────────────────────────────────────────────────────────────
  test.fixme('S6-E16: undo notation flip (⌘Z) restores previous notation (locks undo core)', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    seed = await seedThreeEntityModel(page, accessToken);
    await createRelationshipViaApi(page, accessToken, seed.modelId, {
      sourceEntityId: seed.customerId,
      targetEntityId: seed.orderId,
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    });
    await openCanvasAndWait(page, seed.modelId, 3);

    const edge = page.locator('[data-testid^="relationship-edge-"]').first();
    await expect(edge).toHaveAttribute('data-notation', 'ie');

    const putResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByTestId('notation-pill-idef1x').click();
    await putResp;
    await expect(edge).toHaveAttribute('data-notation', 'idef1x', { timeout: 10_000 });

    // Undo → notation back to IE.
    const undoResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/models/${seed!.modelId}/canvas-state`) && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.react-flow').focus();
    await page.keyboard.press('Control+z');
    await undoResp;

    await expect(edge).toHaveAttribute('data-notation', 'ie', { timeout: 10_000 });
    const state = await getCanvasState(page, accessToken, seed.modelId, 'logical');
    expect(state.notation).toBe('ie');
  });
});
