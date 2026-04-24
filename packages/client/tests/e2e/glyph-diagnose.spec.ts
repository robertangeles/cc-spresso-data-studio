import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Diagnostic: reproduce the stuck-glyph bug by creating a minimal
 * model, adding a relationship, then dragging a waypoint to force
 * a bend. Dumps:
 *   - sourceX/Y, targetX/Y + handle id the edge chose
 *   - <g transform=...> from source + target glyphs
 *   - Screenshots before + after
 */

const API = 'http://localhost:3006';
const authHeaders = (t: string) => ({
  Authorization: `Bearer ${t}`,
  'content-type': 'application/json',
});

async function refreshToken(req: APIRequestContext): Promise<string> {
  const res = await req.post(`${API}/api/auth/refresh`);
  if (!res.ok()) throw new Error(`refresh: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { data?: { accessToken?: string } };
  const t = body.data?.accessToken;
  if (!t) throw new Error('no accessToken');
  return t;
}

async function firstProjectId(page: Page, token: string): Promise<string> {
  const res = await page.request.get(`${API}/api/projects`, { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  const body = await res.json();
  const project = body.data?.projects?.[0] ?? body.data?.[0];
  expect(project?.id).toBeTruthy();
  return project.id;
}

async function createModel(page: Page, token: string, projectId: string): Promise<string> {
  const res = await page.request.post(`${API}/api/model-studio/models`, {
    headers: authHeaders(token),
    data: { name: `Glyph Diag ${Date.now()}`, projectId, activeLayer: 'logical' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

async function createEntity(
  page: Page,
  token: string,
  modelId: string,
  name: string,
): Promise<string> {
  const res = await page.request.post(`${API}/api/model-studio/models/${modelId}/entities`, {
    headers: authHeaders(token),
    data: { name, layer: 'logical' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

async function createAttr(
  page: Page,
  token: string,
  modelId: string,
  entityId: string,
  body: Record<string, unknown>,
) {
  const res = await page.request.post(
    `${API}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
    { headers: authHeaders(token), data: body },
  );
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

async function saveCanvas(
  page: Page,
  token: string,
  modelId: string,
  positions: Record<string, { x: number; y: number }>,
) {
  const res = await page.request.put(`${API}/api/model-studio/models/${modelId}/canvas-state`, {
    headers: authHeaders(token),
    data: { layer: 'logical', nodePositions: positions, viewport: { x: 0, y: 0, zoom: 1 } },
  });
  expect(res.ok(), `saveCanvas ${res.status()}: ${await res.text()}`).toBe(true);
}

async function createRel(
  page: Page,
  token: string,
  modelId: string,
  sourceEntityId: string,
  targetEntityId: string,
): Promise<string> {
  const res = await page.request.post(`${API}/api/model-studio/models/${modelId}/relationships`, {
    headers: authHeaders(token),
    data: {
      sourceEntityId,
      targetEntityId,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      isIdentifying: false,
      layer: 'logical',
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

async function deleteModel(page: Page, token: string, modelId: string) {
  await page.request
    .delete(`${API}/api/model-studio/models/${modelId}`, { headers: authHeaders(token) })
    .catch(() => undefined);
}

test('glyph-diagnose: capture stuck-glyph after waypoint drag', async ({ page, request }) => {
  test.setTimeout(60_000);
  const token = await refreshToken(request);
  await page.addInitScript((t) => {
    (window as unknown as { __E2E_ACCESS_TOKEN__?: string }).__E2E_ACCESS_TOKEN__ = t;
  }, token);

  const projectId = await firstProjectId(page, token);
  const modelId = await createModel(page, token, projectId);
  const aId = await createEntity(page, token, modelId, 'entity_a');
  const bId = await createEntity(page, token, modelId, 'entity_b');
  await saveCanvas(page, token, modelId, {
    [aId]: { x: 100, y: 200 },
    [bId]: { x: 600, y: 200 },
  });
  await createAttr(page, token, modelId, aId, {
    name: 'a_id',
    dataType: 'uuid',
    isPrimaryKey: true,
  });
  const relId = await createRel(page, token, modelId, aId, bId);

  await page.goto(`/model-studio/${modelId}?layer=logical`);
  await page.waitForSelector(`[data-testid="rel-interaction-${relId}"]`, {
    state: 'attached',
    timeout: 15_000,
  });
  await page.waitForTimeout(500);

  async function snapshot(label: string) {
    const data = await page.evaluate((id) => {
      const q = (sel: string) => document.querySelector(sel);
      const src = q(`[data-testid="rel-glyph-source-${id}"]`) as SVGGElement | null;
      const tgt = q(`[data-testid="rel-glyph-target-${id}"]`) as SVGGElement | null;
      const ipath = q(`[data-testid="rel-interaction-${id}"]`) as SVGPathElement | null;
      const rfEdge = q(`[data-id="${id}"]`) as SVGGElement | null;
      return {
        srcTransform: src?.getAttribute('transform') ?? null,
        tgtTransform: tgt?.getAttribute('transform') ?? null,
        srcBB: src ? src.getBoundingClientRect().toJSON() : null,
        tgtBB: tgt ? tgt.getBoundingClientRect().toJSON() : null,
        edgePathD: ipath?.getAttribute('d') ?? null,
        // React Flow stamps source/target handle ids on the wrapper
        rfEdgeAttrs: rfEdge
          ? {
              sourceHandle: rfEdge.getAttribute('data-source-handle'),
              targetHandle: rfEdge.getAttribute('data-target-handle'),
            }
          : null,
      };
    }, relId);
    console.log(`\n==== ${label} ====`);
    console.log(JSON.stringify(data, null, 2));
  }

  await snapshot('BEFORE_WAYPOINT');
  await page.screenshot({ path: 'tests/e2e/.screens/glyph-before.png', fullPage: true });

  // Find the midpoint of the interaction path and drag it DOWN by 200px
  // Dispatch pointer events directly on the invisible interaction path.
  // page.mouse.* goes through HitTest which can miss the stroke.
  // Start on the 2/3 mark (between entities, closer to target) so the
  // resulting waypoint lands in the natural corridor between the two
  // cards — not behind the source.
  await page.evaluate((id) => {
    const el = document.querySelector(
      `[data-testid="rel-interaction-${id}"]`,
    ) as SVGPathElement | null;
    if (!el) throw new Error('no interaction path');
    const r = el.getBoundingClientRect();
    const startX = r.x + r.width * 0.5;
    const startY = r.y + r.height / 2;
    const fire = (type: string, x: number, y: number) => {
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        }),
      );
    };
    fire('pointerdown', startX, startY);
    // Move down in 10 steps of 25px each so total travel is 250px
    for (let i = 1; i <= 10; i += 1) {
      fire('pointermove', startX, startY + i * 25);
    }
    fire('pointerup', startX, startY + 250);
  }, relId);
  await page.waitForTimeout(700);

  await snapshot('AFTER_WAYPOINT');
  await page.screenshot({ path: 'tests/e2e/.screens/glyph-after.png', fullPage: true });

  await deleteModel(page, token, modelId);
});
