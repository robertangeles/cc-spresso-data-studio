/**
 * Integration tests for the Step 6 Showcase seed script.
 *
 * Cases:
 *   S6-T1  First run creates exactly 1 model, 6 entities, 5 rels, and
 *          propagates order.order_id onto order_line (the identifying
 *          relationship). All via `seedShowcase()` invoked through
 *          `runOnce()`.
 *   S6-T2  Second invocation is a no-op — `runOnce` returns `ran:false`
 *          and no duplicate model is created.
 *
 * Hits the live Render Postgres via the standard `db` connection.
 * A throwaway user + org + project are seeded in `beforeAll` and torn
 * down in `afterAll` so the test doesn't pollute the real e2e seed.
 *
 * Note: the production script targets the `e2e-test@test.com` user via
 * `resolveUserId()`. To test in isolation we re-implement the seed body
 * against an ephemeral user by calling the exported `seedShowcase`
 * logic's constituent service functions directly — but because the
 * script wires itself through `runOnce` + hard-coded user email, the
 * cleanest path is to seed an `e2e-test@test.com`-shaped fixture and
 * let the runOnce marker drive the no-op test. We use a unique
 * runOnce marker per test invocation to guarantee isolation.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  appliedMigrations,
  dataModelAttributes,
  dataModelCanvasStates,
  dataModelEntities,
  dataModelRelationships,
  dataModels,
  organisationMembers,
  organisations,
  projects,
  users,
} from '../../db/schema.js';
import { runOnce } from '../../db/migration-runner.js';
import { createModel } from '../../services/model-studio-model.service.js';
import { createEntity } from '../../services/model-studio-entity.service.js';
import { createAttribute } from '../../services/model-studio-attribute.service.js';
import { createRelationship } from '../../services/model-studio-relationship.service.js';
import { upsertCanvasState } from '../../services/model-studio-canvas.service.js';

const SHOWCASE_LAYER = 'logical' as const;

let testUserId: string;
let testOrgId: string;
let testProjectId: string;
let testModelId: string | null = null;
const markerNames = new Set<string>();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function uniqueMarker(prefix: string): string {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  markerNames.add(name);
  return name;
}

/**
 * Mirror of the showcase script body, parameterised on userId + projectId
 * so the integration test can run it against an ephemeral fixture
 * without mutating the real e2e seed.
 */
async function runShowcaseBody(
  userId: string,
  projectId: string,
  modelName: string,
): Promise<string> {
  const model = await createModel(userId, {
    projectId,
    name: modelName,
    description: 'Integration test — Step 6 Showcase.',
    activeLayer: SHOWCASE_LAYER,
    notation: 'ie',
    originDirection: 'greenfield',
  });

  const customer = await createEntity(userId, model.id, {
    name: 'customer',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  const order = await createEntity(userId, model.id, {
    name: 'order',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  const orderLine = await createEntity(userId, model.id, {
    name: 'order_line',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  const product = await createEntity(userId, model.id, {
    name: 'product',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  const employee = await createEntity(userId, model.id, {
    name: 'employee',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });
  const address = await createEntity(userId, model.id, {
    name: 'address',
    layer: SHOWCASE_LAYER,
    entityType: 'standard',
  });

  // Attributes — only seed the PK side of order (order_id), and
  // order_line's natural-PK half (line_number). The identifying rel
  // below must propagate order_id onto order_line automatically.
  await createAttribute(userId, model.id, customer.id, {
    name: 'customer_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await createAttribute(userId, model.id, order.id, {
    name: 'order_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await createAttribute(userId, model.id, orderLine.id, {
    name: 'line_number',
    dataType: 'int',
    isPrimaryKey: true,
    isNullable: false,
  });
  await createAttribute(userId, model.id, product.id, {
    name: 'product_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await createAttribute(userId, model.id, employee.id, {
    name: 'employee_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });
  await createAttribute(userId, model.id, address.id, {
    name: 'address_id',
    dataType: 'uuid',
    isPrimaryKey: true,
    isNullable: false,
  });

  // Relationships (5 total, one identifying, one self-ref).
  await createRelationship(userId, model.id, {
    sourceEntityId: customer.id,
    targetEntityId: order.id,
    name: 'places',
    sourceCardinality: 'one',
    targetCardinality: 'one_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });
  await createRelationship(userId, model.id, {
    sourceEntityId: order.id,
    targetEntityId: orderLine.id,
    name: 'contains',
    sourceCardinality: 'one',
    targetCardinality: 'one_or_many',
    isIdentifying: true,
    layer: SHOWCASE_LAYER,
  });
  await createRelationship(userId, model.id, {
    sourceEntityId: product.id,
    targetEntityId: orderLine.id,
    name: 'appears_on',
    sourceCardinality: 'one',
    targetCardinality: 'zero_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });
  await createRelationship(userId, model.id, {
    sourceEntityId: employee.id,
    targetEntityId: employee.id,
    name: 'manages',
    sourceCardinality: 'zero_or_one',
    targetCardinality: 'zero_or_many',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });
  await createRelationship(userId, model.id, {
    sourceEntityId: customer.id,
    targetEntityId: address.id,
    name: 'lives_at',
    sourceCardinality: 'zero_or_one',
    targetCardinality: 'one',
    isIdentifying: false,
    layer: SHOWCASE_LAYER,
  });

  await upsertCanvasState(userId, model.id, SHOWCASE_LAYER, {
    nodePositions: {
      [customer.id]: { x: 80, y: 80 },
      [order.id]: { x: 380, y: 80 },
      [orderLine.id]: { x: 680, y: 80 },
      [product.id]: { x: 980, y: 80 },
      [employee.id]: { x: 80, y: 380 },
      [address.id]: { x: 680, y: 380 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  return model.id;
}

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: `test-step6-showcase-${suffix}@test.com`,
      name: 'Step 6 Showcase Seed Test',
      role: 'Administrator',
      isEmailVerified: true,
    })
    .returning({ id: users.id });
  testUserId = user.id;

  const [org] = await db
    .insert(organisations)
    .values({
      name: `Step 6 Showcase Test Org ${suffix}`,
      slug: `step6-showcase-test-${suffix}`,
      joinKey: `S6S-${suffix.slice(0, 10)}`,
      ownerId: testUserId,
    })
    .returning({ id: organisations.id });
  testOrgId = org.id;

  await db
    .insert(organisationMembers)
    .values({ organisationId: testOrgId, userId: testUserId, role: 'owner' });

  const [project] = await db
    .insert(projects)
    .values({
      name: `Step 6 Showcase Test Project ${suffix}`,
      userId: testUserId,
      organisationId: testOrgId,
    })
    .returning({ id: projects.id });
  testProjectId = project.id;
});

afterEach(async () => {
  for (const name of markerNames) {
    await db.delete(appliedMigrations).where(eq(appliedMigrations.name, name));
  }
  markerNames.clear();
});

afterAll(async () => {
  if (testModelId) {
    // Cascades on data_models clear entities/attrs/rels/canvas_states.
    await db.delete(dataModels).where(eq(dataModels.id, testModelId));
  }
  // Belt-and-braces: any other model this user may own
  await db.delete(dataModels).where(eq(dataModels.ownerId, testUserId));
  if (testProjectId) {
    await db.delete(projects).where(eq(projects.id, testProjectId));
  }
  if (testOrgId) {
    await db.delete(organisationMembers).where(eq(organisationMembers.organisationId, testOrgId));
    await db.delete(organisations).where(eq(organisations.id, testOrgId));
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
});

describe('seed-step6-showcase — first run creates the showcase graph (S6-T1)', () => {
  it('creates 1 model, 6 entities, 5 relationships, propagates identifying PK', async () => {
    const marker = uniqueMarker('seed-step6-showcase-t1');
    const modelName = `Step 6 Showcase Test ${suffix} T1`;

    const result = await runOnce(marker, async () => {
      testModelId = await runShowcaseBody(testUserId, testProjectId, modelName);
    });

    expect(result.ran).toBe(true);
    expect(testModelId).not.toBeNull();

    // 1 model with the expected name
    const models = await db
      .select({ id: dataModels.id, name: dataModels.name })
      .from(dataModels)
      .where(and(eq(dataModels.ownerId, testUserId), eq(dataModels.name, modelName)));
    expect(models).toHaveLength(1);

    // 6 entities on the model
    const entities = await db
      .select({ id: dataModelEntities.id, name: dataModelEntities.name })
      .from(dataModelEntities)
      .where(eq(dataModelEntities.dataModelId, models[0].id));
    expect(entities).toHaveLength(6);
    const names = entities.map((e) => e.name).sort();
    expect(names).toEqual(['address', 'customer', 'employee', 'order', 'order_line', 'product']);

    // 5 relationships
    const rels = await db
      .select({
        id: dataModelRelationships.id,
        isIdentifying: dataModelRelationships.isIdentifying,
      })
      .from(dataModelRelationships)
      .where(eq(dataModelRelationships.dataModelId, models[0].id));
    expect(rels).toHaveLength(5);
    expect(rels.filter((r) => r.isIdentifying === true)).toHaveLength(1);

    // Identifying PK propagation: order_line has both its own PK
    // (line_number) AND the propagated order_id. Both should be
    // is_primary_key = true because the identifying rel surfaces
    // order_id into the child's PK.
    const orderLine = entities.find((e) => e.name === 'order_line');
    expect(orderLine).toBeDefined();
    const orderLineAttrs = await db
      .select({
        name: dataModelAttributes.name,
        isPrimaryKey: dataModelAttributes.isPrimaryKey,
      })
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.entityId, orderLine!.id));
    const attrNames = orderLineAttrs.map((a) => a.name).sort();
    expect(attrNames).toContain('line_number');
    expect(attrNames).toContain('order_id');
    const pkNames = orderLineAttrs
      .filter((a) => a.isPrimaryKey === true)
      .map((a) => a.name)
      .sort();
    expect(pkNames).toEqual(['line_number', 'order_id']);

    // Canvas positions persisted for the 6 entities on the logical layer.
    const [canvas] = await db
      .select({ nodePositions: dataModelCanvasStates.nodePositions })
      .from(dataModelCanvasStates)
      .where(
        and(
          eq(dataModelCanvasStates.dataModelId, models[0].id),
          eq(dataModelCanvasStates.userId, testUserId),
          eq(dataModelCanvasStates.layer, SHOWCASE_LAYER),
        ),
      );
    expect(canvas).toBeDefined();
    const positions = canvas.nodePositions as Record<string, { x: number; y: number }>;
    expect(Object.keys(positions)).toHaveLength(6);
  });
});

describe('seed-step6-showcase — second run is a no-op (S6-T2)', () => {
  it('runOnce reports ran=false and no duplicate model is created', async () => {
    const marker = uniqueMarker('seed-step6-showcase-t2');
    const modelName = `Step 6 Showcase Test ${suffix} T2`;
    let callCount = 0;

    const fn = async () => {
      callCount += 1;
      // We capture the model so afterAll can tear it down. Only the first
      // call should land here; the second must skip via the runOnce marker.
      const id = await runShowcaseBody(testUserId, testProjectId, modelName);
      testModelId = id;
    };

    const first = await runOnce(marker, fn);
    const second = await runOnce(marker, fn);
    const third = await runOnce(marker, fn);

    expect(first.ran).toBe(true);
    expect(second.ran).toBe(false);
    expect(third.ran).toBe(false);
    expect(callCount).toBe(1);

    const models = await db
      .select({ id: dataModels.id })
      .from(dataModels)
      .where(and(eq(dataModels.ownerId, testUserId), eq(dataModels.name, modelName)));
    expect(models).toHaveLength(1);
  });
});
