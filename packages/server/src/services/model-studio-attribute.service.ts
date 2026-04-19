import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import {
  type AttributeCreate,
  type AttributeUpdate,
  type Layer,
  type NamingLintRule,
  ProviderType,
  lintAttribute,
} from '@cc/shared';
import { db } from '../db/index.js';
import {
  dataModelAttributeLinks,
  dataModelAttributes,
  dataModelChangeLog,
  dataModelEntities,
  dataModelSemanticMappings,
  systemPrompts,
} from '../db/schema.js';
import {
  AIRefusalError,
  ConflictError,
  DBError,
  InvalidAIResponseError,
  NotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  ValidationError,
} from '../utils/errors.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';
import { recordChange } from './model-studio-changelog.service.js';
import { enqueueEmbedding } from './model-studio-embedding.service.js';
import { providerRegistry } from './ai/index.js';

/**
 * Step 5 — Attribute CRUD + Synthetic Data (D9).
 *
 * Attributes inherit their layer from the parent entity. The schema
 * shape (zod) is layer-independent; layer-dependent rules (physical
 * identifier safety, naming-lint) run here after fetching the entity.
 *
 * Every mutation writes to change_log and enqueues an embedding job,
 * matching the Step-4 entity service pattern.
 */

export type DataModelAttribute = typeof dataModelAttributes.$inferSelect;

/** Attribute payload plus naming-lint results so the UI can render
 *  inline underlines without a second round trip. */
export interface AttributeWithLint extends DataModelAttribute {
  lint: NamingLintRule[];
}

const DEFAULT_MODEL = process.env.MODEL_STUDIO_DEFAULT_MODEL ?? 'anthropic/claude-sonnet-4-6';

const SYNTHETIC_DATA_SLUG = 'model-studio-synthetic-data';
const SYNTHETIC_DATA_TIMEOUT_MS = 30_000;
const SYNTHETIC_DATA_MAX_TOKENS = 1_500;

const PHYSICAL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const REFUSAL_PREFIXES = [
  /^i\s*can(?:not|'t)/i,
  /^i\s*am\s*not\s*able/i,
  /^i\s*won'?t/i,
  /^sorry,?\s*(?:but\s*)?i/i,
];

function looksLikeRefusal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return REFUSAL_PREFIXES.some((rx) => rx.test(trimmed));
}

function withLint(attr: DataModelAttribute, layer: Layer): AttributeWithLint {
  return {
    ...attr,
    lint: lintAttribute(attr.name, layer, {
      dataType: attr.dataType,
      length: attr.length,
      precision: attr.precision,
      scale: attr.scale,
    }),
  };
}

function buildEmbeddingContent(attr: DataModelAttribute): string {
  const parts = [attr.name];
  if (attr.businessName) parts.push(attr.businessName);
  if (attr.description) parts.push(attr.description);
  if (attr.dataType) parts.push(`type:${attr.dataType}`);
  return parts.join('\n');
}

/** Fetch the parent entity and verify it belongs to the model. Used
 *  at the entry of every attribute operation so we can (a) get the
 *  layer for lint/validation and (b) reject requests that target an
 *  entity the user can't see. */
async function getParentEntity(modelId: string, entityId: string) {
  const [entity] = await db
    .select({
      id: dataModelEntities.id,
      dataModelId: dataModelEntities.dataModelId,
      layer: dataModelEntities.layer,
      name: dataModelEntities.name,
    })
    .from(dataModelEntities)
    .where(and(eq(dataModelEntities.id, entityId), eq(dataModelEntities.dataModelId, modelId)))
    .limit(1);
  if (!entity) throw new NotFoundError('Entity');
  return entity;
}

// ============================================================
// LIST
// ============================================================

export async function listAttributes(
  userId: string,
  modelId: string,
  entityId: string,
): Promise<{ attributes: AttributeWithLint[]; total: number }> {
  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);

  const rows = await db
    .select()
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId))
    .orderBy(asc(dataModelAttributes.ordinalPosition), asc(dataModelAttributes.createdAt));

  return {
    attributes: rows.map((r) => withLint(r, entity.layer as Layer)),
    total: rows.length,
  };
}

// ============================================================
// GET ONE
// ============================================================

export async function getAttribute(
  userId: string,
  modelId: string,
  entityId: string,
  attributeId: string,
): Promise<AttributeWithLint> {
  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);

  const [row] = await db
    .select()
    .from(dataModelAttributes)
    .where(and(eq(dataModelAttributes.id, attributeId), eq(dataModelAttributes.entityId, entityId)))
    .limit(1);
  if (!row) throw new NotFoundError('Attribute');
  return withLint(row, entity.layer as Layer);
}

// ============================================================
// CREATE
// ============================================================

export async function createAttribute(
  userId: string,
  modelId: string,
  entityId: string,
  dto: AttributeCreate,
): Promise<AttributeWithLint> {
  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);

  // Physical-layer identifier hard-reject — matches entity behaviour.
  // Zod can't run this check because the parent layer is server-side.
  if (entity.layer === 'physical' && !PHYSICAL_IDENTIFIER.test(dto.name)) {
    throw new ValidationError({
      name: [
        'Physical-layer names must start with a letter or underscore and contain only letters, digits, and underscores.',
      ],
    });
  }

  // Pre-check duplicate name to avoid a wasted insert + to return a
  // clean 409 instead of a Drizzle unique-constraint error.
  const [existing] = await db
    .select({ id: dataModelAttributes.id })
    .from(dataModelAttributes)
    .where(and(eq(dataModelAttributes.entityId, entityId), eq(dataModelAttributes.name, dto.name)))
    .limit(1);
  if (existing) {
    throw new ConflictError(`Attribute "${dto.name}" already exists on this entity.`);
  }

  // Ordinal = MAX + 1 within this entity.
  // Race note: two concurrent creates may both read MAX=N and insert
  // at N+1. The unique (entity_id, name) constraint prevents name
  // collisions; ordinal duplicates are corrected on the next reorder.
  // Acceptable for a single-user studio. If concurrent mutation
  // becomes a requirement, wrap this SELECT+INSERT in a SERIALIZABLE
  // transaction with retry-on-conflict.
  const [{ value: maxOrdinal } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId));
  const nextOrdinal = Number(maxOrdinal) + 1;

  try {
    const [created] = await db
      .insert(dataModelAttributes)
      .values({
        entityId,
        name: dto.name,
        businessName: dto.businessName ?? null,
        description: dto.description ?? null,
        dataType: dto.dataType ?? null,
        length: dto.length ?? null,
        precision: dto.precision ?? null,
        scale: dto.scale ?? null,
        isNullable: dto.isNullable ?? true,
        isPrimaryKey: dto.isPrimaryKey ?? false,
        // PK/FK mutual exclusion: a column is either a PK or an FK
        // (could in theory be both in composite-key edge cases, but
        // that's not supported in this MVP).
        isForeignKey: dto.isPrimaryKey ? false : (dto.isForeignKey ?? false),
        isUnique: dto.isUnique ?? false,
        defaultValue: dto.defaultValue ?? null,
        ordinalPosition: nextOrdinal,
        metadata: dto.metadata ?? {},
        tags: dto.tags ?? [],
      })
      .returning();

    await recordChange({
      dataModelId: modelId,
      objectId: created.id,
      objectType: 'attribute',
      action: 'create',
      changedBy: userId,
      afterState: created,
    });

    await enqueueEmbedding({
      dataModelId: modelId,
      objectId: created.id,
      objectType: 'attribute',
      content: buildEmbeddingContent(created),
    });

    logger.info(
      { userId, modelId, entityId, attributeId: created.id, dataType: created.dataType },
      'Model Studio: attribute created',
    );
    return withLint(created, entity.layer as Layer);
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ValidationError) throw err;
    logger.error({ err, userId, modelId, entityId, name: dto.name }, 'createAttribute failed');
    throw new DBError('createAttribute');
  }
}

// ============================================================
// UPDATE
// ============================================================

export async function updateAttribute(
  userId: string,
  modelId: string,
  entityId: string,
  attributeId: string,
  patch: AttributeUpdate,
): Promise<AttributeWithLint> {
  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);
  const before = await getAttribute(userId, modelId, entityId, attributeId);

  if (
    patch.name !== undefined &&
    entity.layer === 'physical' &&
    !PHYSICAL_IDENTIFIER.test(patch.name)
  ) {
    throw new ValidationError({
      name: [
        'Physical-layer names must start with a letter or underscore and contain only letters, digits, and underscores.',
      ],
    });
  }

  // Reject rename that would collide with a sibling.
  if (patch.name !== undefined && patch.name !== before.name) {
    const [sibling] = await db
      .select({ id: dataModelAttributes.id })
      .from(dataModelAttributes)
      .where(
        and(eq(dataModelAttributes.entityId, entityId), eq(dataModelAttributes.name, patch.name)),
      )
      .limit(1);
    if (sibling) {
      throw new ConflictError(`Attribute "${patch.name}" already exists on this entity.`);
    }
  }

  // PK → forces isForeignKey=false (S5-U3). The client may have sent
  // either value for isForeignKey in the same patch; PK wins.
  const effectivePatch: AttributeUpdate = { ...patch };
  if (patch.isPrimaryKey === true) {
    effectivePatch.isForeignKey = false;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (effectivePatch.name !== undefined) updates.name = effectivePatch.name;
  if (effectivePatch.businessName !== undefined) updates.businessName = effectivePatch.businessName;
  if (effectivePatch.description !== undefined) updates.description = effectivePatch.description;
  if (effectivePatch.dataType !== undefined) updates.dataType = effectivePatch.dataType;
  if (effectivePatch.length !== undefined) updates.length = effectivePatch.length;
  if (effectivePatch.precision !== undefined) updates.precision = effectivePatch.precision;
  if (effectivePatch.scale !== undefined) updates.scale = effectivePatch.scale;
  if (effectivePatch.isNullable !== undefined) updates.isNullable = effectivePatch.isNullable;
  if (effectivePatch.isPrimaryKey !== undefined) updates.isPrimaryKey = effectivePatch.isPrimaryKey;
  if (effectivePatch.isForeignKey !== undefined) updates.isForeignKey = effectivePatch.isForeignKey;
  if (effectivePatch.isUnique !== undefined) updates.isUnique = effectivePatch.isUnique;
  if (effectivePatch.defaultValue !== undefined) updates.defaultValue = effectivePatch.defaultValue;
  if (effectivePatch.metadata !== undefined) updates.metadata = effectivePatch.metadata;
  if (effectivePatch.tags !== undefined) updates.tags = effectivePatch.tags;

  try {
    const [updated] = await db
      .update(dataModelAttributes)
      .set(updates)
      .where(
        and(eq(dataModelAttributes.id, attributeId), eq(dataModelAttributes.entityId, entityId)),
      )
      .returning();
    if (!updated) throw new NotFoundError('Attribute');

    await recordChange({
      dataModelId: modelId,
      objectId: attributeId,
      objectType: 'attribute',
      action: 'update',
      changedBy: userId,
      beforeState: before,
      afterState: updated,
    });

    const contentChanged =
      effectivePatch.name !== undefined ||
      effectivePatch.businessName !== undefined ||
      effectivePatch.description !== undefined ||
      effectivePatch.dataType !== undefined;
    if (contentChanged) {
      await enqueueEmbedding({
        dataModelId: modelId,
        objectId: attributeId,
        objectType: 'attribute',
        content: buildEmbeddingContent(updated),
      });
    }

    logger.info(
      { userId, modelId, entityId, attributeId, fields: Object.keys(effectivePatch) },
      'Model Studio: attribute updated',
    );
    return withLint(updated, entity.layer as Layer);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) throw err;
    logger.error({ err, userId, modelId, entityId, attributeId }, 'updateAttribute failed');
    throw new DBError('updateAttribute');
  }
}

// ============================================================
// DELETE — cascade-aware
// ============================================================

export interface AttributeDependents {
  attributeLinks: number;
  semanticMappings: number;
}

export async function describeAttributeDependents(
  attributeId: string,
): Promise<AttributeDependents> {
  const [{ value: linkCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributeLinks)
    .where(
      // Count links in either direction: this attribute as parent or child.
      // Postgres will use the uniqueIndex for parent_id and child_id.
      eq(dataModelAttributeLinks.parentId, attributeId),
    );
  const [{ value: linkCountChild } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributeLinks)
    .where(eq(dataModelAttributeLinks.childId, attributeId));

  const [{ value: mappingCountPhys } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelSemanticMappings)
    .where(eq(dataModelSemanticMappings.physicalAttributeId, attributeId));
  const [{ value: mappingCountLog } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelSemanticMappings)
    .where(eq(dataModelSemanticMappings.logicalAttributeId, attributeId));

  return {
    attributeLinks: Number(linkCount) + Number(linkCountChild),
    semanticMappings: Number(mappingCountPhys) + Number(mappingCountLog),
  };
}

export async function deleteAttribute(
  userId: string,
  modelId: string,
  entityId: string,
  attributeId: string,
  options: { cascade: boolean },
): Promise<{ deleted: true; cascaded: AttributeDependents }> {
  await assertCanAccessModel(userId, modelId);
  await getParentEntity(modelId, entityId);
  const before = await getAttribute(userId, modelId, entityId, attributeId);

  const dependents = await describeAttributeDependents(attributeId);
  const hasDependents = dependents.attributeLinks + dependents.semanticMappings > 0;

  if (hasDependents && !options.cascade) {
    throw new ConflictError(
      `Cannot delete attribute "${before.name}" — it has ${dependents.attributeLinks} attribute link(s) and ${dependents.semanticMappings} semantic mapping(s). Pass ?confirm=cascade to delete them all.`,
    );
  }

  try {
    const [deleted] = await db
      .delete(dataModelAttributes)
      .where(
        and(eq(dataModelAttributes.id, attributeId), eq(dataModelAttributes.entityId, entityId)),
      )
      .returning({ id: dataModelAttributes.id });
    if (!deleted) throw new NotFoundError('Attribute');

    await recordChange({
      dataModelId: modelId,
      objectId: attributeId,
      objectType: 'attribute',
      action: 'delete',
      changedBy: userId,
      beforeState: { ...before, dependents, cascaded: options.cascade },
    });

    logger.info(
      { userId, modelId, entityId, attributeId, cascaded: options.cascade, dependents },
      'Model Studio: attribute deleted',
    );
    return { deleted: true, cascaded: dependents };
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) throw err;
    logger.error({ err, userId, modelId, entityId, attributeId }, 'deleteAttribute failed');
    throw new DBError('deleteAttribute');
  }
}

// ============================================================
// REORDER — dense 1..N in supplied order, atomic
// ============================================================

export async function reorderAttributes(
  userId: string,
  modelId: string,
  entityId: string,
  orderedIds: string[],
): Promise<AttributeWithLint[]> {
  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);

  if (orderedIds.length === 0) {
    throw new ValidationError({ ids: ['At least one attribute id is required.'] });
  }
  const uniqueIds = new Set(orderedIds);
  if (uniqueIds.size !== orderedIds.length) {
    throw new ValidationError({ ids: ['Duplicate attribute ids are not allowed.'] });
  }

  // Verify every id belongs to this entity AND that the list is
  // exhaustive — reordering only a subset would create sparse ordinals.
  const rows = await db
    .select({ id: dataModelAttributes.id })
    .from(dataModelAttributes)
    .where(
      and(eq(dataModelAttributes.entityId, entityId), inArray(dataModelAttributes.id, orderedIds)),
    );
  if (rows.length !== orderedIds.length) {
    throw new ValidationError({
      ids: ['One or more attribute ids do not belong to this entity.'],
    });
  }
  const [{ value: totalForEntity } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId));
  if (Number(totalForEntity) !== orderedIds.length) {
    throw new ValidationError({
      ids: ['Reorder must include every attribute currently on this entity.'],
    });
  }

  try {
    await db.transaction(async (tx) => {
      // Assign 1..N in supplied order. Use a two-pass strategy to
      // avoid temporary collisions with the existing ordinals: first
      // bump every row by a large offset, then write the final value.
      const OFFSET = 100_000;
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx
          .update(dataModelAttributes)
          .set({ ordinalPosition: i + 1 + OFFSET, updatedAt: new Date() })
          .where(eq(dataModelAttributes.id, orderedIds[i]));
      }
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx
          .update(dataModelAttributes)
          .set({ ordinalPosition: i + 1, updatedAt: new Date() })
          .where(eq(dataModelAttributes.id, orderedIds[i]));
      }
    });

    await recordChange({
      dataModelId: modelId,
      objectId: entityId,
      objectType: 'attribute_order',
      action: 'update',
      changedBy: userId,
      afterState: { orderedIds },
    });

    logger.info(
      { userId, modelId, entityId, count: orderedIds.length },
      'Model Studio: attributes reordered',
    );

    const updated = await db
      .select()
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.entityId, entityId))
      .orderBy(asc(dataModelAttributes.ordinalPosition));
    return updated.map((r) => withLint(r, entity.layer as Layer));
  } catch (err) {
    logger.error(
      { err, userId, modelId, entityId, count: orderedIds.length },
      'reorderAttributes failed',
    );
    throw new DBError('reorderAttributes');
  }
}

// ============================================================
// SYNTHETIC DATA (delight D9)
//
// LLM-generated sample rows. Ephemeral — not persisted. A single
// `recordChange` entry is written as an audit breadcrumb (count +
// model only, no rows) so usage can be traced without storing
// potentially sensitive generated content.
//
// The prompt MUST instruct Claude to use only obvious placeholders
// (e.g. @example.test emails, fake names). Even so, the clipboard
// copy on the client escapes formula-injection characters.
// ============================================================

export interface SyntheticDataResult {
  synthetic: true;
  entityId: string;
  entityName: string;
  rows: Record<string, unknown>[];
  attributeNames: string[];
  generatedAt: string;
  modelUsed: string;
}

function extractJson(text: string): unknown {
  // Claude sometimes wraps JSON in ```json fences. Strip them before parse.
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new InvalidAIResponseError(
      unfenced.slice(0, 200),
      'The synthetic data response was not valid JSON.',
    );
  }
}

export async function generateSyntheticData(
  userId: string,
  modelId: string,
  entityId: string,
  req: { count?: number } = {},
  deps: {
    completer?: typeof providerRegistry.complete;
    timeoutMs?: number;
  } = {},
): Promise<SyntheticDataResult> {
  const count = req.count ?? 10;
  const completer = deps.completer ?? providerRegistry.complete.bind(providerRegistry);
  const timeoutMs = deps.timeoutMs ?? SYNTHETIC_DATA_TIMEOUT_MS;

  await assertCanAccessModel(userId, modelId);
  const entity = await getParentEntity(modelId, entityId);

  const attrs = await db
    .select()
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId))
    .orderBy(asc(dataModelAttributes.ordinalPosition));

  if (attrs.length === 0) {
    throw new ValidationError({
      syntheticData: ['Entity has no attributes. Add at least one attribute before generating.'],
    });
  }

  const [prompt] = await db
    .select({ body: systemPrompts.body, isActive: systemPrompts.isActive })
    .from(systemPrompts)
    .where(eq(systemPrompts.slug, SYNTHETIC_DATA_SLUG))
    .limit(1);
  if (!prompt || !prompt.isActive) {
    throw new ValidationError({
      syntheticData: [
        `System prompt "${SYNTHETIC_DATA_SLUG}" is missing or inactive. An admin must add it.`,
      ],
    });
  }

  const attributeSpec = attrs.map((a) => ({
    name: a.name,
    businessName: a.businessName,
    dataType: a.dataType,
    length: a.length,
    precision: a.precision,
    scale: a.scale,
    isNullable: a.isNullable,
    isPrimaryKey: a.isPrimaryKey,
  }));

  const userMessage = [
    `Entity: ${entity.name}`,
    `Layer: ${entity.layer}`,
    `Generate exactly ${count} rows.`,
    `Attributes (JSON):`,
    JSON.stringify(attributeSpec, null, 2),
  ].join('\n');

  let response;
  try {
    response = await Promise.race([
      completer({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: prompt.body },
          { role: 'user', content: userMessage },
        ],
        maxTokens: SYNTHETIC_DATA_MAX_TOKENS,
        temperature: 0.7,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ProviderTimeoutError(ProviderType.OPENROUTER)), timeoutMs),
      ),
    ]);
  } catch (err) {
    if (err instanceof ProviderTimeoutError) throw err;
    logger.error({ err, userId, modelId, entityId }, 'syntheticData provider call failed');
    throw new ProviderUnavailableError(
      ProviderType.OPENROUTER,
      'Synthetic data could not reach the AI provider.',
    );
  }

  const raw = response.content?.trim() ?? '';
  if (looksLikeRefusal(raw)) {
    throw new AIRefusalError('The model declined to generate synthetic data for this entity.');
  }

  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) {
    throw new InvalidAIResponseError(
      JSON.stringify(parsed).slice(0, 200),
      'Synthetic data response must be a JSON array of row objects.',
    );
  }
  if (parsed.length !== count) {
    throw new InvalidAIResponseError(
      `length=${parsed.length}`,
      `Expected ${count} rows, got ${parsed.length}.`,
    );
  }

  const attributeNames = attrs.map((a) => a.name);
  for (const row of parsed) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new InvalidAIResponseError(
        JSON.stringify(row).slice(0, 200),
        'Each synthetic row must be an object.',
      );
    }
  }

  await recordChange({
    dataModelId: modelId,
    objectId: entityId,
    objectType: 'synthetic_data',
    action: 'create',
    changedBy: userId,
    afterState: {
      rowCount: parsed.length,
      modelUsed: DEFAULT_MODEL,
      promptSlug: SYNTHETIC_DATA_SLUG,
    },
  });

  logger.info(
    { userId, modelId, entityId, count: parsed.length },
    'Model Studio: synthetic data generated',
  );

  return {
    synthetic: true,
    entityId,
    entityName: entity.name,
    rows: parsed as Record<string, unknown>[],
    attributeNames,
    generatedAt: new Date().toISOString(),
    modelUsed: DEFAULT_MODEL,
  };
}

// ============================================================
// BATCH — every attribute under a model, grouped by entityId.
// Called once on canvas mount so EntityNode can render PKs on first
// paint instead of waiting for the user to click each entity.
// ============================================================

export interface AttributesByEntityResponse {
  /** Entity-id → ordered attribute list. Missing entities (e.g. no
   *  attributes yet) are simply absent from the map. */
  attributesByEntity: Record<string, AttributeWithLint[]>;
  total: number;
}

export async function listAttributesByModel(
  userId: string,
  modelId: string,
  opts: { withLint: boolean } = { withLint: false },
): Promise<AttributesByEntityResponse> {
  await assertCanAccessModel(userId, modelId);

  // JOIN once; we need entity.layer for lint evaluation (when asked)
  // and for the AttributeWithLint shape.
  const rows = await db
    .select({
      attribute: dataModelAttributes,
      entityLayer: dataModelEntities.layer,
    })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(eq(dataModelEntities.dataModelId, modelId))
    .orderBy(asc(dataModelAttributes.entityId), asc(dataModelAttributes.ordinalPosition));

  const attributesByEntity: Record<string, AttributeWithLint[]> = {};
  for (const { attribute, entityLayer } of rows) {
    const withLintOrEmpty = opts.withLint
      ? withLint(attribute, entityLayer as Layer)
      : { ...attribute, lint: [] as NamingLintRule[] };
    const list = attributesByEntity[attribute.entityId] ?? [];
    list.push(withLintOrEmpty);
    attributesByEntity[attribute.entityId] = list;
  }

  return { attributesByEntity, total: rows.length };
}

// ============================================================
// HISTORY — change-log events for a single attribute. Powers the
// Erwin-style History tab. Lazy-loaded per-attr from the client.
// ============================================================

export interface AttributeHistoryEvent {
  id: string;
  action: string;
  changedBy: string;
  beforeState: unknown;
  afterState: unknown;
  createdAt: Date;
}

export async function listAttributeHistory(
  userId: string,
  modelId: string,
  entityId: string,
  attributeId: string,
): Promise<AttributeHistoryEvent[]> {
  await assertCanAccessModel(userId, modelId);
  await getParentEntity(modelId, entityId);

  // Ensure the attribute actually belongs to this entity — protects
  // against /models/A/entities/X/attributes/Y/history where Y lives
  // under a different entity/model.
  await getAttribute(userId, modelId, entityId, attributeId);

  const rows = await db
    .select({
      id: dataModelChangeLog.id,
      action: dataModelChangeLog.action,
      changedBy: dataModelChangeLog.changedBy,
      beforeState: dataModelChangeLog.beforeState,
      afterState: dataModelChangeLog.afterState,
      createdAt: dataModelChangeLog.createdAt,
    })
    .from(dataModelChangeLog)
    .where(
      and(
        eq(dataModelChangeLog.dataModelId, modelId),
        eq(dataModelChangeLog.objectId, attributeId),
        eq(dataModelChangeLog.objectType, 'attribute'),
      ),
    )
    .orderBy(desc(dataModelChangeLog.createdAt))
    .limit(200);

  return rows;
}
