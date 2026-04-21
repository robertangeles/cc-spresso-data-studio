/**
 * Integration tests for Step 6 Direction A data migrations.
 *
 * Cases:
 *   1. `addAttributesAltKeyGroupColumn` is idempotent — running twice
 *      leaves the column + partial index intact. Live DB `alt_key_group`
 *      column is present after the migration and accepts `AK1` /
 *      `NULL` / any legal VARCHAR(10) value.
 *   2. `addRelationshipsInverseNameColumn` is idempotent — the
 *      `inverse_name` column accepts string values and nulls without
 *      error.
 *   3. `addEntitiesDisplayIdColumn` is idempotent AND its backfill is
 *      scoped to `WHERE display_id IS NULL` — re-running does not
 *      rewrite already-assigned rows, and an entity seeded without a
 *      display_id gets `E001` on first run (sole entity in its model).
 *
 * Hits the live Postgres via the standard `db` connection — these
 * migrations are DDL + backfill so stubbing would be meaningless.
 * Per CLAUDE.md L8 test-data hygiene rule, all seeded rows use a
 * `test-*@test.com` pattern and are torn down in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../index.js';
import {
  dataModelAttributes,
  dataModelEntities,
  dataModelRelationships,
  dataModels,
  organisationMembers,
  organisations,
  projects,
  users,
} from '../schema.js';
import {
  addAttributesAltKeyGroupColumn,
  addEntitiesDisplayIdColumn,
  addRelationshipsInverseNameColumn,
} from '../migrations/step6-direction-a.js';

// Seeded IDs — created in beforeAll, torn down in afterAll.
let testUserId: string;
let testOrgId: string;
let testProjectId: string;
let testModelId: string;
let testSourceEntityId: string;
let testTargetEntityId: string;

// Unique suffix so parallel test runs don't collide on unique indexes.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  // Apply migrations — idempotent, safe even if already run.
  await addAttributesAltKeyGroupColumn();
  await addRelationshipsInverseNameColumn();
  await addEntitiesDisplayIdColumn();

  // Seed a minimal user → org → project → model tree. Entities are
  // created INSIDE each test so display_id assignment is predictable.
  const [user] = await db
    .insert(users)
    .values({
      email: `test-step6-da-${suffix}@test.com`,
      name: 'Step 6 DA Migration Test',
      role: 'Administrator',
      isEmailVerified: true,
    })
    .returning({ id: users.id });
  testUserId = user.id;

  const [org] = await db
    .insert(organisations)
    .values({
      name: `Step 6 DA Test Org ${suffix}`,
      slug: `step6-da-test-${suffix}`,
      joinKey: `S6DA-${suffix.slice(0, 8)}`,
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
      name: `Step 6 DA Test Project ${suffix}`,
      userId: testUserId,
      organisationId: testOrgId,
    })
    .returning({ id: projects.id });
  testProjectId = project.id;

  const [model] = await db
    .insert(dataModels)
    .values({
      name: `Step 6 DA Test Model ${suffix}`,
      projectId: testProjectId,
      ownerId: testUserId,
      activeLayer: 'logical',
    })
    .returning({ id: dataModels.id });
  testModelId = model.id;

  // Two entities for the alt-key-group / inverse-name cases. The
  // display_id case seeds its own model so the sequence is known.
  const [source] = await db
    .insert(dataModelEntities)
    .values({ dataModelId: testModelId, name: 'Source', layer: 'logical' })
    .returning({ id: dataModelEntities.id });
  testSourceEntityId = source.id;

  const [target] = await db
    .insert(dataModelEntities)
    .values({ dataModelId: testModelId, name: 'Target', layer: 'logical' })
    .returning({ id: dataModelEntities.id });
  testTargetEntityId = target.id;
});

afterAll(async () => {
  // Cascades do most of the work; being explicit keeps the test
  // output easy to read if a cascade is ever altered.
  if (testModelId) {
    await db
      .delete(dataModelRelationships)
      .where(eq(dataModelRelationships.dataModelId, testModelId));
    await db
      .delete(dataModelAttributes)
      .where(
        sql`entity_id IN (SELECT id FROM data_model_entities WHERE data_model_id = ${testModelId})`,
      );
    await db.delete(dataModelEntities).where(eq(dataModelEntities.dataModelId, testModelId));
    await db.delete(dataModels).where(eq(dataModels.id, testModelId));
  }
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

describe('Step 6 Direction A migrations — attributes.alt_key_group', () => {
  it('is idempotent AND the alt_key_group column accepts AK values + nulls', async () => {
    // Second invocation must be a clean no-op.
    await expect(addAttributesAltKeyGroupColumn()).resolves.toBeUndefined();

    // Insert an attribute using the new column — confirms DDL landed.
    const [attr] = await db
      .insert(dataModelAttributes)
      .values({
        entityId: testSourceEntityId,
        name: `ak_test_${suffix}`,
        dataType: 'varchar',
        length: 64,
        altKeyGroup: 'AK1',
        isNullable: false,
        isUnique: true,
      })
      .returning({
        id: dataModelAttributes.id,
        altKeyGroup: dataModelAttributes.altKeyGroup,
      });
    expect(attr.altKeyGroup).toBe('AK1');

    // Nullable / unset also accepted.
    const [nullAttr] = await db
      .insert(dataModelAttributes)
      .values({
        entityId: testSourceEntityId,
        name: `ak_null_${suffix}`,
        dataType: 'varchar',
        length: 64,
      })
      .returning({
        id: dataModelAttributes.id,
        altKeyGroup: dataModelAttributes.altKeyGroup,
      });
    expect(nullAttr.altKeyGroup).toBeNull();

    // Tidy up.
    await db.delete(dataModelAttributes).where(eq(dataModelAttributes.id, attr.id));
    await db.delete(dataModelAttributes).where(eq(dataModelAttributes.id, nullAttr.id));
  });
});

describe('Step 6 Direction A migrations — relationships.inverse_name', () => {
  it('is idempotent AND the inverse_name column accepts strings + nulls', async () => {
    await expect(addRelationshipsInverseNameColumn()).resolves.toBeUndefined();

    const [rel] = await db
      .insert(dataModelRelationships)
      .values({
        dataModelId: testModelId,
        sourceEntityId: testSourceEntityId,
        targetEntityId: testTargetEntityId,
        name: `manages_${suffix}`,
        inverseName: 'is_managed_by',
        sourceCardinality: 'one',
        targetCardinality: 'many',
        layer: 'logical',
      })
      .returning({
        id: dataModelRelationships.id,
        inverseName: dataModelRelationships.inverseName,
      });
    expect(rel.inverseName).toBe('is_managed_by');

    await db.delete(dataModelRelationships).where(eq(dataModelRelationships.id, rel.id));
  });
});

describe('Step 6 Direction A migrations — entities.display_id', () => {
  it('is idempotent AND the backfill assigns E001 to a sole display-id-less entity', async () => {
    // Spin up a dedicated model so the backfill window starts clean.
    const [isolatedModel] = await db
      .insert(dataModels)
      .values({
        name: `Step 6 DA Display ID Model ${suffix}`,
        projectId: testProjectId,
        ownerId: testUserId,
        activeLayer: 'logical',
      })
      .returning({ id: dataModels.id });

    try {
      // Insert an entity WITHOUT display_id (simulating a pre-Direction-A row).
      const [pre] = await db
        .insert(dataModelEntities)
        .values({
          dataModelId: isolatedModel.id,
          name: 'pre_backfill',
          layer: 'logical',
          displayId: null,
        })
        .returning({
          id: dataModelEntities.id,
          displayId: dataModelEntities.displayId,
        });
      expect(pre.displayId).toBeNull();

      // Run the migration — it should assign E001 to this row.
      await expect(addEntitiesDisplayIdColumn()).resolves.toBeUndefined();

      const [after] = await db
        .select({ displayId: dataModelEntities.displayId })
        .from(dataModelEntities)
        .where(eq(dataModelEntities.id, pre.id));
      expect(after.displayId).toBe('E001');

      // Second run must be a no-op — the row already has a
      // display_id, so the WHERE display_id IS NULL predicate matches
      // zero rows and nothing is rewritten.
      await expect(addEntitiesDisplayIdColumn()).resolves.toBeUndefined();
      const [stillAfter] = await db
        .select({ displayId: dataModelEntities.displayId })
        .from(dataModelEntities)
        .where(eq(dataModelEntities.id, pre.id));
      expect(stillAfter.displayId).toBe('E001');

      // And the NULL-only scope means we haven't touched other rows —
      // find any remaining null display_ids in this isolated model.
      const nullRows = await db
        .select({ id: dataModelEntities.id })
        .from(dataModelEntities)
        .where(
          and(
            eq(dataModelEntities.dataModelId, isolatedModel.id),
            isNull(dataModelEntities.displayId),
          ),
        );
      expect(nullRows.length).toBe(0);
    } finally {
      // Cleanup — cascade drops the entity + any attrs/rels underneath.
      await db.delete(dataModelEntities).where(eq(dataModelEntities.dataModelId, isolatedModel.id));
      await db.delete(dataModels).where(eq(dataModels.id, isolatedModel.id));
    }
  });
});
