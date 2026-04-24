/**
 * Step 5 — Model Studio attribute routes + synthetic data (D9) integration.
 *
 * Maps to test-plan-model-studio.md cases:
 *   S5-I1  POST /attributes happy path                                 → 201
 *   S5-I2  Duplicate attribute name within entity                      → 409
 *   S5-I3  generateSyntheticData happy (service, mocked completer)     → 10 rows
 *   S5-I4  Synthetic data marker `synthetic: true` in response         → shape asserted
 *   S5-U2  Reorder service re-computes ordinals densely (1,2,3)        → positions verified
 *   S5-U3  (revised) PK + FK coexist on the same column (subtype / 1:1 / composite patterns)
 *   S5-U3b (new)     PK=true silently forces isNullable=false + isUnique=true
 *   S5-U3c (new)     PATCH isNullable=true on a PK attribute silently coerces back to false
 *   S5-U4  Synthetic data returns exactly N rows matching attrs        → shape verified
 *   S5-U5  Synthetic data refusal → AIRefusalError, no rows returned   → error asserted
 *
 * Runtime requirements match Step 4:
 *   - Server running on TEST_API_URL (default http://localhost:3006)
 *   - `pnpm -C packages/server db:seed-e2e` run at least once
 *   - Feature flag enable_model_studio = true
 *
 * The HTTP cases hit the live server; synthetic-data cases inject a
 * mock completer to avoid charging real tokens on every run. The
 * synthetic-data prompt is upserted in beforeAll so the service can
 * always fetch it by slug.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  dataModelAttributes,
  dataModelEmbeddingJobs,
  organisationMembers,
  organisations,
  projects,
  systemPrompts,
} from '../../db/schema.js';
import { AIRefusalError, ValidationError } from '../../utils/errors.js';
import * as attributeService from '../../services/model-studio-attribute.service.js';
import * as entityService from '../../services/model-studio-entity.service.js';
import { ProviderType } from '@cc/shared';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3006';
const E2E_EMAIL = 'e2e-test@test.com';
const E2E_PASSWORD = 'e2e-test-password-123';

const SYNTHETIC_DATA_SLUG = 'model-studio-synthetic-data';
const MIN_SYNTHETIC_PROMPT_BODY =
  'Return a JSON array of the requested number of row objects, one key per attribute.';

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
let entityId: string;
const createdEntityIds: string[] = [];

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });
  if (!res.ok) throw new Error(`E2E login failed: ${res.status}`);
  const body = (await res.json()) as ApiResponse<{ accessToken: string; user: { id: string } }>;
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function ensureSyntheticPrompt() {
  const [existing] = await db
    .select({ id: systemPrompts.id })
    .from(systemPrompts)
    .where(eq(systemPrompts.slug, SYNTHETIC_DATA_SLUG))
    .limit(1);
  if (existing) return;
  await db.insert(systemPrompts).values({
    slug: SYNTHETIC_DATA_SLUG,
    name: 'Model Studio — Synthetic data generator (D9)',
    description: 'Test seed (integration suite fallback).',
    body: MIN_SYNTHETIC_PROMPT_BODY,
    category: 'model-studio',
    isActive: true,
  });
}

beforeAll(async () => {
  const session = await login();
  accessToken = session.accessToken;
  userId = session.userId;

  await ensureSyntheticPrompt();

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
      name: `Step5 Integration ${Date.now()}`,
      projectId,
      activeLayer: 'logical',
    }),
  });
  if (created.status !== 201) {
    throw new Error(`Test model create failed: ${created.status} ${await created.text()}`);
  }
  const body = (await created.json()) as ApiResponse<{ id: string }>;
  modelId = body.data.id;

  // A shared parent entity for most attribute cases. Each test that
  // mutates attributes in place uses a fresh entity; this one is for
  // the plain HTTP create + list cases.
  const madeEntity = await entityService.createEntity(userId, modelId, {
    name: 'customer',
    layer: 'logical',
  });
  entityId = madeEntity.id;
  createdEntityIds.push(entityId);
});

afterAll(async () => {
  // Cascade-delete entities in parallel so ~20 test artifacts don't blow
  // past the default hook timeout.
  await Promise.allSettled(
    createdEntityIds.map((id) =>
      fetch(`${BASE_URL}/api/model-studio/models/${modelId}/entities/${id}?confirm=cascade`, {
        method: 'DELETE',
        headers: authHeader(accessToken),
      }),
    ),
  );
  if (modelId) {
    await fetch(`${BASE_URL}/api/model-studio/models/${modelId}`, {
      method: 'DELETE',
      headers: authHeader(accessToken),
    }).catch(() => {});
  }
}, 60_000);

describe('Model Studio — attributes (Step 5)', () => {
  // ----------------------------------------------------------
  // S5-I1
  // ----------------------------------------------------------
  it('S5-I1: POST /attributes happy path returns 201 + lint array', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({
          name: 'customer_id',
          dataType: 'uuid',
          isPrimaryKey: true,
        }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<{
      id: string;
      name: string;
      ordinalPosition: number;
      isPrimaryKey: boolean;
      lint: unknown[];
    }>;
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('customer_id');
    expect(body.data.isPrimaryKey).toBe(true);
    expect(body.data.ordinalPosition).toBe(1);
    expect(Array.isArray(body.data.lint)).toBe(true);
  });

  // ----------------------------------------------------------
  // S5-I2
  // ----------------------------------------------------------
  it('S5-I2: duplicate attribute name within entity → 409', async () => {
    // The customer_id row already exists from S5-I1.
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ name: 'customer_id', dataType: 'uuid' }),
      },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(body.error).toMatch(/already exists/i);
  });

  it('unauthenticated POST /attributes → 401', async () => {
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      },
    );
    expect(res.status).toBe(401);
  });

  it('POST /attributes on a non-existent entity → 404', async () => {
    const ghost = '00000000-0000-0000-0000-0000000000aa';
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${ghost}/attributes`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ name: 'x' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('GET /attributes lists rows in ordinal order', async () => {
    // Add two more so we have 3 total on the shared entity.
    await attributeService.createAttribute(userId, modelId, entityId, {
      name: 'email',
      dataType: 'varchar',
      length: 255,
    });
    await attributeService.createAttribute(userId, modelId, entityId, {
      name: 'created_at',
      dataType: 'timestamp',
    });
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${entityId}/attributes`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      attributes: Array<{ id: string; name: string; ordinalPosition: number }>;
      total: number;
    }>;
    expect(body.data.total).toBeGreaterThanOrEqual(3);
    const positions = body.data.attributes.map((a) => a.ordinalPosition);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  // ----------------------------------------------------------
  // S5-U2 — reorder service densely rewrites ordinal_position
  // ----------------------------------------------------------
  it('S5-U2: reorder rewrites ordinal_position to dense 1..N (service level)', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'reorder_target',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);

    const a = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'alpha' });
    const b = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'beta' });
    const c = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'gamma' });

    // Reverse order: gamma, beta, alpha.
    const reordered = await attributeService.reorderAttributes(userId, modelId, fresh.id, [
      c.id,
      b.id,
      a.id,
    ]);
    expect(reordered.map((r) => r.name)).toEqual(['gamma', 'beta', 'alpha']);
    expect(reordered.map((r) => r.ordinalPosition)).toEqual([1, 2, 3]);

    // Confirm in the DB directly.
    const dbRows = await db
      .select({ name: dataModelAttributes.name, pos: dataModelAttributes.ordinalPosition })
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.entityId, fresh.id))
      .orderBy(asc(dataModelAttributes.ordinalPosition));
    expect(dbRows).toEqual([
      { name: 'gamma', pos: 1 },
      { name: 'beta', pos: 2 },
      { name: 'alpha', pos: 3 },
    ]);
  });

  it('reorder rejects a partial list (must include every attribute)', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'reorder_partial',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const a = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'one' });
    await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'two' });
    await expect(
      attributeService.reorderAttributes(userId, modelId, fresh.id, [a.id]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reorder via HTTP POST /reorder returns the new dense order', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'reorder_http',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const a = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'x' });
    const b = await attributeService.createAttribute(userId, modelId, fresh.id, { name: 'y' });
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${fresh.id}/attributes/reorder`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({ ids: [b.id, a.id] }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      attributes: Array<{ name: string; ordinalPosition: number }>;
    }>;
    expect(body.data.attributes.map((r) => r.name)).toEqual(['y', 'x']);
    expect(body.data.attributes.map((r) => r.ordinalPosition)).toEqual([1, 2]);
  });

  // ----------------------------------------------------------
  // S5-U3 (revised) — PK + FK coexistence. Subtype / 1:1 / composite-
  // identifying-FK patterns all require both flags on the same column.
  // ----------------------------------------------------------
  it('S5-U3: PK + FK coexist on the same column via create', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'pk_fk_subtype',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'tenant_id',
      isPrimaryKey: true,
      isForeignKey: true,
    });
    expect(attr.isPrimaryKey).toBe(true);
    expect(attr.isForeignKey).toBe(true);
  });

  it('S5-U3: setting PK=true on an existing FK row keeps FK on (no more cascade-clear)', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'fk_then_pk',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'org_id',
      isForeignKey: true,
    });
    const updated = await attributeService.updateAttribute(userId, modelId, fresh.id, attr.id, {
      isPrimaryKey: true,
    });
    expect(updated.isPrimaryKey).toBe(true);
    expect(updated.isForeignKey).toBe(true);
  });

  // ----------------------------------------------------------
  // S5-U3b — PK silently forces NN + UQ via create
  // ----------------------------------------------------------
  it('S5-U3b: PK=true silently forces isNullable=false + isUnique=true at create', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'pk_implies_nn_uq',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    // Client explicitly passes the contradictory combo; server coerces.
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'id',
      isPrimaryKey: true,
      isNullable: true,
      isUnique: false,
    });
    expect(attr.isPrimaryKey).toBe(true);
    expect(attr.isNullable).toBe(false);
    expect(attr.isUnique).toBe(true);
  });

  // ----------------------------------------------------------
  // S5-U3c — PATCH attempting to break PK invariant silently coerces.
  // ----------------------------------------------------------
  it('S5-U3c: PATCH isNullable=true on a PK attribute silently coerces back to false', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'pk_patch_nn',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'customer_id',
      isPrimaryKey: true,
    });
    const updated = await attributeService.updateAttribute(userId, modelId, fresh.id, attr.id, {
      isNullable: true,
    });
    expect(updated.isPrimaryKey).toBe(true);
    expect(updated.isNullable).toBe(false); // coerced
    expect(updated.isUnique).toBe(true); // coerced
  });

  it('clearing PK keeps NN/UQ sticky at their PK-era values', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'pk_sticky',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'order_id',
      isPrimaryKey: true,
    });
    // PK was on → NN=true + UQ=true. Now clear PK.
    const updated = await attributeService.updateAttribute(userId, modelId, fresh.id, attr.id, {
      isPrimaryKey: false,
    });
    expect(updated.isPrimaryKey).toBe(false);
    expect(updated.isNullable).toBe(false); // sticky
    expect(updated.isUnique).toBe(true); // sticky
  });

  // ----------------------------------------------------------
  // S5-I3 + S5-I4 + S5-U4 — synthetic data happy (service + mocked completer)
  // ----------------------------------------------------------
  it('S5-I3 + S5-I4 + S5-U4: synthetic data returns exactly count rows + synthetic:true marker', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'invoice',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'id',
      dataType: 'uuid',
      isPrimaryKey: true,
    });
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'amount',
      dataType: 'numeric',
      precision: 10,
      scale: 2,
    });

    const fakeRows = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      amount: (i + 1) * 1.25,
    }));
    const result = await attributeService.generateSyntheticData(
      userId,
      modelId,
      fresh.id,
      { count: 10 },
      {
        completer: async () => ({
          id: 'mock-synth',
          content: JSON.stringify(fakeRows),
          model: 'mock',
          provider: ProviderType.OPENROUTER,
          usage: { inputTokens: 100, outputTokens: 200 },
          finishReason: 'stop',
        }),
      },
    );
    expect(result.synthetic).toBe(true);
    expect(result.rows).toHaveLength(10);
    expect(result.attributeNames).toEqual(['id', 'amount']);
    expect(result.entityName).toBe('invoice');
    expect(typeof result.modelUsed).toBe('string');
  });

  it('synthetic data strips markdown code fences before parse', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'fenced',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'code',
      dataType: 'varchar',
      length: 10,
    });

    const rows = Array.from({ length: 3 }, (_, i) => ({ code: `A-${i}` }));
    const result = await attributeService.generateSyntheticData(
      userId,
      modelId,
      fresh.id,
      { count: 3 },
      {
        completer: async () => ({
          id: 'mock-fenced',
          content: '```json\n' + JSON.stringify(rows) + '\n```',
          model: 'mock',
          provider: ProviderType.OPENROUTER,
          usage: { inputTokens: 10, outputTokens: 10 },
          finishReason: 'stop',
        }),
      },
    );
    expect(result.rows).toHaveLength(3);
  });

  // ----------------------------------------------------------
  // S5-U5 — refusal
  // ----------------------------------------------------------
  it('S5-U5: Claude refusal → AIRefusalError, no rows returned', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'refused',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'name',
      dataType: 'varchar',
      length: 64,
    });
    await expect(
      attributeService.generateSyntheticData(
        userId,
        modelId,
        fresh.id,
        { count: 5 },
        {
          completer: async () => ({
            id: 'mock-refuse',
            content: 'I cannot generate synthetic data for this entity.',
            model: 'mock',
            provider: ProviderType.OPENROUTER,
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: 'stop',
          }),
        },
      ),
    ).rejects.toBeInstanceOf(AIRefusalError);
  });

  it('synthetic data rejects an entity with zero attributes', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'empty_shell',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    await expect(
      attributeService.generateSyntheticData(userId, modelId, fresh.id, { count: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // ----------------------------------------------------------
  // Delete + cascade
  // ----------------------------------------------------------
  it('delete attribute with no dependents → 200 and row gone', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'delete_target',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'flag',
      dataType: 'boolean',
    });

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${fresh.id}/attributes/${attr.id}`,
      { method: 'DELETE', headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);

    const [stillThere] = await db
      .select({ id: dataModelAttributes.id })
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.id, attr.id));
    expect(stillThere).toBeUndefined();
  });

  it('create attribute enqueues an embedding job', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'embed_test',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'description',
      dataType: 'text',
    });
    const jobs = await db
      .select()
      .from(dataModelEmbeddingJobs)
      .where(eq(dataModelEmbeddingJobs.objectId, attr.id));
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].objectType).toBe('attribute');
  });

  // ----------------------------------------------------------
  // Step-5 follow-up: model-wide batch endpoint.
  // Canvas preload reads this instead of per-entity lazy load.
  // ----------------------------------------------------------

  it('GET /models/:id/attributes returns attributes grouped by entity (lint=false default)', async () => {
    // Seed a dedicated entity so the test is deterministic regardless
    // of what other cases have left behind on the shared model.
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'batch_target',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'id',
      dataType: 'uuid',
      isPrimaryKey: true,
    });
    await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'label',
      dataType: 'varchar',
      length: 100,
    });

    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attributes`, {
      headers: authHeader(accessToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      attributesByEntity: Record<string, Array<{ name: string; lint: unknown[] }>>;
      total: number;
    }>;
    expect(body.success).toBe(true);
    expect(body.data.attributesByEntity[fresh.id]).toBeDefined();
    expect(body.data.attributesByEntity[fresh.id]).toHaveLength(2);
    // Lint is empty by default (withLint omitted).
    expect(body.data.attributesByEntity[fresh.id][0].lint).toEqual([]);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /models/:id/attributes?lint=true includes lint results', async () => {
    // Physical entity with a non-snake name triggers a guaranteed
    // lint violation so the assertion below doesn't depend on random
    // other data.
    const physical = await entityService.createEntity(userId, modelId, {
      name: 'batch_phys',
      layer: 'physical',
    });
    createdEntityIds.push(physical.id);
    // Use an attribute name that will produce a lint warning on
    // physical (_id suffix + non-uuid type).
    await attributeService.createAttribute(userId, modelId, physical.id, {
      name: 'customer_id',
      dataType: 'varchar',
      length: 36,
    });

    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attributes?lint=true`, {
      headers: authHeader(accessToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      attributesByEntity: Record<string, Array<{ name: string; lint: Array<{ rule: string }> }>>;
    }>;
    const rows = body.data.attributesByEntity[physical.id];
    expect(rows).toHaveLength(1);
    expect(rows[0].lint.some((r) => r.rule === 'id_suffix_should_be_uuid')).toBe(true);
  });

  it('GET /models/:id/attributes rejects strangers → 404', async () => {
    const stranger = `stranger-batch-${Date.now()}@test.com`;
    const reg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stranger, password: 'stranger-pass-123', name: 'Stranger' }),
    });
    if (reg.status !== 201 && reg.status !== 200) {
      console.warn('Register gated — skipping stranger case');
      return;
    }
    const regBody = (await reg.json()) as ApiResponse<{ accessToken: string }>;
    const strangerToken = regBody.data?.accessToken;
    if (!strangerToken) return;
    const res = await fetch(`${BASE_URL}/api/model-studio/models/${modelId}/attributes`, {
      headers: authHeader(strangerToken),
    });
    expect(res.status).toBe(404);
  });

  // ----------------------------------------------------------
  // Step-5 follow-up: attribute history endpoint.
  // Feeds the Erwin-style History tab.
  // ----------------------------------------------------------

  it('GET attribute history returns at least the create + update events', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'history_target',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'status',
      dataType: 'varchar',
      length: 30,
    });
    await attributeService.updateAttribute(userId, modelId, fresh.id, attr.id, {
      dataType: 'text',
    });

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${fresh.id}/attributes/${attr.id}/history`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      events: Array<{ action: string; createdAt: string }>;
    }>;
    expect(body.data.events.length).toBeGreaterThanOrEqual(2);
    const actions = body.data.events.map((e) => e.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    // Descending order — most recent first.
    const times = body.data.events.map((e) => new Date(e.createdAt).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it('GET attribute history on a fresh attribute returns exactly one (create) event', async () => {
    const fresh = await entityService.createEntity(userId, modelId, {
      name: 'history_fresh',
      layer: 'logical',
    });
    createdEntityIds.push(fresh.id);
    const attr = await attributeService.createAttribute(userId, modelId, fresh.id, {
      name: 'created_at',
      dataType: 'timestamp',
    });
    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${fresh.id}/attributes/${attr.id}/history`,
      { headers: authHeader(accessToken) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      events: Array<{ action: string }>;
    }>;
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].action).toBe('create');
  });

  // ================================================================
  // Step 6 Direction A — altKeyGroup (BK / alt-key group) cases.
  // ================================================================

  it('S6-DA-I1: POST /attributes with altKeyGroup=AK1 → 201, normaliser forces NN + UQ', async () => {
    // Fresh entity so we know the attribute is the first on the
    // entity and won't collide with any suite-scoped attribute.
    const ent = await entityService.createEntity(userId, modelId, {
      name: 'bk_target_1',
      layer: 'logical',
    });
    createdEntityIds.push(ent.id);

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${ent.id}/attributes`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({
          name: 'email',
          dataType: 'varchar',
          length: 255,
          isNullable: true, // <- explicitly TRUE; normaliser must coerce to false
          isUnique: false, // <- explicitly FALSE; normaliser must coerce to true
          altKeyGroup: 'AK1',
        }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiResponse<{
      id: string;
      altKeyGroup: string | null;
      isNullable: boolean;
      isUnique: boolean;
    }>;
    expect(body.success).toBe(true);
    expect(body.data.altKeyGroup).toBe('AK1');
    // BK invariant: NN + UQ coerced.
    expect(body.data.isNullable).toBe(false);
    expect(body.data.isUnique).toBe(true);
  });

  it('S6-DA-I2: PATCH existing attribute to set altKeyGroup=AK2 → 200', async () => {
    const ent = await entityService.createEntity(userId, modelId, {
      name: 'bk_target_2',
      layer: 'logical',
    });
    createdEntityIds.push(ent.id);
    const created = await attributeService.createAttribute(userId, modelId, ent.id, {
      name: 'external_ref',
      dataType: 'varchar',
      length: 64,
    });

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${ent.id}/attributes/${created.id}`,
      {
        method: 'PATCH',
        headers: authHeader(accessToken),
        body: JSON.stringify({ altKeyGroup: 'AK2' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      altKeyGroup: string | null;
      isNullable: boolean;
      isUnique: boolean;
    }>;
    expect(body.data.altKeyGroup).toBe('AK2');
    expect(body.data.isNullable).toBe(false);
    expect(body.data.isUnique).toBe(true);
  });

  it('S6-DA-I3: POST /attributes with altKeyGroup="bad!" → 400/422 ValidationError', async () => {
    const ent = await entityService.createEntity(userId, modelId, {
      name: 'bk_target_3',
      layer: 'logical',
    });
    createdEntityIds.push(ent.id);

    const res = await fetch(
      `${BASE_URL}/api/model-studio/models/${modelId}/entities/${ent.id}/attributes`,
      {
        method: 'POST',
        headers: authHeader(accessToken),
        body: JSON.stringify({
          name: 'bad_ak',
          dataType: 'varchar',
          length: 32,
          altKeyGroup: 'bad!',
        }),
      },
    );
    // Zod raises a 400 via the app's validation middleware; the test
    // plan rounds to 422 for consistency with REST conventions, so
    // both are acceptable here.
    expect([400, 422]).toContain(res.status);
    const body = (await res.json()) as ApiResponse<unknown>;
    expect(JSON.stringify(body.details ?? body.error ?? {})).toMatch(/altKeyGroup|AK/i);
  });
});
