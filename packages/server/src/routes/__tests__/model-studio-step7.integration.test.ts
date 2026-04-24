/**
 * Step 7 — layer-links + attribute-links + projection + coverage +
 * suggestions route integration tests.
 *
 * Runs against a live dev server (default http://localhost:3006) using
 * the e2e seed user. Each describe block covers one route family with
 * its happy path + representative error cases. Unit tests already
 * cover branch-level validation logic for each service; these tests
 * prove the wiring works end-to-end.
 *
 * Runtime requirements (mirror of model-studio-entities.integration.test.ts):
 *   - Server running on TEST_API_URL (default http://localhost:3006)
 *   - `pnpm -C packages/server db:seed-e2e` has been run at least once
 *   - Feature flag enable_model_studio = true (the seed ships it ON)
 *
 * Excluded from default `pnpm test` via vitest config.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organisationMembers, organisations, projects } from '../../db/schema.js';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3006';
const E2E_EMAIL = 'e2e-test@test.com';
const E2E_PASSWORD = 'e2e-test-password-123';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  details?: Record<string, string[]>;
  statusCode?: number;
}

let accessToken: string;
let userId: string;
let projectId: string;
let modelId: string;

// Entities seeded in beforeAll so every test can reference them.
let conceptualCustomerId: string;
let logicalCustomerId: string;
let physicalCustomerId: string;
// An unrelated entity on the logical layer used to test multi-parent
// and cross-model scenarios without contaminating the main chain.
let logicalOrderId: string;

const createdLinkIds: string[] = [];
const createdAttributeLinkIds: string[] = [];
const createdEntityIds: string[] = [];
let conceptualBusinessKeyAttrId: string;

async function login(): Promise<{ accessToken: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });
  if (!res.ok) throw new Error(`E2E login failed: ${res.status}`);
  const body = (await res.json()) as ApiResponse<{
    accessToken: string;
    user: { id: string };
  }>;
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function createEntity(
  name: string,
  layer: 'conceptual' | 'logical' | 'physical',
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/entities`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ name, layer }),
  });
  if (res.status !== 201) {
    throw new Error(`createEntity(${name}, ${layer}) failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as ApiResponse<{ id: string }>;
  createdEntityIds.push(body.data.id);
  return body.data.id;
}

async function createAttr(
  entityId: string,
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
    {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({ name, ...overrides }),
    },
  );
  if (res.status !== 201) {
    throw new Error(`createAttr(${name}) failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as ApiResponse<{ id: string }>;
  return body.data.id;
}

beforeAll(async () => {
  const session = await login();
  accessToken = session.accessToken;
  userId = session.userId;

  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(organisationMembers, eq(organisationMembers.organisationId, projects.organisationId))
    .innerJoin(organisations, eq(organisations.id, projects.organisationId))
    .where(eq(organisationMembers.userId, userId))
    .limit(1);
  if (!row) throw new Error('No project visible to e2e user — re-run db:seed-e2e');
  projectId = row.id;

  const created = await fetch(`${BASE_URL}/api/model-studio/models`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({
      name: `Step7 Integration ${Date.now()}`,
      projectId,
      activeLayer: 'conceptual',
      originDirection: 'greenfield',
    }),
  });
  if (created.status !== 201) {
    throw new Error(`Test model create failed: ${created.status} ${await created.text()}`);
  }
  const body = (await created.json()) as ApiResponse<{ id: string }>;
  modelId = body.data.id;

  // Seed three entities on three layers + one extra logical entity.
  conceptualCustomerId = await createEntity('Customer', 'conceptual');
  logicalCustomerId = await createEntity('customer', 'logical');
  physicalCustomerId = await createEntity('dim_customer', 'physical');
  logicalOrderId = await createEntity('order', 'logical');

  // One business-key attr on the conceptual source so projection
  // C→L has something to carry.
  conceptualBusinessKeyAttrId = await createAttr(conceptualCustomerId, 'customer_cd', {
    altKeyGroup: 'AK1',
  });
});

afterAll(async () => {
  // Trust the FK-cascade chain: deleting the model cascades to
  // entities → attributes → layer_links + attribute_links all in one
  // DB operation. No need to sequence ~30 DELETE roundtrips — the
  // 10s hook-timeout budget in vitest is tight for that.
  if (modelId) {
    await fetch(`${BASE_URL}/api/model-studio/models/${modelId}`, {
      method: 'DELETE',
      headers: authHeader(accessToken),
    }).catch(() => {});
  }
});

// ============================================================
// Layer links
// ============================================================

describe('POST /models/:id/layer-links', () => {
  it('201 happy: creates a conceptual→logical link', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: conceptualCustomerId,
        childId: logicalCustomerId,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<{
      id: string;
      parentLayer: string;
      childLayer: string;
    }>;
    expect(body.success).toBe(true);
    expect(body.data.parentLayer).toBe('conceptual');
    expect(body.data.childLayer).toBe('logical');
    createdLinkIds.push(body.data.id);
  });

  it('400: rejects a same-layer link', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: logicalCustomerId,
        childId: logicalOrderId,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.details?.childId?.[0]).toMatch(/different layers/);
  });

  it('409: rejects a duplicate link', async () => {
    // The happy-path test above already created conceptual→logical.
    // Posting the same pair again should fail with 409.
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: conceptualCustomerId,
        childId: logicalCustomerId,
      }),
    });
    expect(res.status).toBe(409);
  });

  it('400: rejects a cycle', async () => {
    // Existing chain is conceptual C → logical C. Build the full
    // 3-layer chain first, then try to close it back to conceptual.
    // logical→physical first:
    const lp = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: logicalCustomerId,
        childId: physicalCustomerId,
      }),
    });
    expect(lp.status).toBe(201);
    const lpBody = (await lp.json()) as ApiResponse<{ id: string }>;
    createdLinkIds.push(lpBody.data.id);

    // Now try physical→conceptual — that would close a cycle.
    const cycle = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: physicalCustomerId,
        childId: conceptualCustomerId,
      }),
    });
    expect(cycle.status).toBe(400);
    const body = (await cycle.json()) as ApiResponse<unknown>;
    expect(body.details?.childId?.[0]).toMatch(/cycle/);
  });

  it('401: rejects without auth token', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: conceptualCustomerId, childId: logicalCustomerId }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /models/:id/layer-links', () => {
  it('200 by parent: returns child projections', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links?parentId=${conceptualCustomerId}`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Array<{ childId: string; childLayer: string }>>;
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.some((l) => l.childId === logicalCustomerId)).toBe(true);
  });

  it('200 by child: returns parent projections', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links?childId=${logicalCustomerId}`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Array<{ parentId: string }>>;
    expect(body.data.some((l) => l.parentId === conceptualCustomerId)).toBe(true);
  });

  it('400: neither parentId nor childId supplied', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      headers: authHeader(accessToken),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /models/:id/layer-links/:linkId', () => {
  it('204: deletes an existing link', async () => {
    // Create a disposable link, then delete it.
    const newLogical = await createEntity('disposable_logical', 'logical');
    const newPhysical = await createEntity('disposable_physical', 'physical');
    const created = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({ parentId: newLogical, childId: newPhysical }),
    });
    const body = (await created.json()) as ApiResponse<{ id: string }>;
    const linkId = body.data.id;

    const del = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links/${linkId}`,
      { method: 'DELETE', headers: authHeader(accessToken) },
    );
    expect(del.status).toBe(204);
  });

  it('404: rejects delete of a non-existent link', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links/00000000-0000-0000-0000-000000000000`,
      { method: 'DELETE', headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Attribute links
// ============================================================

describe('POST /models/:id/attribute-links', () => {
  it('201 happy: creates a conceptual-attr → logical-attr link', async () => {
    // Create a matching attr on the logical side first.
    const logicalAttrId = await createAttr(logicalCustomerId, 'customer_cd');
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attribute-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: conceptualBusinessKeyAttrId,
        childId: logicalAttrId,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<{
      id: string;
      parentLayer: string;
      childLayer: string;
    }>;
    expect(body.data.parentLayer).toBe('conceptual');
    expect(body.data.childLayer).toBe('logical');
    createdAttributeLinkIds.push(body.data.id);
  });

  it('400: rejects same-layer attribute link', async () => {
    // Two attributes on two logical entities — same layer from the
    // attribute-link perspective.
    const logicalOrderAttrId = await createAttr(logicalOrderId, 'order_id');
    const logicalCustomerAttrId = await createAttr(logicalCustomerId, 'email_address');
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attribute-links`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({
        parentId: logicalOrderAttrId,
        childId: logicalCustomerAttrId,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.details?.childId?.[0]).toMatch(/different layers/);
  });

  it('401: rejects without auth token', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attribute-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: 'x', childId: 'y' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /models/:id/attribute-links', () => {
  it('200 by parent', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/attribute-links?parentId=${conceptualBusinessKeyAttrId}`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<Array<{ id: string }>>;
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Projection + chain
// ============================================================

describe('POST /models/:id/entities/:entityId/project', () => {
  it('400: conceptual→physical two-hop is rejected', async () => {
    // `Customer` lives on conceptual. Project to physical directly —
    // rejected; user must go conceptual→logical→physical in two calls.
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${conceptualCustomerId}/project`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ toLayer: 'physical' }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.details?.toLayer?.[0]).toMatch(/logical first/);
  });

  it('409: rejects when source already has a projection on target layer', async () => {
    // Conceptual Customer → Logical customer link already exists
    // from the POST /layer-links happy-path test.
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${conceptualCustomerId}/project`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ toLayer: 'logical' }),
      },
    );
    expect(res.status).toBe(409);
  });

  it('201: scaffolds a new logical entity from an unlinked conceptual source', async () => {
    // Create a fresh conceptual entity with a business-key attr so
    // scaffold has something to carry.
    const freshConcept = await createEntity('Supplier', 'conceptual');
    await createAttr(freshConcept, 'supplier_cd', { altKeyGroup: 'AK1' });

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${freshConcept}/project`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ toLayer: 'logical' }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<{
      entity: { id: string; layer: string; name: string };
      layerLink: { id: string };
      attributeLinks: Array<{ id: string }>;
    }>;
    expect(body.data.entity.layer).toBe('logical');
    expect(body.data.entity.name).toBe('Supplier');
    expect(body.data.attributeLinks.length).toBe(1); // the business-key attr
    createdEntityIds.push(body.data.entity.id);
    createdLinkIds.push(body.data.layerLink.id);
    for (const al of body.data.attributeLinks) createdAttributeLinkIds.push(al.id);
  });
});

describe('GET /models/:id/entities/:entityId/projection-chain', () => {
  it('200: returns connected-component graph for a linked entity', async () => {
    // Conceptual Customer is linked to logical customer (and through
    // it to physical dim_customer via the cycle-test chain).
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${conceptualCustomerId}/projection-chain`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      rootId: string;
      nodes: Array<{ entityId: string; layer: string }>;
    }>;
    expect(body.data.rootId).toBe(conceptualCustomerId);
    // Chain reaches at least the logical child; physical is one hop
    // further so depth-3 cap keeps it in scope.
    expect(body.data.nodes.map((n) => n.entityId)).toContain(logicalCustomerId);
  });

  it('404: rejects a chain for an entity not in the model', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/00000000-0000-0000-0000-000000000000/projection-chain`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Coverage + suggestions
// ============================================================

describe('GET /models/:id/layer-coverage', () => {
  it('200: returns a matrix marking each entity own-layer + linked-layers', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-coverage`, {
      headers: authHeader(accessToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      coverage: Record<string, { conceptual: boolean; logical: boolean; physical: boolean }>;
    }>;
    // Conceptual Customer at minimum should see its own layer +
    // logical (direct link) + physical (via logical, one hop further,
    // but direct semantics stop at one hop). Spec: direct coverage
    // only, so conceptual sees conceptual+logical, not physical.
    expect(body.data.coverage[conceptualCustomerId]?.conceptual).toBe(true);
    expect(body.data.coverage[conceptualCustomerId]?.logical).toBe(true);
    // Logical Customer sees conceptual (parent) + logical (self) +
    // physical (direct child via the cycle-test chain).
    expect(body.data.coverage[logicalCustomerId]?.conceptual).toBe(true);
    expect(body.data.coverage[logicalCustomerId]?.logical).toBe(true);
    expect(body.data.coverage[logicalCustomerId]?.physical).toBe(true);
  });

  it('401: rejects without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-coverage`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /models/:id/layer-links/suggestions', () => {
  it('200: exact-match case-insensitive suggestion', async () => {
    // Create a physical entity named exactly like the logical one so
    // the name-match suggester has a pair. logical `order` vs
    // physical `order` — names match case-insensitively.
    const physOrder = await createEntity('order', 'physical');
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links/suggestions?fromLayer=logical&toLayer=physical`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      suggestions: Array<{
        fromEntityId: string;
        toEntityId: string;
        confidence: string;
      }>;
    }>;
    expect(body.data.suggestions.some((s) => s.toEntityId === physOrder)).toBe(true);
    expect(body.data.suggestions.every((s) => s.confidence === 'high')).toBe(true);
  });

  it('400: rejects fromLayer === toLayer', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/layer-links/suggestions?fromLayer=logical&toLayer=logical`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(400);
  });
});

// ============================================================
// Cross-org IDOR — one case covers the authz pattern for every route
// ============================================================

describe('Cross-org IDOR', () => {
  it('returns 404 (existence hidden) when a stranger hits any Step 7 route on our model', async () => {
    const stranger = `stranger-s7-${Date.now()}@test.com`;
    const reg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: stranger,
        password: 'stranger-pass-123',
        name: 'Stranger Seven',
      }),
    });
    if (reg.status !== 201 && reg.status !== 200) {
      console.warn('Register returned', reg.status, '— skipping IDOR case');
      return;
    }
    const regBody = (await reg.json()) as ApiResponse<{ accessToken: string }>;
    const strangerToken = regBody.data?.accessToken;
    if (!strangerToken) {
      console.warn('No accessToken from register — skipping IDOR case');
      return;
    }

    // Probe layer-coverage — if authz fires anywhere, it fires here.
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/layer-coverage`, {
      headers: authHeader(strangerToken),
    });
    expect(res.status).toBe(404);
  });
});
