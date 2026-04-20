import { and, asc, eq, or, sql } from 'drizzle-orm';
import {
  type CreateRelationshipInput,
  type Layer,
  type NamingLintRule,
  type UpdateRelationshipInput,
} from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelEntities, dataModelRelationships } from '../db/schema.js';
import {
  AppError,
  ConflictError,
  DBError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';
import { enqueueEmbedding } from './model-studio-embedding.service.js';
import {
  CyclicIdentifyingError,
  InvariantError,
  propagateIdentifyingPKs,
  unwindIdentifyingPKs,
} from './model-studio-relationship-propagate.service.js';
import { normalizeRelationship } from './model-studio-relationship-flags.js';

/**
 * Step 6 — relationship CRUD + cross-layer / cross-model / cycle / self-ref
 * enforcement + optimistic-lock updates + identifying-rel PK propagation.
 *
 * Shape anchor: `model-studio-attribute.service.ts`. Every mutation:
 *   1. authZ via `assertCanAccessModel` (throws NotFoundError → 404).
 *   2. normalises the input via `normalizeRelationship` (pure).
 *   3. loads source + target entities and enforces cross-layer /
 *      cross-model invariants.
 *   4. runs the mutation inside ONE drizzle transaction; the audit
 *      write and any propagation / unwind ride the SAME tx so a
 *      failure anywhere rolls the whole thing back.
 *   5. enqueues an embedding job after the commit.
 *
 * Error contract (mandatory — see alignment-step6.md §5):
 *   - `NotFoundError`        → 404 "Relationship"/"Entity"
 *   - `ValidationError`      → 422 (zod-shape fields)
 *   - `CrossLayerError`      → 422 (layer mismatch or entities on different layers)
 *   - `CrossModelError`      → 422 (forged entity id from another model)
 *   - `VersionConflictError` → 409 (stale PATCH — body carries serverVersion)
 *   - `InvariantError`       → 422 (source has no PK, etc.)
 *   - `CyclicIdentifyingError` → 422 (identifying cycle)
 *   - `ConflictError`        → 409 (name collision on propagation)
 *   - `ServiceUnavailableError` → 503 (DB timeouts)
 *   - `DBError`              → 500 (unknown DB failure; wraps original)
 *
 * No `catch (e: any)` anywhere. Every catch narrows on `instanceof`.
 */

export type DataModelRelationship = typeof dataModelRelationships.$inferSelect;

export interface RelationshipWithLint extends DataModelRelationship {
  lint: NamingLintRule[];
}

/**
 * 422 — layer mismatch (e.g. linking a logical entity to a physical
 * entity, or passing `layer=physical` while the entities are logical).
 */
export class CrossLayerError extends AppError {
  public readonly code = 'CROSS_LAYER';
  constructor(message = 'Relationship layer mismatch.') {
    super(422, message);
    this.name = 'CrossLayerError';
  }
}

/**
 * 422 — source or target entity belongs to a different data model.
 * Distinct from 404 because the client gave us a syntactically valid
 * payload that fails a cross-reference check.
 */
export class CrossModelError extends AppError {
  public readonly code = 'CROSS_MODEL';
  constructor(message = 'Relationship endpoints must live in the same model.') {
    super(422, message);
    this.name = 'CrossModelError';
  }
}

/**
 * 409 — optimistic-lock conflict. Body surfaces `serverVersion` so the
 * client can prompt "merge or overwrite?". Never produced by a simple
 * re-fetch — it fires only when a concurrent writer bumped the row.
 */
export class VersionConflictError extends AppError {
  public readonly code = 'VERSION_CONFLICT';
  public readonly serverVersion: number;
  constructor(serverVersion: number) {
    super(409, `Relationship was updated by someone else — reload to see the latest version.`);
    this.name = 'VersionConflictError';
    this.serverVersion = serverVersion;
  }
}

/**
 * 503 — DB connection pool exhausted / statement timeout. Client should
 * retry with the `Retry-After` header (handled by the error middleware
 * once it sees this class). Narrow helper so callers don't scatter the
 * heuristic.
 */
export class ServiceUnavailableError extends AppError {
  public readonly retryAfterSeconds = 2;
  constructor(message = 'Service temporarily unavailable. Retry in a moment.') {
    super(503, message);
    this.name = 'ServiceUnavailableError';
  }
}

// ============================================================
// Internal helpers
// ============================================================

interface EntityLite {
  id: string;
  dataModelId: string;
  layer: string;
  name: string;
}

async function loadEntitiesInModel(
  modelId: string,
  entityIds: string[],
): Promise<Map<string, EntityLite>> {
  if (entityIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: dataModelEntities.id,
      dataModelId: dataModelEntities.dataModelId,
      layer: dataModelEntities.layer,
      name: dataModelEntities.name,
    })
    .from(dataModelEntities)
    .where(
      and(
        eq(dataModelEntities.dataModelId, modelId),
        // Small list — simple OR chain keeps the SQL simple and the
        // planner on the `idx_data_model_entities_data_model_id` index.
        or(...entityIds.map((id) => eq(dataModelEntities.id, id))),
      ),
    );
  return new Map(rows.map((r) => [r.id, r]));
}

function assertSameLayer(
  source: EntityLite | undefined,
  target: EntityLite | undefined,
  declaredLayer: Layer,
): void {
  if (!source || !target) {
    // Either entity missing in this model → cross-model (or simply gone).
    // The caller separately raises 404 / CrossModelError based on which.
    return;
  }
  if (source.layer !== target.layer) {
    throw new CrossLayerError(
      `Source "${source.name}" is on layer "${source.layer}" but target "${target.name}" is on layer "${target.layer}".`,
    );
  }
  if (source.layer !== declaredLayer) {
    throw new CrossLayerError(
      `Declared layer "${declaredLayer}" does not match entity layer "${source.layer}".`,
    );
  }
}

function buildEmbeddingContent(
  rel: DataModelRelationship,
  srcName: string,
  tgtName: string,
): string {
  const parts = [
    `relationship ${srcName} ${rel.sourceCardinality}:${rel.targetCardinality} ${tgtName}`,
  ];
  if (rel.name) parts.push(rel.name);
  if (rel.isIdentifying) parts.push('identifying');
  return parts.join('\n');
}

/**
 * Detect connection / statement timeouts from pg and surface as a typed
 * 503. Errors are `Error` instances whose message or cause describes
 * a connection-level failure. We only match on explicit signals to
 * avoid misclassifying plain query errors as "retry me later".
 */
function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('statement timeout') ||
    msg.includes('connection timeout') ||
    msg.includes('too many clients')
  );
}

// ============================================================
// CREATE
// ============================================================

export async function createRelationship(
  userId: string,
  modelId: string,
  input: CreateRelationshipInput,
): Promise<RelationshipWithLint> {
  await assertCanAccessModel(userId, modelId);

  let normalised;
  try {
    normalised = normalizeRelationship({
      name: input.name ?? null,
      sourceCardinality: input.sourceCardinality,
      targetCardinality: input.targetCardinality,
      layer: input.layer,
      isIdentifying: input.isIdentifying,
    });
  } catch (err) {
    if (err instanceof RangeError) {
      throw new ValidationError({ body: [err.message] });
    }
    throw err;
  }

  // Load both endpoints in a single query. If either is missing from
  // this model we throw CrossModelError — the client passed an entity
  // id that isn't in the URL-specified model.
  const ids = Array.from(new Set([input.sourceEntityId, input.targetEntityId]));
  const map = await loadEntitiesInModel(modelId, ids);
  const source = map.get(input.sourceEntityId);
  const target = map.get(input.targetEntityId);
  if (!source || !target) {
    throw new CrossModelError();
  }
  assertSameLayer(source, target, normalised.normalized.layer as Layer);

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dataModelRelationships)
        .values({
          dataModelId: modelId,
          sourceEntityId: input.sourceEntityId,
          targetEntityId: input.targetEntityId,
          name: normalised.normalized.name,
          sourceCardinality: normalised.normalized.sourceCardinality!,
          targetCardinality: normalised.normalized.targetCardinality!,
          isIdentifying: input.isIdentifying,
          layer: normalised.normalized.layer!,
          metadata: input.metadata ?? {},
          version: 1,
        })
        .returning();

      if (input.isIdentifying) {
        // Propagation runs inside the same TX — self-ref + cycle checks
        // live in `detectCycleIdentifying`, which throws on violation
        // and rolls back the rel insert via TX abort.
        await propagateIdentifyingPKs(tx, {
          relId: row.id,
          modelId,
          sourceEntityId: input.sourceEntityId,
          targetEntityId: input.targetEntityId,
          changedBy: userId,
        });
      }

      await recordChange({
        dataModelId: modelId,
        objectId: row.id,
        objectType: 'relationship',
        action: 'create',
        changedBy: userId,
        afterState: row,
      });

      return row;
    });

    await enqueueEmbedding({
      dataModelId: modelId,
      objectId: created.id,
      objectType: 'relationship',
      content: buildEmbeddingContent(created, source.name, target.name),
    });

    logger.info(
      {
        userId,
        modelId,
        relId: created.id,
        sourceEntityId: created.sourceEntityId,
        targetEntityId: created.targetEntityId,
        identifying: created.isIdentifying,
      },
      'relationship.create',
    );
    return { ...created, lint: normalised.warnings };
  } catch (err) {
    // Narrow on every expected class — alignment-step6.md §5 hard rule.
    if (
      err instanceof ConflictError ||
      err instanceof ValidationError ||
      err instanceof NotFoundError ||
      err instanceof CrossLayerError ||
      err instanceof CrossModelError ||
      err instanceof InvariantError ||
      err instanceof CyclicIdentifyingError
    ) {
      throw err;
    }
    if (isTransientDbError(err)) {
      logger.warn({ err, userId, modelId }, 'createRelationship — transient DB failure');
      throw new ServiceUnavailableError();
    }
    // Unique-triple violation → 409 (duplicate rel for this pair+name).
    if (err instanceof Error && err.message.includes('idx_data_model_rels_unique_triple')) {
      throw new ConflictError('A relationship with this source, target and name already exists.');
    }
    logger.error(
      {
        err,
        userId,
        modelId,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
      },
      'createRelationship failed',
    );
    throw new DBError('createRelationship');
  }
}

// ============================================================
// LIST
// ============================================================

export async function listRelationships(
  userId: string,
  modelId: string,
): Promise<{ relationships: DataModelRelationship[]; total: number }> {
  await assertCanAccessModel(userId, modelId);
  const rows = await db
    .select()
    .from(dataModelRelationships)
    .where(eq(dataModelRelationships.dataModelId, modelId))
    .orderBy(asc(dataModelRelationships.createdAt));
  return { relationships: rows, total: rows.length };
}

// ============================================================
// GET ONE
// ============================================================

export async function getRelationship(
  userId: string,
  modelId: string,
  relId: string,
): Promise<DataModelRelationship> {
  await assertCanAccessModel(userId, modelId);
  const [row] = await db
    .select()
    .from(dataModelRelationships)
    .where(
      and(eq(dataModelRelationships.id, relId), eq(dataModelRelationships.dataModelId, modelId)),
    )
    .limit(1);
  if (!row) throw new NotFoundError('Relationship');
  return row;
}

// ============================================================
// UPDATE — optimistic concurrency via `version`
// ============================================================

export async function updateRelationship(
  userId: string,
  modelId: string,
  relId: string,
  patch: UpdateRelationshipInput,
): Promise<RelationshipWithLint> {
  await assertCanAccessModel(userId, modelId);
  const before = await getRelationship(userId, modelId, relId);

  // Normalise whichever fields the patch provided. We don't pass layer
  // if it wasn't in the patch; the assertSameLayer helper uses the
  // current row's layer in that case.
  let normalised;
  try {
    normalised = normalizeRelationship({
      name: patch.name === undefined ? before.name : (patch.name ?? null),
      sourceCardinality: patch.sourceCardinality ?? before.sourceCardinality,
      targetCardinality: patch.targetCardinality ?? before.targetCardinality,
      layer: patch.layer ?? before.layer,
      isIdentifying: patch.isIdentifying === undefined ? before.isIdentifying : patch.isIdentifying,
    });
  } catch (err) {
    if (err instanceof RangeError) {
      throw new ValidationError({ body: [err.message] });
    }
    throw err;
  }

  const effectiveLayer = (patch.layer ?? before.layer) as Layer;
  const effectiveSource = patch.sourceEntityId ?? before.sourceEntityId;
  const effectiveTarget = patch.targetEntityId ?? before.targetEntityId;

  // If either endpoint is being rewritten OR the layer changes, re-run
  // the cross-model + cross-layer checks. No-op otherwise.
  if (
    patch.sourceEntityId !== undefined ||
    patch.targetEntityId !== undefined ||
    patch.layer !== undefined
  ) {
    const ids = Array.from(new Set([effectiveSource, effectiveTarget]));
    const map = await loadEntitiesInModel(modelId, ids);
    const source = map.get(effectiveSource);
    const target = map.get(effectiveTarget);
    if (!source || !target) throw new CrossModelError();
    assertSameLayer(source, target, effectiveLayer);
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const nextVersion = before.version + 1;
      const setPayload: Record<string, unknown> = {
        updatedAt: new Date(),
        version: nextVersion,
      };
      if (patch.name !== undefined) setPayload.name = normalised.normalized.name;
      if (patch.sourceEntityId !== undefined) setPayload.sourceEntityId = patch.sourceEntityId;
      if (patch.targetEntityId !== undefined) setPayload.targetEntityId = patch.targetEntityId;
      if (patch.sourceCardinality !== undefined)
        setPayload.sourceCardinality = normalised.normalized.sourceCardinality;
      if (patch.targetCardinality !== undefined)
        setPayload.targetCardinality = normalised.normalized.targetCardinality;
      if (patch.layer !== undefined) setPayload.layer = normalised.normalized.layer;
      if (patch.isIdentifying !== undefined) setPayload.isIdentifying = patch.isIdentifying;
      if (patch.metadata !== undefined) setPayload.metadata = patch.metadata;

      // Optimistic lock: the UPDATE runs with an extra `version = X`
      // predicate. When a concurrent writer has bumped the row, the
      // predicate fails and `.returning()` is empty → 409.
      const rows = await tx
        .update(dataModelRelationships)
        .set(setPayload)
        .where(
          and(
            eq(dataModelRelationships.id, relId),
            eq(dataModelRelationships.dataModelId, modelId),
            eq(dataModelRelationships.version, patch.version),
          ),
        )
        .returning();

      if (rows.length === 0) {
        // Look up the current version so the client can retry cleanly.
        const [current] = await tx
          .select({ version: dataModelRelationships.version })
          .from(dataModelRelationships)
          .where(eq(dataModelRelationships.id, relId))
          .limit(1);
        throw new VersionConflictError(current?.version ?? before.version);
      }

      const next = rows[0];

      // Identifying transition handling — Erwin parity.
      //   false→true → propagate PKs now.
      //   true→false → unwind previously propagated attrs.
      //   unchanged → no-op.
      if (patch.isIdentifying === true && !before.isIdentifying) {
        await propagateIdentifyingPKs(tx, {
          relId,
          modelId,
          sourceEntityId: effectiveSource,
          targetEntityId: effectiveTarget,
          changedBy: userId,
        });
      } else if (patch.isIdentifying === false && before.isIdentifying) {
        await unwindIdentifyingPKs(tx, { relId, modelId, changedBy: userId });
      }

      await recordChange({
        dataModelId: modelId,
        objectId: relId,
        objectType: 'relationship',
        action: 'update',
        changedBy: userId,
        beforeState: before,
        afterState: next,
      });

      return next;
    });

    logger.info(
      {
        userId,
        modelId,
        relId,
        fields: Object.keys(patch),
        fromVersion: before.version,
        toVersion: updated.version,
      },
      'relationship.update',
    );
    return { ...updated, lint: normalised.warnings };
  } catch (err) {
    if (
      err instanceof VersionConflictError ||
      err instanceof ConflictError ||
      err instanceof ValidationError ||
      err instanceof NotFoundError ||
      err instanceof CrossLayerError ||
      err instanceof CrossModelError ||
      err instanceof InvariantError ||
      err instanceof CyclicIdentifyingError
    ) {
      throw err;
    }
    if (isTransientDbError(err)) {
      logger.warn({ err, userId, modelId, relId }, 'updateRelationship — transient DB failure');
      throw new ServiceUnavailableError();
    }
    logger.error({ err, userId, modelId, relId }, 'updateRelationship failed');
    throw new DBError('updateRelationship');
  }
}

// ============================================================
// DELETE — unwinds propagated attrs when identifying
// ============================================================

export async function deleteRelationship(
  userId: string,
  modelId: string,
  relId: string,
): Promise<{ deleted: true; unwoundAttrs: number }> {
  await assertCanAccessModel(userId, modelId);
  const before = await getRelationship(userId, modelId, relId);

  try {
    const result = await db.transaction(async (tx) => {
      let unwoundAttrs = 0;
      if (before.isIdentifying) {
        unwoundAttrs = await unwindIdentifyingPKs(tx, { relId, modelId, changedBy: userId });
      }

      const deleted = await tx
        .delete(dataModelRelationships)
        .where(
          and(
            eq(dataModelRelationships.id, relId),
            eq(dataModelRelationships.dataModelId, modelId),
          ),
        )
        .returning({ id: dataModelRelationships.id });
      if (deleted.length === 0) throw new NotFoundError('Relationship');

      await recordChange({
        dataModelId: modelId,
        objectId: relId,
        objectType: 'relationship',
        action: 'delete',
        changedBy: userId,
        beforeState: { ...before, unwoundAttrs },
      });

      return { unwoundAttrs };
    });

    logger.info(
      { userId, modelId, relId, unwoundAttrs: result.unwoundAttrs },
      'relationship.delete',
    );
    return { deleted: true, unwoundAttrs: result.unwoundAttrs };
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) throw err;
    if (isTransientDbError(err)) {
      logger.warn({ err, userId, modelId, relId }, 'deleteRelationship — transient DB failure');
      throw new ServiceUnavailableError();
    }
    logger.error({ err, userId, modelId, relId }, 'deleteRelationship failed');
    throw new DBError('deleteRelationship');
  }
}

// ============================================================
// IMPACT — cascade-delete preview for entities
// ============================================================

export interface EntityRelationshipImpact {
  relationshipIds: string[];
  count: number;
}

export async function getEntityImpact(
  userId: string,
  modelId: string,
  entityId: string,
): Promise<EntityRelationshipImpact> {
  await assertCanAccessModel(userId, modelId);

  const rows = await db
    .select({ id: dataModelRelationships.id })
    .from(dataModelRelationships)
    .where(
      and(
        eq(dataModelRelationships.dataModelId, modelId),
        or(
          eq(dataModelRelationships.sourceEntityId, entityId),
          eq(dataModelRelationships.targetEntityId, entityId),
        ),
      ),
    );
  return { relationshipIds: rows.map((r) => r.id), count: rows.length };
}

/**
 * Internal helper used by the diagnostics service. Exported so
 * administrators can reach it without duplicating SQL.
 */
export async function findRelationshipsByMetadataKey(
  modelId: string,
  key: 'propagated_from_rel_id',
): Promise<{ id: string }[]> {
  return db
    .select({ id: dataModelRelationships.id })
    .from(dataModelRelationships)
    .where(
      and(
        eq(dataModelRelationships.dataModelId, modelId),
        sql`${dataModelRelationships.metadata}->>${key} IS NOT NULL`,
      ),
    );
}
