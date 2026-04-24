import { eq, inArray } from 'drizzle-orm';
import type { AttributeLink } from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelAttributeLinks, dataModelAttributes, dataModelEntities } from '../db/schema.js';
import { ConflictError, DBError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';
import { detectCycle } from '../utils/link-graph.utils.js';
import { runSerializable } from '../utils/serializable-tx.js';

/**
 * Step 7 — attribute-level projection links.
 *
 * Parallel to `model-studio-layer-links.service.ts` but at the column
 * grain. An attribute link says "parent attribute (on entity X, layer A)
 * is the same concept as child attribute (on entity Y, layer B)" where
 * A !== B. Unique on `(parentId, childId)` per schema.
 *
 * Key difference from layer-links: validation has to hop TWO joins —
 * attr → entity → layer + modelId — to verify the cross-layer +
 * same-model invariants. We load that in one batched query to avoid
 * N+1.
 *
 * No PATCH: links are immutable. "Change" = DELETE + POST. Cycle
 * detection reuses `detectCycle` from link-graph.utils.
 */

// ============================================================
// Inputs
// ============================================================

export interface CreateAttributeLinkInput {
  userId: string;
  modelId: string;
  parentId: string;
  childId: string;
}

export interface DeleteAttributeLinkInput {
  userId: string;
  modelId: string;
  linkId: string;
}

export interface ListAttributeLinkByParentInput {
  userId: string;
  modelId: string;
  parentId: string;
}

export interface ListAttributeLinkByChildInput {
  userId: string;
  modelId: string;
  childId: string;
}

// ============================================================
// Helpers (private-ish — validator is exported for unit tests)
// ============================================================

/** Row shape returned by attr-with-entity lookups. We denormalise the
 *  owning entity's layer + modelId onto the attribute brief so the
 *  validator can run without another hop. */
export interface AttributeBrief {
  id: string;
  name: string;
  entityId: string;
  entityName: string;
  entityLayer: string;
  dataModelId: string;
}

/** Pure validation chain for createAttributeLink.
 *
 *  Parallels `validateLayerLinkCreate` exactly — extract so it can be
 *  unit-tested without a DB. Throws the AppError subclass the HTTP
 *  layer maps to the right status code.
 */
export function validateAttributeLinkCreate(args: {
  modelId: string;
  parentId: string;
  childId: string;
  parent: AttributeBrief | null;
  child: AttributeBrief | null;
  existingEdges: readonly { parentId: string; childId: string }[];
}): void {
  const { modelId, parentId, childId, parent, child, existingEdges } = args;

  if (parentId === childId) {
    throw new ValidationError({
      childId: ['An attribute link cannot connect an attribute to itself.'],
    });
  }

  if (!parent || !child) {
    throw new NotFoundError('Attribute');
  }

  if (parent.dataModelId !== modelId || child.dataModelId !== modelId) {
    throw new ValidationError({
      childId: ['Both attributes must belong to this model.'],
    });
  }

  // Same-layer rejection compares the OWNING ENTITIES' layers, not the
  // attributes' (attrs inherit their layer from the entity). Two attrs
  // on the same entity would trivially collide here; two attrs on
  // different entities but the same layer would too.
  if (parent.entityLayer === child.entityLayer) {
    throw new ValidationError({
      childId: ['Parent and child attributes must belong to entities on different layers.'],
    });
  }

  if (detectCycle(existingEdges, parentId, childId)) {
    throw new ValidationError({
      childId: ['This link would create a cycle in the attribute projection graph.'],
    });
  }
}

/** Batched lookup: given attribute IDs, returns their brief rows with
 *  the owning entity's layer + modelId denormalised in one query.
 *  Uses an INNER JOIN on the entity; rows where the entity is missing
 *  (shouldn't happen with FK cascade, but be defensive) are dropped. */
async function loadAttributeBriefs(ids: readonly string[]): Promise<Map<string, AttributeBrief>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: dataModelAttributes.id,
      name: dataModelAttributes.name,
      entityId: dataModelAttributes.entityId,
      entityName: dataModelEntities.name,
      entityLayer: dataModelEntities.layer,
      dataModelId: dataModelEntities.dataModelId,
    })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(inArray(dataModelAttributes.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Single-id variant used by delete + list flows. */
async function loadAttributeBrief(id: string): Promise<AttributeBrief | null> {
  const map = await loadAttributeBriefs([id]);
  return map.get(id) ?? null;
}

/** Enrich a raw attribute_link row with parent + child attribute
 *  fields so the response matches `AttributeLink` from `@cc/shared`. */
function toAttributeLink(
  row: typeof dataModelAttributeLinks.$inferSelect,
  parent: AttributeBrief,
  child: AttributeBrief,
): AttributeLink {
  return {
    id: row.id,
    parentId: row.parentId,
    parentName: parent.name,
    parentEntityId: parent.entityId,
    parentLayer: parent.entityLayer as AttributeLink['parentLayer'],
    childId: row.childId,
    childName: child.name,
    childEntityId: child.entityId,
    childLayer: child.entityLayer as AttributeLink['childLayer'],
    linkType: row.linkType,
    createdAt: row.createdAt.toISOString(),
  };
}

// ============================================================
// CREATE
// ============================================================

/**
 * Create a new attribute_link between two attributes in the same model.
 *
 * Mirror of `createLink` in layer-links: pre-flight validation outside
 * the tx (cheap rejects), SERIALIZABLE + 3x retry for the cycle check +
 * insert. 23505 unique-violation → ConflictError(409). Post-retry
 * 40001 → ConflictError(409) "please retry".
 */
export async function createAttributeLink(input: CreateAttributeLinkInput): Promise<AttributeLink> {
  const { userId, modelId, parentId, childId } = input;
  await assertCanAccessModel(userId, modelId);

  // Pre-flight: non-cycle validation fast-fails without a tx.
  const briefMap = await loadAttributeBriefs([parentId, childId]);
  const parent = briefMap.get(parentId) ?? null;
  const child = briefMap.get(childId) ?? null;
  validateAttributeLinkCreate({
    modelId,
    parentId,
    childId,
    parent,
    child,
    existingEdges: [],
  });

  let created: typeof dataModelAttributeLinks.$inferSelect;
  try {
    created = await runSerializable(db, async (tx) => {
      // Load all existing attribute-link edges scoped to this model
      // under SERIALIZABLE. Scoping is a bit trickier than layer-links
      // because attributes belong to entities, which belong to models.
      // We first resolve attribute IDs in this model, then filter links.
      const modelAttrIds = await tx
        .select({ id: dataModelAttributes.id })
        .from(dataModelAttributes)
        .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
        .where(eq(dataModelEntities.dataModelId, modelId));
      const scopedIds = modelAttrIds.map((r) => r.id);

      const existingEdges = scopedIds.length
        ? await tx
            .select({
              parentId: dataModelAttributeLinks.parentId,
              childId: dataModelAttributeLinks.childId,
            })
            .from(dataModelAttributeLinks)
            .where(inArray(dataModelAttributeLinks.parentId, scopedIds))
        : [];

      // Re-validate under the SERIALIZABLE snapshot. Cycle check only
      // triggers here; earlier rules are already guaranteed by pre-flight.
      validateAttributeLinkCreate({
        modelId,
        parentId,
        childId,
        parent,
        child,
        existingEdges,
      });

      const [row] = await tx
        .insert(dataModelAttributeLinks)
        .values({
          parentId,
          childId,
          linkType: 'layer_projection',
        })
        .returning();
      if (!row) throw new DBError('createAttributeLink');
      return row;
    });
  } catch (err) {
    if (
      err instanceof ValidationError ||
      err instanceof NotFoundError ||
      err instanceof ConflictError
    ) {
      throw err;
    }
    if (isUniqueViolation(err)) {
      throw new ConflictError('Attribute link already exists between these attributes.');
    }
    if (isSerializationFailure(err)) {
      throw new ConflictError(
        'Attribute link could not be saved due to concurrent edits. Please retry.',
      );
    }
    logger.error({ err, userId, modelId, parentId, childId }, 'createAttributeLink failed');
    throw new DBError('createAttributeLink');
  }

  await recordChange({
    dataModelId: modelId,
    objectId: created.id,
    objectType: 'attribute_link',
    action: 'create',
    changedBy: userId,
    afterState: created,
  });

  logger.info(
    { userId, modelId, linkId: created.id, parentId, childId },
    'Model Studio: attribute_link created',
  );

  // Pre-flight validator throws when parent/child are null, so both
  // are guaranteed defined here.
  return toAttributeLink(created, parent!, child!);
}

// ============================================================
// DELETE
// ============================================================

export async function deleteAttributeLink(input: DeleteAttributeLinkInput): Promise<void> {
  const { userId, modelId, linkId } = input;
  await assertCanAccessModel(userId, modelId);

  const existing = await db
    .select()
    .from(dataModelAttributeLinks)
    .where(eq(dataModelAttributeLinks.id, linkId))
    .limit(1);
  const row = existing[0];
  if (!row) throw new NotFoundError('Attribute link');

  // Verify model membership via parent attribute. Same reasoning as
  // layer-links: same-model invariant holds by schema design, one
  // check is sufficient.
  const parent = await loadAttributeBrief(row.parentId);
  if (!parent || parent.dataModelId !== modelId) {
    throw new NotFoundError('Attribute link');
  }

  try {
    await db.delete(dataModelAttributeLinks).where(eq(dataModelAttributeLinks.id, linkId));
  } catch (err) {
    logger.error({ err, userId, modelId, linkId }, 'deleteAttributeLink failed');
    throw new DBError('deleteAttributeLink');
  }

  await recordChange({
    dataModelId: modelId,
    objectId: linkId,
    objectType: 'attribute_link',
    action: 'delete',
    changedBy: userId,
    beforeState: row,
  });

  logger.info({ userId, modelId, linkId }, 'Model Studio: attribute_link deleted');
}

// ============================================================
// LIST
// ============================================================

export async function listAttributeLinksByParent(
  input: ListAttributeLinkByParentInput,
): Promise<AttributeLink[]> {
  const { userId, modelId, parentId } = input;
  await assertCanAccessModel(userId, modelId);

  const parent = await loadAttributeBrief(parentId);
  if (!parent || parent.dataModelId !== modelId) {
    throw new NotFoundError('Attribute');
  }

  const links = await db
    .select()
    .from(dataModelAttributeLinks)
    .where(eq(dataModelAttributeLinks.parentId, parentId));
  if (links.length === 0) return [];

  const childMap = await loadAttributeBriefs(links.map((l) => l.childId));
  const result: AttributeLink[] = [];
  for (const link of links) {
    const child = childMap.get(link.childId);
    if (!child) {
      logger.warn(
        { userId, modelId, linkId: link.id, missingChildId: link.childId },
        'listAttributeLinksByParent: child attribute missing — skipping',
      );
      continue;
    }
    result.push(toAttributeLink(link, parent, child));
  }
  return result;
}

export async function listAttributeLinksByChild(
  input: ListAttributeLinkByChildInput,
): Promise<AttributeLink[]> {
  const { userId, modelId, childId } = input;
  await assertCanAccessModel(userId, modelId);

  const child = await loadAttributeBrief(childId);
  if (!child || child.dataModelId !== modelId) {
    throw new NotFoundError('Attribute');
  }

  const links = await db
    .select()
    .from(dataModelAttributeLinks)
    .where(eq(dataModelAttributeLinks.childId, childId));
  if (links.length === 0) return [];

  const parentMap = await loadAttributeBriefs(links.map((l) => l.parentId));
  const result: AttributeLink[] = [];
  for (const link of links) {
    const parent = parentMap.get(link.parentId);
    if (!parent) {
      logger.warn(
        { userId, modelId, linkId: link.id, missingParentId: link.parentId },
        'listAttributeLinksByChild: parent attribute missing — skipping',
      );
      continue;
    }
    result.push(toAttributeLink(link, parent, child));
  }
  return result;
}

// ============================================================
// Private error-narrowing helpers (duplicated from layer-links for
// scope — each service owns its own narrow helpers to avoid a chatty
// utils module just for two tiny SQLSTATE readers).
// ============================================================

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
