import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import {
  type CreateRelationshipInput,
  type Layer,
  type NamingLintRule,
  type RelationshipKeyColumnPair,
  type RelationshipKeyColumnPairInput,
  type RelationshipKeyColumnsResponse,
  type UpdateRelationshipInput,
} from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelAttributes, dataModelEntities, dataModelRelationships } from '../db/schema.js';
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
  propagateOneSourcePkToTarget,
  propagateRelationshipFk,
  reconcileFkIdentifyingFlag,
  reconcileFkNullability,
  unwindRelationshipFk,
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
          // Step 6 Direction A — inverse verb phrase. Trim to match
          // the zod-trimmed forward name; empty string collapses to
          // null so the edge renderer knows there is no reverse phrase.
          inverseName:
            input.inverseName == null || input.inverseName.trim() === ''
              ? null
              : input.inverseName.trim(),
          sourceCardinality: normalised.normalized.sourceCardinality!,
          targetCardinality: normalised.normalized.targetCardinality!,
          isIdentifying: input.isIdentifying,
          layer: normalised.normalized.layer!,
          metadata: input.metadata ?? {},
          version: 1,
        })
        .returning();

      // Key Columns upgrade (Step 6 follow-up) — every rel propagates
      // source PKs as FK attrs on the target, not just identifying rels.
      // `isPrimaryKey` on the propagated attr mirrors `isIdentifying`,
      // and `isNullable` derives from the source cardinality. Self-ref
      // + identifying-cycle checks run inside `propagateRelationshipFk`
      // only when the rel is identifying, and a source with zero PKs
      // throws `InvariantError('source_has_no_pk')` — the TX rolls back.
      //
      // Source-has-no-PK is soft-handled here: we swallow it so the rel
      // itself still gets created (the client surfaces "source entity
      // has no PK — add one to enable FK propagation" via the Key
      // Columns panel). This matches the spec edge-case table.
      try {
        await propagateRelationshipFk(tx, {
          relId: row.id,
          modelId,
          sourceEntityId: input.sourceEntityId,
          targetEntityId: input.targetEntityId,
          isIdentifying: input.isIdentifying,
          sourceCardinality: normalised.normalized.sourceCardinality!,
          changedBy: userId,
        });
      } catch (err) {
        // Source-with-no-PK is soft on non-identifying rels: the rel
        // survives so the user can add PKs later and backfill. For
        // identifying rels we keep the strict behaviour — a child PK
        // cannot be empty, so the rel MUST come with propagated PKs.
        if (
          err instanceof InvariantError &&
          err.code === 'source_has_no_pk' &&
          !input.isIdentifying
        ) {
          logger.info(
            { relId: row.id, modelId },
            'relationship.create — source has no PK; non-identifying rel created without FKs',
          );
        } else {
          throw err;
        }
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
      // Step 6 Direction A — inverse verb phrase. Null / empty /
      // whitespace-only collapses to null so the edge renderer knows
      // the reverse phrase is absent.
      if (patch.inverseName !== undefined) {
        setPayload.inverseName =
          patch.inverseName == null || patch.inverseName.trim() === ''
            ? null
            : patch.inverseName.trim();
      }
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
      //   false→true  → FKs already exist (per Key Columns upgrade): flip
      //                 them to PKs + enforce NOT NULL. If no FKs exist
      //                 yet (source had no PK at create time, now has
      //                 one), propagate fresh.
      //   true→false  → FKs survive but lose their PK flag + nullability
      //                 reconciles against cardinality.
      //   unchanged   → reconcile nullability only when cardinality
      //                 changed.
      const effectiveIdentifying =
        patch.isIdentifying === undefined ? before.isIdentifying : patch.isIdentifying;
      const effectiveSourceCardinality = patch.sourceCardinality ?? before.sourceCardinality;

      // Endpoint-change handling — if either source or target was
      // rewritten to a DIFFERENT entity, unwind propagated FKs from the
      // OLD target and re-propagate fresh from the (possibly new)
      // source to the new target. Same function pair that create/delete
      // use, so the cascade shape is identical.
      //
      // Same-entity patches (undefined or matching the before value)
      // skip this branch and fall through to the isIdentifying /
      // cardinality reconcile logic below, which is the pre-Step-6-
      // follow-up behaviour.
      const sourceChanged =
        patch.sourceEntityId !== undefined && patch.sourceEntityId !== before.sourceEntityId;
      const targetChanged =
        patch.targetEntityId !== undefined && patch.targetEntityId !== before.targetEntityId;
      const endpointChanged = sourceChanged || targetChanged;

      if (endpointChanged) {
        // Unwind from the ORIGINAL target — FKs there still reference
        // the old source PK and would otherwise become orphaned rows
        // with dangling metadata. Fires even if only source changed.
        await unwindRelationshipFk(tx, { relId, modelId, changedBy: userId });
        // Propagate fresh from (effectiveSource → effectiveTarget).
        // Same `source_has_no_pk` soft-handle as create / isIdentifying
        // flip paths so the rel survives when the new source hasn't
        // declared its PK yet on the non-identifying branch.
        try {
          await propagateRelationshipFk(tx, {
            relId,
            modelId,
            sourceEntityId: effectiveSource,
            targetEntityId: effectiveTarget,
            isIdentifying: effectiveIdentifying,
            sourceCardinality: effectiveSourceCardinality,
            changedBy: userId,
          });
        } catch (err) {
          if (
            err instanceof InvariantError &&
            err.code === 'source_has_no_pk' &&
            !effectiveIdentifying
          ) {
            logger.info(
              { relId, modelId },
              'relationship.update — endpoint change with no source PK; leaving FKs empty',
            );
          } else {
            throw err;
          }
        }
      } else if (
        patch.isIdentifying !== undefined &&
        patch.isIdentifying !== before.isIdentifying
      ) {
        const flipped = await reconcileFkIdentifyingFlag(tx, {
          relId,
          modelId,
          isIdentifying: effectiveIdentifying,
          sourceCardinality: effectiveSourceCardinality,
          changedBy: userId,
        });
        // If no FKs existed (e.g. the source originally had no PK and
        // now does), fall back to a fresh propagate — keeps Erwin
        // behaviour: identifying rels MUST carry propagated PKs.
        if (flipped === 0) {
          try {
            await propagateRelationshipFk(tx, {
              relId,
              modelId,
              sourceEntityId: effectiveSource,
              targetEntityId: effectiveTarget,
              isIdentifying: effectiveIdentifying,
              sourceCardinality: effectiveSourceCardinality,
              changedBy: userId,
            });
          } catch (err) {
            if (
              err instanceof InvariantError &&
              err.code === 'source_has_no_pk' &&
              !effectiveIdentifying
            ) {
              // Same soft-handle rule as create.
              logger.info(
                { relId, modelId },
                'relationship.update — source has no PK; non-identifying flip leaves FKs empty',
              );
            } else {
              throw err;
            }
          }
        }
      } else if (
        patch.sourceCardinality !== undefined &&
        patch.sourceCardinality !== before.sourceCardinality
      ) {
        // Cardinality-only flip → reconcile nullability across every
        // auto-propagated FK. No-op for identifying rels (always NN).
        await reconcileFkNullability(tx, {
          relId,
          modelId,
          isIdentifying: effectiveIdentifying,
          sourceCardinality: effectiveSourceCardinality,
          changedBy: userId,
        });
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
      // Key Columns upgrade: ALL rels (identifying or not) may have
      // propagated FKs or manually-paired target attrs. Unwind runs
      // unconditionally — it no-ops cleanly when nothing was propagated.
      const unwoundAttrs = await unwindRelationshipFk(tx, {
        relId,
        modelId,
        changedBy: userId,
      });

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
// KEY COLUMNS — Erwin-parity FK pairing panel
//
// GET  /models/:id/relationships/:relId/key-columns  → getKeyColumns
// POST /models/:id/relationships/:relId/key-columns  → setKeyColumns
//
// Design:
//   - Source PKs drive the pair list; if the source has no PKs, the
//     response carries `sourceHasNoPk=true` and the client renders an
//     error banner instead of rows.
//   - Each pair has a target attr that was either auto-propagated
//     (metadata.propagated_from_rel_id === relId) or manually paired
//     (metadata.fk_for_rel_id === relId, fk_for_source_attr_id set).
//   - `needsBackfill` signals that the source has N PKs but the target
//     carries fewer than N paired attrs — the UI triggers a silent
//     POST with the existing pairs to let the server auto-fill.
// ============================================================

/** Load rel + source + target entity rows, authenticating access.
 *  Throws NotFoundError if any of them is missing within the model. */
async function loadRelWithEndpoints(
  userId: string,
  modelId: string,
  relId: string,
): Promise<{
  rel: DataModelRelationship;
  source: EntityLite;
  target: EntityLite;
}> {
  await assertCanAccessModel(userId, modelId);
  const rel = await getRelationship(userId, modelId, relId);
  const map = await loadEntitiesInModel(modelId, [rel.sourceEntityId, rel.targetEntityId]);
  const source = map.get(rel.sourceEntityId);
  const target = map.get(rel.targetEntityId);
  if (!source || !target) throw new NotFoundError('Relationship');
  return { rel, source, target };
}

type AttrRow = typeof dataModelAttributes.$inferSelect;

/** Classify a source attribute as PK, AK (alt-key group), or UQ
 *  (explicit simple unique). Used by buildPairs to badge the UI row.
 *  PK wins over AK wins over UQ when multiple flags are set. */
function classifySourceRole(attr: AttrRow): 'pk' | 'uq' | 'ak' {
  if (attr.isPrimaryKey) return 'pk';
  if (attr.altKeyGroup) return 'ak';
  return 'uq';
}

/** Build the pair list from the target entity's FK attrs for this rel.
 *  Pairs are keyed by source candidate-key id; auto-propagated attrs
 *  map via `propagated_from_attr_id`, manual attrs via
 *  `fk_for_source_attr_id`. */
function buildPairs(
  sourceCks: AttrRow[],
  targetFks: AttrRow[],
): { pairs: RelationshipKeyColumnPair[]; needsBackfill: boolean } {
  const bySourceAttr = new Map<string, { target: AttrRow; isAutoCreated: boolean }>();
  for (const attr of targetFks) {
    const md = (attr.metadata as Record<string, unknown> | null) ?? {};
    const auto = md.propagated_from_attr_id as string | undefined;
    const manual = md.fk_for_source_attr_id as string | undefined;
    if (auto) {
      bySourceAttr.set(auto, { target: attr, isAutoCreated: true });
    } else if (manual) {
      bySourceAttr.set(manual, { target: attr, isAutoCreated: false });
    }
  }

  const pairs: RelationshipKeyColumnPair[] = sourceCks.map((ck) => {
    const hit = bySourceAttr.get(ck.id);
    return {
      sourceAttributeId: ck.id,
      sourceAttributeName: ck.name,
      sourceAttributeRole: classifySourceRole(ck),
      targetAttributeId: hit?.target.id ?? null,
      targetAttributeName: hit?.target.name ?? null,
      isAutoCreated: hit?.isAutoCreated ?? false,
    };
  });

  // needsBackfill fires only for PK rows — AK/UQ pairing is opt-in,
  // so an unpaired UQ row is the default state, not a drift.
  const pkPairs = pairs.filter((p) => p.sourceAttributeRole === 'pk');
  const pkPaired = pkPairs.filter((p) => p.targetAttributeId !== null).length;
  const needsBackfill = pkPairs.length > 0 && pkPaired < pkPairs.length;

  return { pairs, needsBackfill };
}

/** Select all FK-targetable candidate-key attributes on a source
 *  entity. Three kinds qualify:
 *    1. PK — `isPrimaryKey = true`
 *    2. AK — alt-key group member (`altKeyGroup IS NOT NULL`)
 *    3. UQ — explicit UNIQUE designation (`isExplicitUnique = true`)
 *
 *  `isExplicitUnique` is the provenance marker that separates "user
 *  explicitly toggled UQ" from "UQ is sticky after a cleared PK/AK".
 *  Without this flag, clearing a PK or AK would leak the column into
 *  the Key Columns panel via its sticky isUnique=true state — a bug
 *  we hit during Step 6 follow-up testing.
 *
 *  Ordered PK → AK → UQ so designations render top-down. */
async function selectSourceCandidateKeys(
  runner: typeof db | Tx,
  sourceEntityId: string,
): Promise<AttrRow[]> {
  return runner
    .select()
    .from(dataModelAttributes)
    .where(
      and(
        eq(dataModelAttributes.entityId, sourceEntityId),
        or(
          eq(dataModelAttributes.isPrimaryKey, true),
          sql`${dataModelAttributes.altKeyGroup} IS NOT NULL`,
          eq(dataModelAttributes.isExplicitUnique, true),
        ),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${dataModelAttributes.isPrimaryKey} THEN 0 WHEN ${dataModelAttributes.altKeyGroup} IS NOT NULL THEN 1 ELSE 2 END`,
      asc(dataModelAttributes.ordinalPosition),
      asc(dataModelAttributes.createdAt),
    );
}

export async function getKeyColumns(
  userId: string,
  modelId: string,
  relId: string,
): Promise<RelationshipKeyColumnsResponse> {
  const { rel } = await loadRelWithEndpoints(userId, modelId, relId);

  const sourceCks = await selectSourceCandidateKeys(db, rel.sourceEntityId);
  const sourcePks = sourceCks.filter((c) => c.isPrimaryKey);
  const sourceHasNoPk = sourcePks.length === 0;
  const sourceHasNoCandidateKey = sourceCks.length === 0;

  // Fetch target attrs that either propagated from this rel OR are
  // manually tagged for this rel. Single query using JSONB predicates.
  let targetFks = await db
    .select()
    .from(dataModelAttributes)
    .where(
      and(
        eq(dataModelAttributes.entityId, rel.targetEntityId),
        or(
          sql`${dataModelAttributes.metadata}->>'propagated_from_rel_id' = ${relId}`,
          sql`${dataModelAttributes.metadata}->>'fk_for_rel_id' = ${relId}`,
        ),
      ),
    );

  // Self-heal: if a target FK points at a source attr that is no longer
  // a candidate key (PK demoted, isUnique cleared, altKeyGroup removed,
  // or the attr deleted entirely), the FK is orphaned. Reconcile on
  // read so stale orphans don't linger.
  const currentSourceCkIds = new Set(sourceCks.map((p) => p.id));
  const orphans = targetFks.filter((attr) => {
    const md = (attr.metadata as Record<string, unknown> | null) ?? {};
    const auto = md.propagated_from_attr_id as string | undefined;
    const manual = md.fk_for_source_attr_id as string | undefined;
    const sourceAttrId = auto ?? manual;
    if (!sourceAttrId) return false;
    return !currentSourceCkIds.has(sourceAttrId);
  });

  if (orphans.length > 0) {
    await db.transaction(async (tx) => {
      for (const attr of orphans) {
        const md = (attr.metadata as Record<string, unknown> | null) ?? {};
        const isAuto = Boolean(md.propagated_from_attr_id);
        if (isAuto) {
          await tx.delete(dataModelAttributes).where(eq(dataModelAttributes.id, attr.id));
        } else {
          const clean: Record<string, unknown> = { ...md };
          delete clean.fk_for_rel_id;
          delete clean.fk_for_source_attr_id;
          await tx
            .update(dataModelAttributes)
            .set({ metadata: clean, updatedAt: new Date() })
            .where(eq(dataModelAttributes.id, attr.id));
        }
      }
      await recordChange({
        dataModelId: modelId,
        objectId: relId,
        objectType: 'relationship',
        action: 'unwind',
        changedBy: userId,
        beforeState: {
          cause: 'getKeyColumns_self_heal',
          orphanIds: orphans.map((o) => o.id),
          orphanNames: orphans.map((o) => o.name),
        },
      });
    });
    // Drop the orphans from the working set so buildPairs reflects the
    // post-reconciliation state in this same response.
    const orphanIds = new Set(orphans.map((o) => o.id));
    targetFks = targetFks.filter((a) => !orphanIds.has(a.id));
  }

  const { pairs, needsBackfill } = buildPairs(sourceCks, targetFks);
  return { pairs, needsBackfill, sourceHasNoPk, sourceHasNoCandidateKey };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

/** Inner TX worker for setKeyColumns. Keeps the service function body
 *  flat + makes unit testing easier by accepting a pre-opened tx. */
async function applyKeyColumnsInTx(
  tx: Tx,
  input: {
    rel: DataModelRelationship;
    modelId: string;
    userId: string;
    desiredBySource: Map<string, string | null>;
    /** Source attr ids the caller wants un-paired (delete auto FK /
     *  strip manual tags). Caller already enforced that none of these
     *  are PKs. */
    removeSet: Set<string>;
    sourceCks: AttrRow[];
    existingTargetFks: AttrRow[];
  },
): Promise<void> {
  const { rel, modelId, userId, desiredBySource, removeSet, sourceCks, existingTargetFks } = input;

  // Index existing target FKs by which source attr they serve.
  const autoBySourceAttr = new Map<string, AttrRow>();
  const manualBySourceAttr = new Map<string, AttrRow>();
  for (const attr of existingTargetFks) {
    const md = (attr.metadata as Record<string, unknown> | null) ?? {};
    const auto = md.propagated_from_attr_id as string | undefined;
    const manual = md.fk_for_source_attr_id as string | undefined;
    if (auto) autoBySourceAttr.set(auto, attr);
    if (manual) manualBySourceAttr.set(manual, attr);
  }

  // Compute next ordinal lazily — only needed if we auto-create.
  let nextOrdinal: number | null = null;
  async function getNextOrdinal(): Promise<number> {
    if (nextOrdinal !== null) return nextOrdinal;
    const [{ maxOrdinal } = { maxOrdinal: 0 }] = await tx
      .select({
        maxOrdinal: sql<number>`COALESCE(MAX(${dataModelAttributes.ordinalPosition}), 0)`,
      })
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.entityId, rel.targetEntityId));
    nextOrdinal = Number(maxOrdinal) + 1;
    return nextOrdinal;
  }

  for (const ck of sourceCks) {
    const isPk = ck.isPrimaryKey;

    // Explicit remove directive — delete the auto FK if any, strip the
    // manual rel tags if any. Caller has already validated that remove
    // is not set for PK sources.
    if (removeSet.has(ck.id)) {
      const auto = autoBySourceAttr.get(ck.id);
      if (auto) {
        await tx.delete(dataModelAttributes).where(eq(dataModelAttributes.id, auto.id));
      }
      const manual = manualBySourceAttr.get(ck.id);
      if (manual && manual.id !== auto?.id) {
        const md = (manual.metadata as Record<string, unknown> | null) ?? {};
        const clean: Record<string, unknown> = { ...md };
        delete clean.fk_for_rel_id;
        delete clean.fk_for_source_attr_id;
        await tx
          .update(dataModelAttributes)
          .set({ metadata: clean, updatedAt: new Date() })
          .where(eq(dataModelAttributes.id, manual.id));
      }
      if (auto || manual) {
        await recordChange({
          dataModelId: modelId,
          objectId: rel.id,
          objectType: 'relationship',
          action: 'unwind',
          changedBy: userId,
          beforeState: {
            keyColumnPair: {
              sourceAttributeId: ck.id,
              targetAttributeId: auto?.id ?? manual?.id ?? null,
              mode: auto ? 'auto_removed' : 'manual_unpaired',
            },
          },
        });
      }
      continue;
    }

    const hasExplicitRequest = desiredBySource.has(ck.id);
    // Non-PK candidate keys only get processed when the user explicitly
    // includes them in the pairs list. PKs keep their legacy behavior —
    // absent from the request means "auto-create if missing" (backwards
    // compat). AK/UQ absent from the request means "leave alone".
    if (!hasExplicitRequest && !isPk) continue;

    const desired = hasExplicitRequest ? desiredBySource.get(ck.id)! : null;

    if (desired === null) {
      // Auto — ensure an auto-propagated FK exists for this source attr.
      if (!autoBySourceAttr.has(ck.id)) {
        // Drop any stale manual tag for this source attr to avoid a
        // double-count in GET.
        const stale = manualBySourceAttr.get(ck.id);
        if (stale) {
          const md = (stale.metadata as Record<string, unknown> | null) ?? {};
          const clean: Record<string, unknown> = { ...md };
          delete clean.fk_for_rel_id;
          delete clean.fk_for_source_attr_id;
          await tx
            .update(dataModelAttributes)
            .set({ metadata: clean, updatedAt: new Date() })
            .where(eq(dataModelAttributes.id, stale.id));
        }

        const ordinal = await getNextOrdinal();
        nextOrdinal = ordinal + 1;
        await propagateOneSourcePkToTarget(tx, {
          relId: rel.id,
          sourceAttr: ck,
          sourceEntityId: rel.sourceEntityId,
          targetEntityId: rel.targetEntityId,
          isIdentifying: rel.isIdentifying,
          sourceCardinality: rel.sourceCardinality,
          ordinal,
        });

        await recordChange({
          dataModelId: modelId,
          objectId: rel.id,
          objectType: 'relationship',
          action: 'update',
          changedBy: userId,
          afterState: {
            keyColumnPair: {
              sourceAttributeId: ck.id,
              targetAttributeId: null,
              mode: 'auto_created',
            },
          },
        });
      }
      continue;
    }

    // Desired = specific target attr UUID. Validate it lives on the
    // target entity; adopt it as the manual FK for this source attr.
    const [targetRow] = await tx
      .select()
      .from(dataModelAttributes)
      .where(
        and(
          eq(dataModelAttributes.id, desired),
          eq(dataModelAttributes.entityId, rel.targetEntityId),
        ),
      )
      .limit(1);
    if (!targetRow) {
      throw new ValidationError({
        targetAttributeId: [
          `Attribute ${desired} does not belong to target entity ${rel.targetEntityId}.`,
        ],
      });
    }

    const targetMd = (targetRow.metadata as Record<string, unknown> | null) ?? {};
    const existingRelTag = targetMd.fk_for_rel_id as string | undefined;
    const existingSrcTag = targetMd.fk_for_source_attr_id as string | undefined;
    // If the attr is already manually paired for a DIFFERENT rel/source,
    // reject — the user must clear that pairing first.
    if (
      (existingRelTag && existingRelTag !== rel.id) ||
      (existingSrcTag && existingSrcTag !== ck.id)
    ) {
      throw new ConflictError(
        `Attribute "${targetRow.name}" is already paired to another relationship. Clear that pairing first.`,
      );
    }

    // Drop any stale auto-propagated FK for THIS source attr that isn't
    // the attr the user just picked.
    const autoRow = autoBySourceAttr.get(ck.id);
    if (autoRow && autoRow.id !== targetRow.id) {
      await tx.delete(dataModelAttributes).where(eq(dataModelAttributes.id, autoRow.id));
    }

    // Tag the chosen attr as the manual FK. Preserve any other metadata.
    const newMd: Record<string, unknown> = {
      ...targetMd,
      fk_for_rel_id: rel.id,
      fk_for_source_attr_id: ck.id,
    };
    await tx
      .update(dataModelAttributes)
      .set({ isForeignKey: true, metadata: newMd, updatedAt: new Date() })
      .where(eq(dataModelAttributes.id, targetRow.id));

    await recordChange({
      dataModelId: modelId,
      objectId: rel.id,
      objectType: 'relationship',
      action: 'update',
      changedBy: userId,
      afterState: {
        keyColumnPair: {
          sourceAttributeId: ck.id,
          targetAttributeId: targetRow.id,
          mode: 'manual_paired',
        },
      },
    });
  }

  // Cleanup pass — remove FK attrs whose source candidate key no longer
  // exists on the source entity. The forward loop above only visits
  // current sourceCks; when a source attr was demoted from PK / lost its
  // UQ / was removed from its AK group, its paired target FK would
  // otherwise be orphaned. Two cases to handle:
  //   - auto-propagated (metadata.propagated_from_attr_id): delete the
  //     whole attr row — it was machine-generated for the dropped CK.
  //   - manually paired (metadata.fk_for_source_attr_id): strip the
  //     relationship tags, leaving the attr itself intact (user-owned).
  const currentSourceCkIds = new Set(sourceCks.map((c) => c.id));

  for (const [sourceAttrId, attrRow] of autoBySourceAttr) {
    if (currentSourceCkIds.has(sourceAttrId)) continue;
    await tx.delete(dataModelAttributes).where(eq(dataModelAttributes.id, attrRow.id));
    await recordChange({
      dataModelId: modelId,
      objectId: rel.id,
      objectType: 'relationship',
      action: 'unwind',
      changedBy: userId,
      beforeState: {
        keyColumnPair: {
          sourceAttributeId: sourceAttrId,
          targetAttributeId: attrRow.id,
          mode: 'auto_removed',
        },
      },
    });
  }

  for (const [sourceAttrId, attrRow] of manualBySourceAttr) {
    if (currentSourceCkIds.has(sourceAttrId)) continue;
    // Skip if the same attr was already deleted via the auto path.
    if (autoBySourceAttr.get(sourceAttrId)?.id === attrRow.id) continue;
    const md = (attrRow.metadata as Record<string, unknown> | null) ?? {};
    const clean: Record<string, unknown> = { ...md };
    delete clean.fk_for_rel_id;
    delete clean.fk_for_source_attr_id;
    await tx
      .update(dataModelAttributes)
      .set({ metadata: clean, updatedAt: new Date() })
      .where(eq(dataModelAttributes.id, attrRow.id));
    await recordChange({
      dataModelId: modelId,
      objectId: rel.id,
      objectType: 'relationship',
      action: 'unwind',
      changedBy: userId,
      beforeState: {
        keyColumnPair: {
          sourceAttributeId: sourceAttrId,
          targetAttributeId: attrRow.id,
          mode: 'manual_unpaired',
        },
      },
    });
  }
}

export async function setKeyColumns(
  userId: string,
  modelId: string,
  relId: string,
  input: { pairs: RelationshipKeyColumnPairInput[] },
): Promise<RelationshipKeyColumnsResponse> {
  const { rel } = await loadRelWithEndpoints(userId, modelId, relId);

  // Validate every sourceAttributeId is a candidate key (PK OR simple
  // UQ OR alt-key group member) on source.
  const sourceCks = await selectSourceCandidateKeys(db, rel.sourceEntityId);
  const sourceCkIds = new Set(sourceCks.map((a) => a.id));
  const sourceCkById = new Map(sourceCks.map((a) => [a.id, a] as const));
  for (const p of input.pairs) {
    if (!sourceCkIds.has(p.sourceAttributeId)) {
      throw new ValidationError({
        sourceAttributeId: [
          `Attribute ${p.sourceAttributeId} is not a candidate key on the source entity. Only primary keys and alt-key (AK) group members are FK-pairable.`,
        ],
      });
    }
    if (p.remove) {
      // Removing a PK's FK would leave the relationship without a
      // complete FK. Reject — users must demote the PK or delete the
      // relationship instead.
      const ck = sourceCkById.get(p.sourceAttributeId);
      if (ck?.isPrimaryKey) {
        throw new ValidationError({
          remove: [
            `Cannot remove the pair for "${ck.name}" — primary keys are required participants in the relationship's FK. Demote the PK or delete the relationship.`,
          ],
        });
      }
      if (p.targetAttributeId !== null) {
        throw new ValidationError({
          remove: ['When remove=true, targetAttributeId must be null.'],
        });
      }
    }
  }
  // Reject duplicate source ids in the body.
  const seen = new Set<string>();
  for (const p of input.pairs) {
    if (seen.has(p.sourceAttributeId)) {
      throw new ValidationError({
        pairs: [`Duplicate sourceAttributeId ${p.sourceAttributeId} in request body.`],
      });
    }
    seen.add(p.sourceAttributeId);
  }

  const desiredBySource = new Map<string, string | null>();
  const removeSet = new Set<string>();
  for (const p of input.pairs) {
    if (p.remove) {
      removeSet.add(p.sourceAttributeId);
    } else {
      desiredBySource.set(p.sourceAttributeId, p.targetAttributeId);
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Re-fetch target FKs INSIDE the TX so concurrent mutations don't
      // produce stale state. The JSONB predicates use ->> so the GIN
      // metadata index is not a perfect fit — acceptable for a single
      // rel's worth of attrs (bounded by source PK count, typically ≤ 3).
      const existingTargetFks = await tx
        .select()
        .from(dataModelAttributes)
        .where(
          and(
            eq(dataModelAttributes.entityId, rel.targetEntityId),
            or(
              sql`${dataModelAttributes.metadata}->>'propagated_from_rel_id' = ${relId}`,
              sql`${dataModelAttributes.metadata}->>'fk_for_rel_id' = ${relId}`,
            ),
          ),
        );

      await applyKeyColumnsInTx(tx, {
        rel,
        modelId,
        userId,
        desiredBySource,
        removeSet,
        sourceCks,
        existingTargetFks,
      });
    });
  } catch (err) {
    if (
      err instanceof ValidationError ||
      err instanceof ConflictError ||
      err instanceof NotFoundError ||
      err instanceof InvariantError ||
      err instanceof CyclicIdentifyingError
    ) {
      throw err;
    }
    if (isTransientDbError(err)) {
      logger.warn({ err, userId, modelId, relId }, 'setKeyColumns — transient DB failure');
      throw new ServiceUnavailableError();
    }
    logger.error({ err, userId, modelId, relId }, 'setKeyColumns failed');
    throw new DBError('setKeyColumns');
  }

  // Return the reconciled view via the same GET path so the response
  // body is guaranteed to match what a subsequent GET would return.
  return getKeyColumns(userId, modelId, relId);
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
