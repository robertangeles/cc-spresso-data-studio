import { and, eq, inArray } from 'drizzle-orm';
import type { AttributeLink, Entity, Layer, LayerLink, ProjectEntityResponse } from '@cc/shared';
import { db } from '../db/index.js';
import {
  dataModelAttributeLinks,
  dataModelAttributes,
  dataModelEntities,
  dataModelLayerLinks,
} from '../db/schema.js';
import { ConflictError, DBError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';
import { runSerializable } from '../utils/serializable-tx.js';
import { formatDisplayId, parseDisplayIdNumber } from './model-studio-entity.service.js';

/**
 * Step 7 — auto-projection (EXP-1).
 *
 * `scaffoldEntity` creates a new entity on the target layer as a
 * projection of an existing source entity, and auto-creates the
 * layer_link + attribute_links in the SAME transaction so either the
 * whole projection lands or none of it does.
 *
 * DMBOK-aligned transformation rules:
 *
 *   conceptual → logical : SCAFFOLD shell + carry only business-key
 *                          attrs (those with a non-null altKeyGroup on
 *                          the conceptual source). dataType is cleared
 *                          so the user fills in the logical type.
 *                          attribute_links are auto-created for every
 *                          business-key attr that carries.
 *
 *   logical → physical   : CLONE entity + CLONE ALL attrs preserving
 *                          flags, classification, altKeyGroup, types,
 *                          defaults, and ordinal position.
 *                          attribute_links are auto-created for every
 *                          cloned attr.
 *
 *   conceptual → physical: REJECT with 400 — two-hop projection is not
 *                          supported in one call. Users project
 *                          conceptual→logical, then logical→physical.
 *
 * Authz: every entry point calls assertCanAccessModel. The source
 * entity must belong to `modelId`.
 *
 * Error contract:
 *   - NotFoundError     → 404 "Entity not found"
 *   - ValidationError   → 400 (same-layer, two-hop, non-physical-safe
 *                              name on source/attrs when target=physical)
 *   - ConflictError     → 409 (already projected to this layer, or
 *                              unique-violation on any insert, or
 *                              40001 after retries exhausted)
 *   - DBError           → 500 (unexpected DB failure)
 */

// ============================================================
// Inputs
// ============================================================

export interface ScaffoldEntityInput {
  userId: string;
  modelId: string;
  sourceEntityId: string;
  toLayer: Layer;
  nameOverride?: string;
}

// ============================================================
// Pure helpers (exported for unit tests)
// ============================================================

/** Minimal source-attribute shape the projection service operates on.
 *  Drizzle's `$inferSelect` includes columns the clone logic doesn't
 *  care about; narrowing keeps the helper's contract explicit and the
 *  tests cheap to construct fixtures for. */
export interface SourceAttr {
  id: string;
  name: string;
  businessName: string | null;
  description: string | null;
  dataType: string | null;
  length: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isExplicitUnique: boolean;
  defaultValue: string | null;
  classification: string | null;
  transformationLogic: string | null;
  altKeyGroup: string | null;
  ordinalPosition: number;
  metadata: unknown;
  tags: unknown;
}

const PHYSICAL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Classifies the layer transition the caller is asking for. Only two
 *  transitions are supported; everything else is a validation error.
 *  Surfaces the rejection reason for `validateProjectionRequest` to
 *  map into the right ValidationError message. */
export type ProjectionTransition =
  | { kind: 'conceptual_to_logical' }
  | { kind: 'logical_to_physical' }
  | { kind: 'invalid_same_layer' }
  | { kind: 'invalid_two_hop' } // conceptual → physical
  | { kind: 'invalid_reverse' }; // anything that goes "up" (logical→conceptual etc.)

export function classifyTransition(fromLayer: Layer, toLayer: Layer): ProjectionTransition {
  if (fromLayer === toLayer) return { kind: 'invalid_same_layer' };
  if (fromLayer === 'conceptual' && toLayer === 'logical') {
    return { kind: 'conceptual_to_logical' };
  }
  if (fromLayer === 'logical' && toLayer === 'physical') {
    return { kind: 'logical_to_physical' };
  }
  if (fromLayer === 'conceptual' && toLayer === 'physical') {
    return { kind: 'invalid_two_hop' };
  }
  // Everything else is going backward up the layer stack (e.g.
  // physical → logical) — legitimate reverse-engineering flow but
  // NOT what auto-project scaffolds. Users do manual linking for that.
  return { kind: 'invalid_reverse' };
}

/** Selects the source attrs to carry into the new entity per the
 *  DMBOK-aligned rules above. Conceptual→logical keeps only business-
 *  key attrs (non-null altKeyGroup). Logical→physical keeps all. */
export function selectAttrsToClone(
  sourceAttrs: readonly SourceAttr[],
  transition: ProjectionTransition,
): SourceAttr[] {
  if (transition.kind === 'conceptual_to_logical') {
    return sourceAttrs.filter((a) => a.altKeyGroup !== null && a.altKeyGroup !== undefined);
  }
  if (transition.kind === 'logical_to_physical') {
    return [...sourceAttrs];
  }
  // Defensive — invalid transitions should never reach this helper,
  // but returning [] keeps the callsite total without additional
  // error branching.
  return [];
}

/** Values to insert for the cloned attribute row. `name` and flags
 *  survive both transitions; types are stripped on C→L and preserved
 *  on L→P per the DMBOK spec. */
export interface DerivedAttrValues {
  name: string;
  businessName: string | null;
  description: string | null;
  dataType: string | null;
  length: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isExplicitUnique: boolean;
  defaultValue: string | null;
  classification: string | null;
  transformationLogic: string | null;
  altKeyGroup: string | null;
  ordinalPosition: number;
  metadata: unknown;
  tags: unknown;
}

export function deriveAttrValues(
  source: SourceAttr,
  transition: ProjectionTransition,
): DerivedAttrValues {
  if (transition.kind === 'conceptual_to_logical') {
    // DMBOK reframe: conceptual attrs are business-key identifiers,
    // they do NOT carry a SQL type. We clone the flags + classification
    // + altKeyGroup + metadata, but null out the type / length /
    // precision / scale / default so the modeller fills them in at the
    // logical layer.
    return {
      name: source.name,
      businessName: source.businessName,
      description: source.description,
      dataType: null,
      length: null,
      precision: null,
      scale: null,
      isNullable: source.isNullable,
      isPrimaryKey: source.isPrimaryKey,
      isForeignKey: source.isForeignKey,
      isUnique: source.isUnique,
      isExplicitUnique: source.isExplicitUnique,
      defaultValue: null, // defaults are a physical/logical concern
      classification: source.classification,
      transformationLogic: source.transformationLogic,
      altKeyGroup: source.altKeyGroup,
      ordinalPosition: source.ordinalPosition,
      metadata: source.metadata,
      tags: source.tags,
    };
  }
  if (transition.kind === 'logical_to_physical') {
    // Full clone — physical inherits every field from logical.
    return {
      name: source.name,
      businessName: source.businessName,
      description: source.description,
      dataType: source.dataType,
      length: source.length,
      precision: source.precision,
      scale: source.scale,
      isNullable: source.isNullable,
      isPrimaryKey: source.isPrimaryKey,
      isForeignKey: source.isForeignKey,
      isUnique: source.isUnique,
      isExplicitUnique: source.isExplicitUnique,
      defaultValue: source.defaultValue,
      classification: source.classification,
      transformationLogic: source.transformationLogic,
      altKeyGroup: source.altKeyGroup,
      ordinalPosition: source.ordinalPosition,
      metadata: source.metadata,
      tags: source.tags,
    };
  }
  // Unreachable in practice — validated upstream.
  throw new Error(`deriveAttrValues called with invalid transition: ${transition.kind}`);
}

/** Source-entity shape the validator works against. */
export interface SourceEntityBrief {
  id: string;
  name: string;
  layer: Layer;
  dataModelId: string;
  businessName: string | null;
  description: string | null;
  altKeyLabels: unknown;
  metadata: unknown;
  tags: unknown;
}

/** Pure validation for the projection request. Throws the right
 *  AppError subclass; caller handles wrapping + HTTP mapping. */
export function validateProjectionRequest(args: {
  modelId: string;
  sourceEntity: SourceEntityBrief | null;
  toLayer: Layer;
  nameOverride?: string;
  /** Count of existing layer_link rows where this source entity is the
   *  parent AND the child lives on `toLayer`. The caller resolves this
   *  via a join query; the validator just needs the count. */
  existingProjectionsOnTargetLayer: number;
  /** The attrs that would be cloned given the transition — used only
   *  to pre-check attribute-name physical safety on L→P before the tx
   *  is opened. Pass `[]` when attrs haven't been loaded yet. */
  attrsToValidate: readonly { name: string }[];
}): { transition: ProjectionTransition } {
  const {
    modelId,
    sourceEntity,
    toLayer,
    nameOverride,
    existingProjectionsOnTargetLayer,
    attrsToValidate,
  } = args;

  if (!sourceEntity) {
    throw new NotFoundError('Entity');
  }
  if (sourceEntity.dataModelId !== modelId) {
    // Cross-model IDOR attempt — behave identically to "not found" so
    // cross-org entity ids don't leak existence signal.
    throw new NotFoundError('Entity');
  }

  const transition = classifyTransition(sourceEntity.layer, toLayer);
  switch (transition.kind) {
    case 'invalid_same_layer':
      throw new ValidationError({
        toLayer: ['Target layer must differ from the source entity layer.'],
      });
    case 'invalid_two_hop':
      throw new ValidationError({
        toLayer: [
          'Conceptual entities cannot be projected directly to the physical layer. ' +
            'Project to logical first, then logical to physical.',
        ],
      });
    case 'invalid_reverse':
      throw new ValidationError({
        toLayer: [
          'Auto-projection only supports conceptual→logical and logical→physical transitions. ' +
            'For reverse directions (e.g. physical→logical), link existing entities manually.',
        ],
      });
    default:
      // valid — proceed
      break;
  }

  if (existingProjectionsOnTargetLayer > 0) {
    throw new ConflictError(`This entity already has a projection on the ${toLayer} layer.`);
  }

  // Physical-identifier pre-check on L→P: the entity name (or the
  // override) must be SQL-safe, and every cloned attr name must also
  // be SQL-safe. The zod layer catches nameOverride at the request
  // boundary; we re-check here for the source's own name (which zod
  // never saw) and for each cloned attr.
  if (toLayer === 'physical') {
    const targetName = nameOverride ?? sourceEntity.name;
    if (!PHYSICAL_IDENTIFIER.test(targetName)) {
      throw new ValidationError({
        nameOverride: [
          `Target entity name "${targetName}" is not a valid physical identifier. ` +
            'Supply nameOverride with letters, digits, and underscores only.',
        ],
      });
    }
    const badAttrNames = attrsToValidate.filter((a) => !PHYSICAL_IDENTIFIER.test(a.name));
    if (badAttrNames.length > 0) {
      throw new ValidationError({
        sourceAttrs: [
          `Source has ${badAttrNames.length} attribute(s) with non-physical-safe names ` +
            `(e.g. "${badAttrNames[0]!.name}"). Rename them on the logical layer before ` +
            `projecting to physical.`,
        ],
      });
    }
  }

  return { transition };
}

// ============================================================
// Orchestrator — scaffoldEntity
// ============================================================

/**
 * Create a projection of an existing entity on the target layer.
 * Inserts: new entity + cloned attrs + layer_link + attribute_links,
 * all in one SERIALIZABLE transaction with 3x retry on 40001.
 *
 * @returns `{ entity, layerLink, attributeLinks }` — the new entity
 *          enriched to match `@cc/shared` response shape. The caller
 *          (controller) wraps in the API envelope.
 */
export async function scaffoldEntity(input: ScaffoldEntityInput): Promise<ProjectEntityResponse> {
  const { userId, modelId, sourceEntityId, toLayer, nameOverride } = input;
  await assertCanAccessModel(userId, modelId);

  // Pre-flight — load source entity + attrs + check existing target
  // projections. If any reject, we never open a tx.
  const sourceRows = await db
    .select()
    .from(dataModelEntities)
    .where(eq(dataModelEntities.id, sourceEntityId))
    .limit(1);
  const sourceRow = sourceRows[0] ?? null;
  const sourceEntity: SourceEntityBrief | null = sourceRow
    ? {
        id: sourceRow.id,
        name: sourceRow.name,
        layer: sourceRow.layer as Layer,
        dataModelId: sourceRow.dataModelId,
        businessName: sourceRow.businessName,
        description: sourceRow.description,
        altKeyLabels: sourceRow.altKeyLabels,
        metadata: sourceRow.metadata,
        tags: sourceRow.tags,
      }
    : null;

  // Load source attrs up front so we can pre-validate physical-safe
  // names on L→P. The same rows feed the clone logic inside the tx.
  const sourceAttrs: SourceAttr[] = sourceRow ? await loadSourceAttrs(sourceRow.id) : [];

  // Count existing projections on target layer — a join over
  // layer_links and entities restricted to `toLayer`. Done outside
  // the tx to fail 409 fast.
  const existingProjectionsOnTargetLayer = sourceRow
    ? await countProjectionsOnLayer(sourceRow.id, toLayer)
    : 0;

  // Validate + classify. selectAttrsToClone returns the subset we'd
  // be cloning so we can pre-check physical-safety on their names
  // when toLayer=physical.
  const attrsToCheck = sourceEntity
    ? selectAttrsToClone(sourceAttrs, classifyTransition(sourceEntity.layer, toLayer))
    : [];
  const { transition } = validateProjectionRequest({
    modelId,
    sourceEntity,
    toLayer,
    nameOverride,
    existingProjectionsOnTargetLayer,
    attrsToValidate: attrsToCheck,
  });

  // All checks passed — open the SERIALIZABLE tx.
  // sourceEntity and sourceRow are guaranteed non-null past the
  // validator (it throws on null), but TS can't see through extracted
  // functions so we assert.
  const confirmedSource = sourceEntity!;
  const confirmedSourceRow = sourceRow!;

  let result: {
    entity: typeof dataModelEntities.$inferSelect;
    layerLink: typeof dataModelLayerLinks.$inferSelect;
    attributeLinks: Array<typeof dataModelAttributeLinks.$inferSelect>;
  };

  try {
    result = await runSerializable(db, async (tx) => {
      // Allocate the next displayId under the same tx so two concurrent
      // projections in the same model can't collide.
      const existingIds = await tx
        .select({ displayId: dataModelEntities.displayId })
        .from(dataModelEntities)
        .where(eq(dataModelEntities.dataModelId, modelId));
      const maxN = existingIds.reduce((acc, row) => {
        const n = parseDisplayIdNumber(row.displayId);
        return n > acc ? n : acc;
      }, 0);
      const nextDisplayId = formatDisplayId(maxN + 1);

      // Insert the new entity. DMBOK clone rules carry
      // businessName + description + altKeyLabels + metadata + tags
      // from the source; layer switches to the target.
      const [entityRow] = await tx
        .insert(dataModelEntities)
        .values({
          dataModelId: modelId,
          name: nameOverride ?? confirmedSource.name,
          businessName: confirmedSource.businessName,
          description: confirmedSource.description,
          layer: toLayer,
          entityType: confirmedSourceRow.entityType,
          displayId: nextDisplayId,
          altKeyLabels: (confirmedSource.altKeyLabels as Record<string, string> | null) ?? {},
          metadata: (confirmedSource.metadata as Record<string, unknown> | null) ?? {},
          tags: (confirmedSource.tags as string[] | null) ?? [],
        })
        .returning();
      if (!entityRow) throw new DBError('scaffoldEntity.entity');

      // Clone attrs (filtered per the transition) and insert them.
      const attrsToClone = selectAttrsToClone(sourceAttrs, transition);
      const clonedRows: Array<typeof dataModelAttributes.$inferSelect> = [];
      if (attrsToClone.length > 0) {
        const rowsToInsert = attrsToClone.map((src) => {
          const values = deriveAttrValues(src, transition);
          return {
            entityId: entityRow.id,
            name: values.name,
            businessName: values.businessName,
            description: values.description,
            dataType: values.dataType,
            length: values.length,
            precision: values.precision,
            scale: values.scale,
            isNullable: values.isNullable,
            isPrimaryKey: values.isPrimaryKey,
            isForeignKey: values.isForeignKey,
            isUnique: values.isUnique,
            isExplicitUnique: values.isExplicitUnique,
            defaultValue: values.defaultValue,
            classification: values.classification,
            transformationLogic: values.transformationLogic,
            altKeyGroup: values.altKeyGroup,
            ordinalPosition: values.ordinalPosition,
            metadata: (values.metadata as Record<string, unknown> | null) ?? {},
            tags: (values.tags as string[] | null) ?? [],
          };
        });
        const inserted = await tx.insert(dataModelAttributes).values(rowsToInsert).returning();
        clonedRows.push(...inserted);
      }

      // Insert the layer_link (source → new entity).
      const [layerLinkRow] = await tx
        .insert(dataModelLayerLinks)
        .values({
          parentId: confirmedSource.id,
          childId: entityRow.id,
          linkType: 'layer_projection',
        })
        .returning();
      if (!layerLinkRow) throw new DBError('scaffoldEntity.layerLink');

      // Insert attribute_links for every cloned attr — pair each
      // source attr with its new counterpart. Order is preserved by
      // `attrsToClone` + `clonedRows` so positional zip is safe.
      const attributeLinkRows: Array<typeof dataModelAttributeLinks.$inferSelect> = [];
      if (clonedRows.length > 0) {
        const pairs = attrsToClone.map((src, i) => ({
          parentId: src.id,
          childId: clonedRows[i]!.id,
          linkType: 'layer_projection' as const,
        }));
        const insertedLinks = await tx.insert(dataModelAttributeLinks).values(pairs).returning();
        attributeLinkRows.push(...insertedLinks);
      }

      return {
        entity: entityRow,
        layerLink: layerLinkRow,
        attributeLinks: attributeLinkRows,
      };
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
      throw new ConflictError(
        'Projection could not be saved — an entity or link with the same identity already exists.',
      );
    }
    if (isSerializationFailure(err)) {
      throw new ConflictError(
        'Projection could not be saved due to concurrent edits. Please retry.',
      );
    }
    logger.error({ err, userId, modelId, sourceEntityId, toLayer }, 'scaffoldEntity failed');
    throw new DBError('scaffoldEntity');
  }

  // Audit writes (fire-and-forget per recordChange contract). One
  // row per mutation so the audit humaniser can render them
  // independently.
  await recordChange({
    dataModelId: modelId,
    objectId: result.entity.id,
    objectType: 'entity',
    action: 'create',
    changedBy: userId,
    afterState: result.entity,
  });
  await recordChange({
    dataModelId: modelId,
    objectId: result.layerLink.id,
    objectType: 'layer_link',
    action: 'create',
    changedBy: userId,
    afterState: result.layerLink,
  });
  for (const link of result.attributeLinks) {
    await recordChange({
      dataModelId: modelId,
      objectId: link.id,
      objectType: 'attribute_link',
      action: 'create',
      changedBy: userId,
      afterState: link,
    });
  }

  logger.info(
    {
      userId,
      modelId,
      sourceEntityId,
      toLayer,
      newEntityId: result.entity.id,
      clonedAttrCount: result.attributeLinks.length,
      transition: transition.kind,
    },
    'Model Studio: projection scaffolded',
  );

  return {
    entity: toEntityResponse(result.entity),
    layerLink: toLayerLinkResponse(result.layerLink, confirmedSource, result.entity),
    attributeLinks: buildAttributeLinkResponses(
      result.attributeLinks,
      sourceAttrs,
      // Re-query the cloned attrs via source ordering so each link can
      // carry parent + child attr names. We already have the maps we
      // need from the tx result, so this is a pure in-memory enrich.
      attrsToCheck,
      confirmedSource,
      result.entity,
    ),
  };
}

// ============================================================
// Enrichment helpers (private-ish — exported types only)
// ============================================================

function toEntityResponse(row: typeof dataModelEntities.$inferSelect): Entity {
  return {
    id: row.id,
    dataModelId: row.dataModelId,
    name: row.name,
    businessName: row.businessName,
    description: row.description,
    layer: row.layer as Layer,
    entityType: row.entityType as Entity['entityType'],
    displayId: row.displayId ?? undefined,
    altKeyLabels: (row.altKeyLabels as Record<string, string>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    tags: (row.tags as string[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLayerLinkResponse(
  row: typeof dataModelLayerLinks.$inferSelect,
  parent: SourceEntityBrief,
  child: typeof dataModelEntities.$inferSelect,
): LayerLink {
  return {
    id: row.id,
    parentId: row.parentId,
    parentName: parent.name,
    parentLayer: parent.layer,
    childId: row.childId,
    childName: child.name,
    childLayer: child.layer as Layer,
    linkType: row.linkType,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Zip the returned attribute_link rows with their source + cloned
 *  attr name data so the response matches `AttributeLink[]` from
 *  `@cc/shared`. Order is preserved through `attrsToClone` above. */
function buildAttributeLinkResponses(
  linkRows: Array<typeof dataModelAttributeLinks.$inferSelect>,
  sourceAttrs: readonly SourceAttr[],
  clonedSources: readonly SourceAttr[],
  sourceEntity: SourceEntityBrief,
  newEntity: typeof dataModelEntities.$inferSelect,
): AttributeLink[] {
  const sourceById = new Map(sourceAttrs.map((a) => [a.id, a]));
  return linkRows.map((row) => {
    const parent = sourceById.get(row.parentId);
    // The cloned attr's own data isn't in sourceById (different id),
    // but we know its name matches its source's name because clone
    // logic preserves the name. Grab from clonedSources by positional
    // alignment with clonedSourceIds order.
    const sourceMatch = clonedSources.find((s) => s.id === row.parentId);
    if (!parent || !sourceMatch) {
      // Defensive — tx invariants should prevent this; if it ever
      // happens we want a stable response rather than a crash.
      return {
        id: row.id,
        parentId: row.parentId,
        parentName: parent?.name ?? '(unknown)',
        parentEntityId: sourceEntity.id,
        parentLayer: sourceEntity.layer,
        childId: row.childId,
        childName: sourceMatch?.name ?? '(unknown)',
        childEntityId: newEntity.id,
        childLayer: newEntity.layer as Layer,
        linkType: row.linkType,
        createdAt: row.createdAt.toISOString(),
      };
    }
    return {
      id: row.id,
      parentId: row.parentId,
      parentName: parent.name,
      parentEntityId: sourceEntity.id,
      parentLayer: sourceEntity.layer,
      childId: row.childId,
      childName: sourceMatch.name,
      childEntityId: newEntity.id,
      childLayer: newEntity.layer as Layer,
      linkType: row.linkType,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

// ============================================================
// DB helpers
// ============================================================

async function loadSourceAttrs(entityId: string): Promise<SourceAttr[]> {
  const rows = await db
    .select()
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    businessName: r.businessName,
    description: r.description,
    dataType: r.dataType,
    length: r.length,
    precision: r.precision,
    scale: r.scale,
    isNullable: r.isNullable,
    isPrimaryKey: r.isPrimaryKey,
    isForeignKey: r.isForeignKey,
    isUnique: r.isUnique,
    isExplicitUnique: r.isExplicitUnique,
    defaultValue: r.defaultValue,
    classification: r.classification,
    transformationLogic: r.transformationLogic,
    altKeyGroup: r.altKeyGroup,
    ordinalPosition: r.ordinalPosition,
    metadata: r.metadata,
    tags: r.tags,
  }));
}

/** Count how many existing children of `sourceEntityId` live on the
 *  given target layer. Used to enforce "one projection per layer per
 *  source" for auto-project (manual `createLink` can still produce
 *  multi-child DAGs — see the layer-links service). */
async function countProjectionsOnLayer(sourceEntityId: string, toLayer: Layer): Promise<number> {
  // Load child IDs from layer_links where the source is parent, then
  // count how many of those children are on the target layer. Small
  // result sets — no need for a raw SQL count.
  const childLinks = await db
    .select({ childId: dataModelLayerLinks.childId })
    .from(dataModelLayerLinks)
    .where(eq(dataModelLayerLinks.parentId, sourceEntityId));
  if (childLinks.length === 0) return 0;
  const childIds = childLinks.map((l) => l.childId);
  const children = await db
    .select({ id: dataModelEntities.id })
    .from(dataModelEntities)
    .where(and(inArray(dataModelEntities.id, childIds), eq(dataModelEntities.layer, toLayer)));
  return children.length;
}

// ============================================================
// Error-narrowing helpers (mirrors layer-links / attribute-links)
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
