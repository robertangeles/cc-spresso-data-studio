/**
 * Integration tests for Step 6 data migrations.
 *
 * Cases:
 *   1. `addCanvasStatesNotationColumn` is idempotent — running twice
 *      leaves the column + CHECK constraint intact.
 *   2. Canvas-state insert with no notation defaults to 'ie'; 'idef1x'
 *      succeeds; any other value raises a CHECK-constraint violation.
 *   3. After `addRelationshipsVersionAndIndexes`: duplicate (model, src,
 *      tgt, name=null) raises a UNIQUE violation; different names coexist;
 *      new rows default `version` to 1.
 *
 * Hits the live Render Postgres via the standard `db` connection — these
 * migrations are schema-level so there is no sensible way to stub them.
 * Per CLAUDE.md L8 test-data hygiene rule, the seed user/org/project are
 * created with a `test-*@test.com` pattern and torn down in `afterAll`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { db } from '../index.js';
import {
  dataModelCanvasStates,
  dataModelEntities,
  dataModelRelationships,
  dataModels,
  organisationMembers,
  organisations,
  projects,
  users,
} from '../schema.js';
import {
  addCanvasStatesNotationColumn,
  addRelationshipsVersionAndIndexes,
} from '../migrations/step6-relationships.js';

// Postgres SQLSTATE codes we narrow on — named constants avoid magic strings.
const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';

interface PgErrorLike {
  readonly code?: string;
}

/**
 * Drizzle wraps pg failures in a plain `Error: Failed query: ...` and
 * hangs the original `pg.DatabaseError` on the `.cause` chain. We accept
 * either the bare DatabaseError (direct `pool.query` callers) or a wrapper
 * whose cause is one, and narrow on SQLSTATE.
 */
function extractPgDatabaseError(err: unknown): pg.DatabaseError | null {
  if (err instanceof pg.DatabaseError) return err;
  if (err instanceof Error && err.cause instanceof pg.DatabaseError) return err.cause;
  return null;
}

function isPgErrorWithCode(err: unknown, code: string): boolean {
  const pgErr = extractPgDatabaseError(err);
  if (pgErr === null) return false;
  return (pgErr as PgErrorLike).code === code;
}

// Seeded IDs — created in beforeAll, torn down in afterAll.
let testUserId: string;
let testOrgId: string;
let testProjectId: string;
let testModelId: string;
let testSourceEntityId: string;
let testTargetEntityId: string;

// Unique suffix so parallel test runs don't collide on the name unique index.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  // 1. Ensure both migrations have been applied (drizzle-kit push is
  //    expected to have run before integration tests, but these functions
  //    are idempotent so calling them directly here is safe and covers
  //    the case where a fresh test DB has not been `push`-ed yet).
  await addCanvasStatesNotationColumn();
  await addRelationshipsVersionAndIndexes();

  // 2. Seed a minimal user → org → member → project → model → entities tree.
  const [user] = await db
    .insert(users)
    .values({
      email: `test-step6-${suffix}@test.com`,
      name: 'Step 6 Migration Test',
      role: 'Administrator',
      isEmailVerified: true,
    })
    .returning({ id: users.id });
  testUserId = user.id;

  const [org] = await db
    .insert(organisations)
    .values({
      name: `Step 6 Test Org ${suffix}`,
      slug: `step6-test-${suffix}`,
      joinKey: `S6K-${suffix.slice(0, 10)}`,
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
      name: `Step 6 Test Project ${suffix}`,
      userId: testUserId,
      organisationId: testOrgId,
    })
    .returning({ id: projects.id });
  testProjectId = project.id;

  const [model] = await db
    .insert(dataModels)
    .values({
      name: `Step 6 Test Model ${suffix}`,
      projectId: testProjectId,
      ownerId: testUserId,
      activeLayer: 'logical',
    })
    .returning({ id: dataModels.id });
  testModelId = model.id;

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
  // Tear down in reverse FK order. Cascades on projects/data_models keep
  // this short, but we delete rels and canvas-states explicitly for clarity.
  if (testModelId) {
    await db
      .delete(dataModelRelationships)
      .where(eq(dataModelRelationships.dataModelId, testModelId));
    await db
      .delete(dataModelCanvasStates)
      .where(eq(dataModelCanvasStates.dataModelId, testModelId));
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

describe('Step 6 migrations — canvas states notation column', () => {
  it('addCanvasStatesNotationColumn is idempotent — second invocation is a no-op', async () => {
    // The first invocation ran in beforeAll. Running it again must not throw,
    // and the column must still be present + usable after.
    await expect(addCanvasStatesNotationColumn()).resolves.toBeUndefined();

    // Sanity: insert a canvas state and confirm the default lands.
    const [canvas] = await db
      .insert(dataModelCanvasStates)
      .values({
        dataModelId: testModelId,
        userId: testUserId,
        layer: 'logical',
      })
      .returning({ notation: dataModelCanvasStates.notation });
    expect(canvas.notation).toBe('ie');

    await db
      .delete(dataModelCanvasStates)
      .where(eq(dataModelCanvasStates.dataModelId, testModelId));
  });

  it('accepts default ie, accepts idef1x, rejects anything else via CHECK constraint', async () => {
    // Default case
    const [defaultRow] = await db
      .insert(dataModelCanvasStates)
      .values({ dataModelId: testModelId, userId: testUserId, layer: 'conceptual' })
      .returning({ notation: dataModelCanvasStates.notation });
    expect(defaultRow.notation).toBe('ie');

    // Explicit idef1x
    const [idef1xRow] = await db
      .insert(dataModelCanvasStates)
      .values({
        dataModelId: testModelId,
        userId: testUserId,
        layer: 'physical',
        notation: 'idef1x',
      })
      .returning({ notation: dataModelCanvasStates.notation });
    expect(idef1xRow.notation).toBe('idef1x');

    // Bogus value must raise a CHECK violation. We narrow on pg.DatabaseError
    // + SQLSTATE 23514 — no catch(e: any).
    let captured: unknown;
    try {
      await db.insert(dataModelCanvasStates).values({
        dataModelId: testModelId,
        userId: testUserId,
        layer: 'logical',
        // @ts-expect-error — intentionally violating the notation enum at runtime
        notation: 'xxx',
      });
    } catch (err) {
      captured = err;
    }
    expect(extractPgDatabaseError(captured)).not.toBeNull();
    expect(isPgErrorWithCode(captured, PG_CHECK_VIOLATION)).toBe(true);

    await db
      .delete(dataModelCanvasStates)
      .where(eq(dataModelCanvasStates.dataModelId, testModelId));
  });
});

describe('Step 6 migrations — relationships version + unique triple index', () => {
  it('enforces unique (model, source, target, COALESCE(name,"")) and defaults version to 1', async () => {
    // First insert: no name → succeeds, version defaults to 1.
    const [firstRel] = await db
      .insert(dataModelRelationships)
      .values({
        dataModelId: testModelId,
        sourceEntityId: testSourceEntityId,
        targetEntityId: testTargetEntityId,
        sourceCardinality: 'one',
        targetCardinality: 'many',
        layer: 'logical',
      })
      .returning({
        id: dataModelRelationships.id,
        version: dataModelRelationships.version,
        name: dataModelRelationships.name,
      });
    expect(firstRel.version).toBe(1);
    expect(firstRel.name).toBeNull();

    // Second insert with identical (model, source, target, name=null)
    // must raise a UNIQUE violation per the Step-6 unique-triple index.
    let captured: unknown;
    try {
      await db.insert(dataModelRelationships).values({
        dataModelId: testModelId,
        sourceEntityId: testSourceEntityId,
        targetEntityId: testTargetEntityId,
        sourceCardinality: 'one',
        targetCardinality: 'many',
        layer: 'logical',
      });
    } catch (err) {
      captured = err;
    }
    expect(extractPgDatabaseError(captured)).not.toBeNull();
    expect(isPgErrorWithCode(captured, PG_UNIQUE_VIOLATION)).toBe(true);

    // Differing name → permitted (COALESCE trick lets the triple differ).
    const [namedRel] = await db
      .insert(dataModelRelationships)
      .values({
        dataModelId: testModelId,
        sourceEntityId: testSourceEntityId,
        targetEntityId: testTargetEntityId,
        name: 'has_many',
        sourceCardinality: 'one',
        targetCardinality: 'many',
        layer: 'logical',
      })
      .returning({ id: dataModelRelationships.id, version: dataModelRelationships.version });
    expect(namedRel.version).toBe(1);

    // Clean up so the afterAll pass is unconditional.
    await db
      .delete(dataModelRelationships)
      .where(inArray(dataModelRelationships.id, [firstRel.id, namedRel.id] as string[]));
  });
});
