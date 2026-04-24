import { eq, inArray } from 'drizzle-orm';
import type { LayerLink } from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelEntities, dataModelLayerLinks } from '../db/schema.js';
import { ConflictError, DBError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';
import { detectCycle } from '../utils/link-graph.utils.js';
import { runSerializable } from '../utils/serializable-tx.js';

/**
 * Step 7 — entity-level layer_links CRUD.
 *
 * Authoritative data flow for cross-layer entity projections. Every
 * link says parent entity (layer A) is "the same conceptual thing" as
 * child entity (layer B), where A !== B (enforced here, not in the DB
 * since the schema has no CHECK for it — layer is on the entity row,
 * not the link row). The `data_model_layer_links` table uniqueness is
 * on `(parentId, childId)`.
 *
 * Error contract (matches alignment-step7.md + lesson L29):
 *   - NotFoundError     → 404 "Layer link"/"Entity" not found
 *   - ValidationError   → 400 (same-layer, cycle, cross-model)
 *   - ConflictError     → 409 (unique-constraint violation, 40001 retries
 *                              exhausted)
 *   - DBError           → 500 (unexpected DB failure)
 *
 * Race safety: createLink wraps the "read graph → cycle BFS → insert"
 * flow in a SERIALIZABLE transaction with 3x retry on 40001. Two tabs
 * concurrently creating mirror links (A→B and B→A) would both pass a
 * READ COMMITTED cycle check; under SERIALIZABLE one aborts and is
 * retried. See `packages/server/src/utils/serializable-tx.ts`.
 *
 * Authz: every entry point calls `assertCanAccessModel`. No further
 * role differentiation — reader+ for list, editor+ for create/delete.
 * The codebase-wide helper doesn't distinguish roles yet (see the
 * comment on `model-studio-authz.service.ts`).
 */

// ============================================================
// Inputs (service-layer DTOs)
// ============================================================

export interface CreateLayerLinkInput {
  userId: string;
  modelId: string;
  parentId: string;
  childId: string;
}

export interface DeleteLayerLinkInput {
  userId: string;
  modelId: string;
  linkId: string;
}

export interface ListByParentInput {
  userId: string;
  modelId: string;
  parentId: string;
}

export interface ListByChildInput {
  userId: string;
  modelId: string;
  childId: string;
}

// ============================================================
// Helpers (private)
// ============================================================

/** Row shape returned by our entity-side lookups. Picks only the
 *  columns the layer-link response actually needs so we don't pay the
 *  full entity SELECT surface on every list call. */
export interface EntityBrief {
  id: string;
  name: string;
  layer: string;
  dataModelId: string;
}

/** The pure-function validation chain for createLink.
 *
 *  Extracted from `createLink` so it can be unit-tested without a DB:
 *  all DB-dependent work (authz, entity lookups, cycle-graph fetch,
 *  transaction) happens around this function, and the decision logic
 *  itself is deterministic on its inputs. Throws exactly the
 *  AppError subclass the HTTP layer maps to the right status code.
 *
 *  Callers are responsible for:
 *    - Running authz BEFORE invoking this
 *    - Loading `parent` + `child` entities by id (passing `null` if
 *      either doesn't exist — this function maps that to NotFound)
 *    - Fetching `existingEdges` from the same transaction that will
 *      insert the new edge (SERIALIZABLE snapshot) so cycle-detection
 *      sees a consistent view
 */
export function validateLayerLinkCreate(args: {
  modelId: string;
  parentId: string;
  childId: string;
  parent: EntityBrief | null;
  child: EntityBrief | null;
  existingEdges: readonly { parentId: string; childId: string }[];
}): void {
  const { modelId, parentId, childId, parent, child, existingEdges } = args;

  if (parentId === childId) {
    throw new ValidationError({
      childId: ['A layer link cannot connect an entity to itself.'],
    });
  }

  if (!parent || !child) {
    throw new NotFoundError('Entity');
  }

  if (parent.dataModelId !== modelId || child.dataModelId !== modelId) {
    throw new ValidationError({
      childId: ['Both entities must belong to this model.'],
    });
  }

  if (parent.layer === child.layer) {
    throw new ValidationError({
      childId: ['Parent and child must be on different layers.'],
    });
  }

  if (detectCycle(existingEdges, parentId, childId)) {
    throw new ValidationError({
      childId: ['This link would create a cycle in the layer projection graph.'],
    });
  }
}

async function loadEntityBrief(entityId: string): Promise<EntityBrief | null> {
  const rows = await db
    .select({
      id: dataModelEntities.id,
      name: dataModelEntities.name,
      layer: dataModelEntities.layer,
      dataModelId: dataModelEntities.dataModelId,
    })
    .from(dataModelEntities)
    .where(eq(dataModelEntities.id, entityId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadEntitiesByIds(ids: readonly string[]): Promise<Map<string, EntityBrief>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: dataModelEntities.id,
      name: dataModelEntities.name,
      layer: dataModelEntities.layer,
      dataModelId: dataModelEntities.dataModelId,
    })
    .from(dataModelEntities)
    .where(inArray(dataModelEntities.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Enrich a raw layer_link row with parent + child entity fields so
 *  the response matches `LayerLink` from `@cc/shared`. Throws if either
 *  entity is missing (should never happen with FK CASCADE on, but keep
 *  the defence so a stale cache bug never produces null fields). */
function toLayerLink(
  row: typeof dataModelLayerLinks.$inferSelect,
  parent: EntityBrief,
  child: EntityBrief,
): LayerLink {
  return {
    id: row.id,
    parentId: row.parentId,
    parentName: parent.name,
    parentLayer: parent.layer as LayerLink['parentLayer'],
    childId: row.childId,
    childName: child.name,
    childLayer: child.layer as LayerLink['childLayer'],
    linkType: row.linkType,
    createdAt: row.createdAt.toISOString(),
  };
}

// ============================================================
// CREATE
// ============================================================

/**
 * Create a new layer_link between two entities in the same model.
 *
 * Validation chain (all synchronous short-circuits before any write):
 *   1. authz via `assertCanAccessModel`
 *   2. both entities exist and are in `modelId`
 *   3. entities are on different layers
 *   4. inserting this edge would not create a cycle in the link graph
 *
 * The cycle check + insert run inside a SERIALIZABLE transaction. On
 * unique-constraint violation (23505), the caller gets ConflictError.
 * On 40001 after retries, the caller gets ConflictError (caller can
 * retry the request).
 *
 * @returns The newly created link, enriched with parent + child entity
 *          name + layer so the UI can render without a second round trip.
 */
export async function createLink(input: CreateLayerLinkInput): Promise<LayerLink> {
  const { userId, modelId, parentId, childId } = input;
  await assertCanAccessModel(userId, modelId);

  // First pass (outside the tx): cheap pre-flight checks that don't
  // depend on the edges snapshot. Loads the two referenced entities
  // and runs the non-cycle invariants. Same-layer + cross-model +
  // missing-entity fail fast here so we never even open a SERIALIZABLE
  // transaction for malformed input. The cycle check re-runs inside
  // the tx below with a consistent snapshot.
  const entityMap = await loadEntitiesByIds([parentId, childId]);
  const parent = entityMap.get(parentId) ?? null;
  const child = entityMap.get(childId) ?? null;
  validateLayerLinkCreate({
    modelId,
    parentId,
    childId,
    parent,
    child,
    existingEdges: [], // pre-flight only runs the id/entity/layer rules
  });

  let created: typeof dataModelLayerLinks.$inferSelect;
  try {
    created = await runSerializable(db, async (tx) => {
      // Load all existing links for this model under SERIALIZABLE so
      // the cycle BFS sees a consistent snapshot. We scope by model
      // via the join — parent is guaranteed to be in `modelId` (we
      // already validated), so any link row with parent_id in the
      // model's entities belongs to this model.
      const modelEntityIds = await tx
        .select({ id: dataModelEntities.id })
        .from(dataModelEntities)
        .where(eq(dataModelEntities.dataModelId, modelId));
      const scopedIds = modelEntityIds.map((r) => r.id);

      const existingEdges = scopedIds.length
        ? await tx
            .select({
              parentId: dataModelLayerLinks.parentId,
              childId: dataModelLayerLinks.childId,
            })
            .from(dataModelLayerLinks)
            .where(inArray(dataModelLayerLinks.parentId, scopedIds))
        : [];

      // Second pass (inside the tx): run the cycle check against the
      // SERIALIZABLE snapshot. All other rules already passed in the
      // pre-flight above — we pass them again here so the validator
      // is consistent, but they should not trigger.
      validateLayerLinkCreate({
        modelId,
        parentId,
        childId,
        parent,
        child,
        existingEdges,
      });

      const [row] = await tx
        .insert(dataModelLayerLinks)
        .values({
          parentId,
          childId,
          linkType: 'layer_projection',
        })
        .returning();
      if (!row) throw new DBError('createLink');
      return row;
    });
  } catch (err) {
    // ValidationError + app errors pass through untouched.
    if (
      err instanceof ValidationError ||
      err instanceof NotFoundError ||
      err instanceof ConflictError
    ) {
      throw err;
    }
    // Unique-constraint violation (23505) → 409. We check in two
    // places because Drizzle can surface the pg error on either the
    // top-level or `.cause` depending on version.
    if (isUniqueViolation(err)) {
      throw new ConflictError('Layer link already exists between these entities.');
    }
    // Serialization failure after retries exhausted — tell the client
    // to retry. Per serializable-tx.ts contract, this only surfaces
    // after MAX_ATTEMPTS attempts.
    if (isSerializationFailure(err)) {
      throw new ConflictError(
        'Layer link could not be saved due to concurrent edits. Please retry.',
      );
    }
    logger.error({ err, userId, modelId, parentId, childId }, 'createLink failed');
    throw new DBError('createLink');
  }

  // Audit write is fire-and-forget per recordChange's contract — a
  // failed audit row must never roll back the user's mutation.
  await recordChange({
    dataModelId: modelId,
    objectId: created.id,
    objectType: 'layer_link',
    action: 'create',
    changedBy: userId,
    afterState: created,
  });

  logger.info(
    { userId, modelId, linkId: created.id, parentId, childId },
    'Model Studio: layer_link created',
  );

  // `validateLayerLinkCreate` above throws NotFoundError when either
  // entity is null, so both are guaranteed defined past the pre-flight
  // call. TS can't see through the extracted-function throw, hence the
  // non-null assertion.
  return toLayerLink(created, parent!, child!);
}

// ============================================================
// DELETE
// ============================================================

/**
 * Delete a layer_link by id. Verifies the link belongs to the given
 * model via its parent entity (same-model invariant holds by schema
 * design — FK cascades from entity → link would already have removed
 * any cross-model links, but we double-check for defence in depth).
 */
export async function deleteLink(input: DeleteLayerLinkInput): Promise<void> {
  const { userId, modelId, linkId } = input;
  await assertCanAccessModel(userId, modelId);

  const existing = await db
    .select()
    .from(dataModelLayerLinks)
    .where(eq(dataModelLayerLinks.id, linkId))
    .limit(1);
  const row = existing[0];
  if (!row) throw new NotFoundError('Layer link');

  // Model membership check — we confirm via parent entity. The unique
  // + FK-cascade schema guarantees child's modelId equals parent's,
  // so checking one is sufficient.
  const parent = await loadEntityBrief(row.parentId);
  if (!parent || parent.dataModelId !== modelId) {
    // The link exists but doesn't belong to this model — behave
    // identically to "not found" so we don't leak cross-org IDs.
    throw new NotFoundError('Layer link');
  }

  try {
    await db.delete(dataModelLayerLinks).where(eq(dataModelLayerLinks.id, linkId));
  } catch (err) {
    logger.error({ err, userId, modelId, linkId }, 'deleteLink failed');
    throw new DBError('deleteLink');
  }

  await recordChange({
    dataModelId: modelId,
    objectId: linkId,
    objectType: 'layer_link',
    action: 'delete',
    changedBy: userId,
    beforeState: row,
  });

  logger.info({ userId, modelId, linkId }, 'Model Studio: layer_link deleted');
}

// ============================================================
// LIST
// ============================================================

/**
 * List every layer_link where the given entity is the parent. Returns
 * rows enriched with the CHILD entity name + layer so the UI can group
 * by target layer without a second round trip.
 */
export async function listByParent(input: ListByParentInput): Promise<LayerLink[]> {
  const { userId, modelId, parentId } = input;
  await assertCanAccessModel(userId, modelId);

  const parent = await loadEntityBrief(parentId);
  if (!parent || parent.dataModelId !== modelId) {
    throw new NotFoundError('Entity');
  }

  const links = await db
    .select()
    .from(dataModelLayerLinks)
    .where(eq(dataModelLayerLinks.parentId, parentId));
  if (links.length === 0) return [];

  const childMap = await loadEntitiesByIds(links.map((l) => l.childId));
  const result: LayerLink[] = [];
  for (const link of links) {
    const child = childMap.get(link.childId);
    if (!child) {
      // Should never happen (FK cascade removes the link row when an
      // entity is deleted). Log and skip rather than throw so a stale-
      // cache oddity never blocks the whole list response.
      logger.warn(
        { userId, modelId, linkId: link.id, missingChildId: link.childId },
        'listByParent: child entity missing for layer_link row — skipping',
      );
      continue;
    }
    result.push(toLayerLink(link, parent, child));
  }
  return result;
}

/** Mirror of `listByParent` — lists every layer_link where the given
 *  entity is the child, enriched with the PARENT entity fields. */
export async function listByChild(input: ListByChildInput): Promise<LayerLink[]> {
  const { userId, modelId, childId } = input;
  await assertCanAccessModel(userId, modelId);

  const child = await loadEntityBrief(childId);
  if (!child || child.dataModelId !== modelId) {
    throw new NotFoundError('Entity');
  }

  const links = await db
    .select()
    .from(dataModelLayerLinks)
    .where(eq(dataModelLayerLinks.childId, childId));
  if (links.length === 0) return [];

  const parentMap = await loadEntitiesByIds(links.map((l) => l.parentId));
  const result: LayerLink[] = [];
  for (const link of links) {
    const parent = parentMap.get(link.parentId);
    if (!parent) {
      logger.warn(
        { userId, modelId, linkId: link.id, missingParentId: link.parentId },
        'listByChild: parent entity missing for layer_link row — skipping',
      );
      continue;
    }
    result.push(toLayerLink(link, parent, child));
  }
  return result;
}

// ============================================================
// Private error-narrowing helpers
// ============================================================

/** Postgres unique_violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';
const SERIALIZATION_FAILURE = '40001';

function readPgCode(err: unknown): string | undefined {
  if (err === null || typeof err !== 'object') return undefined;
  const top = (err as { code?: unknown }).code;
  if (typeof top === 'string') return top;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return readPgCode(err) === UNIQUE_VIOLATION;
}

function isSerializationFailure(err: unknown): boolean {
  return readPgCode(err) === SERIALIZATION_FAILURE;
}
