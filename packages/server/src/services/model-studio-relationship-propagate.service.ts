import { and, asc, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { AppError, ConflictError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { dataModelAttributes, dataModelEntities, dataModelRelationships } from '../db/schema.js';
import { recordChange } from './model-studio-changelog.service.js';

/**
 * Step 6 — identifying-relationship PK propagation / unwind / cycle detection.
 *
 * Each exported function takes a Drizzle TRANSACTION handle as its first
 * argument. These functions NEVER open their own transaction — the
 * caller (the main relationship service) already holds one so the rel
 * insert + propagation + changelog write either all commit or all roll
 * back together. This is the non-negotiable correctness pillar of 2A:
 *   "isIdentifying=true performs FULL Erwin PK propagation in the same
 *    transaction."
 *
 * Error contract (mandatory — see alignment-step6.md §5):
 *   - `InvariantError` (422): the caller violated a precondition, e.g.
 *      the source entity has zero PK attrs and therefore nothing can
 *      be propagated. Carries an error `code` for client-side mapping.
 *   - `CyclicIdentifyingError` (422): propagating this rel would create
 *      a cycle in the identifying-rel graph (A→B→C→A). The path string
 *      is included in both `message` and `path` for test assertions
 *      and human-readable audit logs.
 *   - `ConflictError` (409, re-thrown from the `ConflictError` class):
 *      a propagated attribute name would collide with an existing attr
 *      on the target entity. We throw rather than auto-renaming because
 *      Erwin's MUST-NOT-SILENTLY-RENAME rule avoids data-loss surprises.
 *
 * None of these are caught here — they propagate up so the TX rolls back.
 */

/**
 * 422 — a service precondition was violated. Used for business-rule
 * failures (e.g. propagating from an entity with no PKs).
 */
export class InvariantError extends AppError {
  public readonly code: string;
  constructor(code: string, message?: string) {
    super(422, message ?? `Invariant violated: ${code}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}

/**
 * 422 — identifying-rel cycle. The `path` is a human-readable chain
 * like "customer→order→line_item→customer" for the audit log + the
 * client toast.
 */
export class CyclicIdentifyingError extends AppError {
  public readonly code = 'CYCLIC_IDENTIFYING';
  public readonly path: string;
  constructor(path: string) {
    super(422, `Identifying relationship would create a cycle: ${path}`);
    this.name = 'CyclicIdentifyingError';
    this.path = path;
  }
}

/** The `tx` parameter is a Drizzle transaction handle. The concrete
 *  generic is too noisy to spell out so we leave it loose — the public
 *  API is the shape of the object, not its generic parameters. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

const MAX_CYCLE_DEPTH = 20;

/**
 * Walk the identifying-rel graph from `targetEntityId` looking for a
 * path back to `sourceEntityId`. If found, throw `CyclicIdentifyingError`
 * with a readable path string.
 *
 * Uses the partial index `idx_data_model_rels_identifying` so each step
 * is a cheap index probe. Bounded to 20 hops (defensive — real models
 * never come close).
 */
export async function detectCycleIdentifying(
  tx: Tx,
  input: { sourceEntityId: string; targetEntityId: string; modelId: string },
): Promise<void> {
  const { sourceEntityId, targetEntityId, modelId } = input;

  // Trivial cycle: self-ref is ALLOWED per 3A, but NOT when identifying.
  // A self-ref identifying rel would propagate a PK into its own entity
  // under the same name, guaranteeing a name collision. Reject early.
  if (sourceEntityId === targetEntityId) {
    throw new CyclicIdentifyingError(`${sourceEntityId}→self`);
  }

  // BFS from target; looking for source. Track visited to keep the walk
  // linear in the number of identifying rels.
  const visited = new Set<string>([targetEntityId]);
  const queue: Array<{ id: string; path: string[] }> = [
    { id: targetEntityId, path: [targetEntityId] },
  ];
  let depth = 0;

  while (queue.length > 0 && depth < MAX_CYCLE_DEPTH) {
    const next: Array<{ id: string; path: string[] }> = [];
    for (const { id, path } of queue) {
      const rows = await tx
        .select({ target: dataModelRelationships.targetEntityId })
        .from(dataModelRelationships)
        .where(
          and(
            eq(dataModelRelationships.dataModelId, modelId),
            eq(dataModelRelationships.sourceEntityId, id),
            eq(dataModelRelationships.isIdentifying, true),
          ),
        );
      for (const row of rows) {
        const nextPath = [...path, row.target];
        if (row.target === sourceEntityId) {
          // Found a walk back — include the proposed edge at the tail.
          throw new CyclicIdentifyingError([...nextPath, sourceEntityId].join('→'));
        }
        if (!visited.has(row.target)) {
          visited.add(row.target);
          next.push({ id: row.target, path: nextPath });
        }
      }
    }
    queue.length = 0;
    queue.push(...next);
    depth += 1;
  }
}

/**
 * Propagate the source entity's PK attributes onto the target entity
 * as new PK + FK attrs, preserving ordinal order and carrying metadata
 * that links each new attr back to its source attr + the rel that
 * propagated it.
 *
 * Returns the array of newly-inserted attr IDs. Writes an audit row
 * under the SAME transaction.
 *
 * Pre-conditions (enforced by the main service before calling):
 *   - cross-layer / cross-model checks have passed.
 *   - the rel exists (`relId` is a real row).
 *   - the caller holds an open transaction.
 *
 * Throws:
 *   - `InvariantError('source_has_no_pk')` when the source entity has
 *     zero PK attributes.
 *   - `CyclicIdentifyingError` when the propagation would create a
 *     cycle (we re-check inside the TX because concurrent PATCHes on a
 *     neighbouring rel could introduce a cycle after the service-level
 *     check).
 *   - `ConflictError` when a target attribute with the same name
 *     already exists. The caller's TX rolls back atomically.
 */
export async function propagateIdentifyingPKs(
  tx: Tx,
  input: {
    relId: string;
    modelId: string;
    sourceEntityId: string;
    targetEntityId: string;
    changedBy: string;
  },
): Promise<string[]> {
  const { relId, modelId, sourceEntityId, targetEntityId, changedBy } = input;

  await detectCycleIdentifying(tx, { sourceEntityId, targetEntityId, modelId });

  const sourcePks = await tx
    .select()
    .from(dataModelAttributes)
    .where(
      and(
        eq(dataModelAttributes.entityId, sourceEntityId),
        eq(dataModelAttributes.isPrimaryKey, true),
      ),
    )
    .orderBy(asc(dataModelAttributes.ordinalPosition), asc(dataModelAttributes.createdAt));

  if (sourcePks.length === 0) {
    throw new InvariantError('source_has_no_pk', 'Source entity has no primary key to propagate.');
  }

  // Next ordinal on the target — propagated attrs are appended at the
  // end of the target's attr list (Erwin behaviour; users can reorder
  // manually after propagation). Using MAX+1 inside the TX avoids a
  // race with concurrent attribute inserts on the same entity.
  const [{ maxOrdinal } = { maxOrdinal: 0 }] = await tx
    .select({
      maxOrdinal: sql<number>`COALESCE(MAX(${dataModelAttributes.ordinalPosition}), 0)`,
    })
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, targetEntityId));

  const insertedIds: string[] = [];
  let nextOrdinal = Number(maxOrdinal) + 1;

  for (const pk of sourcePks) {
    // Name-collision check — Erwin-style, NO silent rename. The caller's
    // TX is responsible for the rollback when we throw.
    const [collision] = await tx
      .select({ id: dataModelAttributes.id })
      .from(dataModelAttributes)
      .where(
        and(
          eq(dataModelAttributes.entityId, targetEntityId),
          eq(dataModelAttributes.name, pk.name),
        ),
      )
      .limit(1);
    if (collision) {
      throw new ConflictError(
        `Cannot propagate PK "${pk.name}" — an attribute with this name already exists on the target entity.`,
      );
    }

    // Compose the metadata bag so downstream unwind + diagnostics can
    // find these rows deterministically.
    const metadata = {
      ...((pk.metadata as Record<string, unknown> | null) ?? {}),
      propagated_from_rel_id: relId,
      propagated_from_attr_id: pk.id,
      propagated_from_entity_id: sourceEntityId,
    };

    const [created] = await tx
      .insert(dataModelAttributes)
      .values({
        entityId: targetEntityId,
        name: pk.name,
        businessName: pk.businessName,
        description: pk.description,
        dataType: pk.dataType,
        length: pk.length,
        precision: pk.precision,
        scale: pk.scale,
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: true,
        isUnique: pk.isUnique,
        defaultValue: pk.defaultValue,
        classification: pk.classification,
        transformationLogic: pk.transformationLogic,
        ordinalPosition: nextOrdinal,
        metadata,
        tags: pk.tags,
      })
      .returning({ id: dataModelAttributes.id });

    insertedIds.push(created.id);
    nextOrdinal += 1;
  }

  // Audit trail: the `propagate` action verb (Step-6 ChangeLogAction
  // extension). `afterState.attrIds` lets the UI render "Propagated N
  // composite PK attributes: a, b, c".
  await recordChange({
    dataModelId: modelId,
    objectId: relId,
    objectType: 'relationship',
    action: 'propagate',
    changedBy,
    afterState: {
      attrIds: insertedIds,
      attrNames: sourcePks.map((p) => p.name),
      sourceEntityId,
      targetEntityId,
    },
  });

  logger.info(
    {
      relId,
      modelId,
      sourceEntityId,
      targetEntityId,
      count: insertedIds.length,
    },
    'relationship.propagate',
  );

  return insertedIds;
}

/**
 * Remove every target attribute that was propagated via this rel.
 *
 * Finds rows by `metadata->>'propagated_from_rel_id' = :relId`, so
 * attrs the user created manually (even with the same names) are
 * preserved.
 */
export async function unwindIdentifyingPKs(
  tx: Tx,
  input: { relId: string; modelId: string; changedBy: string },
): Promise<number> {
  const { relId, modelId, changedBy } = input;

  // Fetch before deletion so the audit entry can record exactly what
  // was removed (id + name). The audit before/after contract (alignment
  // §8) requires the removed set to be recoverable from the log alone.
  const toRemove = await tx
    .select({
      id: dataModelAttributes.id,
      name: dataModelAttributes.name,
      entityId: dataModelAttributes.entityId,
    })
    .from(dataModelAttributes)
    .where(sql`${dataModelAttributes.metadata}->>'propagated_from_rel_id' = ${relId}`);

  if (toRemove.length === 0) {
    logger.info({ relId, modelId }, 'relationship.unwind.noop — no propagated attributes found');
    return 0;
  }

  await tx
    .delete(dataModelAttributes)
    .where(sql`${dataModelAttributes.metadata}->>'propagated_from_rel_id' = ${relId}`);

  await recordChange({
    dataModelId: modelId,
    objectId: relId,
    objectType: 'relationship',
    action: 'unwind',
    changedBy,
    beforeState: {
      attrIds: toRemove.map((r) => r.id),
      attrNames: toRemove.map((r) => r.name),
    },
  });

  logger.info({ relId, modelId, count: toRemove.length }, 'relationship.unwind');

  return toRemove.length;
}

/**
 * Diagnostic helper used by tests + the admin diagnostics endpoint.
 * Not part of the happy path. Kept here so the "propagation domain"
 * stays self-contained.
 */
export async function entityExistsInModel(
  tx: Tx,
  modelId: string,
  entityId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: dataModelEntities.id })
    .from(dataModelEntities)
    .where(and(eq(dataModelEntities.id, entityId), eq(dataModelEntities.dataModelId, modelId)))
    .limit(1);
  return !!row;
}
