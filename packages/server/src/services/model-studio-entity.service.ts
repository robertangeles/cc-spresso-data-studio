import { and, asc, count, eq, or } from 'drizzle-orm';
import {
  type EntityCreate,
  type EntityListQuery,
  type EntityUpdate,
  type Layer,
  type NamingLintRule,
  lintEntityForBusinessKey,
  lintIdentifier,
} from '@cc/shared';
import { db } from '../db/index.js';
import {
  dataModelAttributes,
  dataModelEntities,
  dataModelLayerLinks,
  dataModelRelationships,
  systemPrompts,
} from '../db/schema.js';
import {
  AIRefusalError,
  ConflictError,
  DBError,
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
import { ProviderType } from '@cc/shared';

export type DataModelEntity = typeof dataModelEntities.$inferSelect;

/** What the API returns alongside a successful entity payload — gives the
 *  UI a way to render naming-lint underlines without a second round trip. */
export interface EntityWithLint extends DataModelEntity {
  lint: NamingLintRule[];
}

/** Default Claude model used for auto-describe (D5). DB-driven via
 *  system_prompts row metadata in a later step; for MVP we read the
 *  env override or fall back to the platform default. */
const DEFAULT_MODEL = process.env.MODEL_STUDIO_DEFAULT_MODEL ?? 'anthropic/claude-sonnet-4-6';

const AUTO_DESCRIBE_SLUG = 'model-studio-entity-auto-describe';
const AUTO_DESCRIBE_TIMEOUT_MS = 30_000;
const AUTO_DESCRIBE_MAX_TOKENS = 350;

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

function withLint(entity: DataModelEntity): EntityWithLint {
  return { ...entity, lint: lintIdentifier(entity.name, entity.layer as Layer) };
}

/**
 * Step 6 Direction A — full entity lint, including the
 * `lintEntityForBusinessKey` rule which needs the attribute set to
 * decide whether to fire. An extra query is tolerable here because
 * the path is only on create / update responses (not list hot-paths);
 * list callers keep using `withLint` which omits the BK rule.
 *
 * If the attribute fetch fails the BK rule is quietly dropped — a
 * degraded lint result is strictly better than a failed mutation.
 */
async function withFullLint(entity: DataModelEntity): Promise<EntityWithLint> {
  const base = lintIdentifier(entity.name, entity.layer as Layer);
  try {
    const attrs = await db
      .select({
        isPrimaryKey: dataModelAttributes.isPrimaryKey,
        dataType: dataModelAttributes.dataType,
        altKeyGroup: dataModelAttributes.altKeyGroup,
      })
      .from(dataModelAttributes)
      .where(eq(dataModelAttributes.entityId, entity.id));
    const bkLint = lintEntityForBusinessKey(
      { name: entity.name, layer: entity.layer as Layer },
      attrs,
    );
    return { ...entity, lint: [...base, ...bkLint] };
  } catch (err) {
    logger.warn(
      { err, entityId: entity.id, modelId: entity.dataModelId },
      'withFullLint: attribute fetch failed — returning base lint only',
    );
    return { ...entity, lint: base };
  }
}

function buildEmbeddingContent(entity: DataModelEntity): string {
  const parts = [entity.name];
  if (entity.businessName) parts.push(entity.businessName);
  if (entity.description) parts.push(entity.description);
  return parts.join('\n');
}

// ============================================================
// LIST
// ============================================================

export async function listEntities(
  userId: string,
  modelId: string,
  query: EntityListQuery,
): Promise<{ entities: EntityWithLint[]; total: number }> {
  await assertCanAccessModel(userId, modelId);

  const baseWhere = query.layer
    ? and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelEntities.layer, query.layer))
    : eq(dataModelEntities.dataModelId, modelId);

  const rows = await db
    .select()
    .from(dataModelEntities)
    .where(baseWhere)
    .orderBy(asc(dataModelEntities.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelEntities)
    .where(baseWhere);

  return { entities: rows.map(withLint), total: Number(total) };
}

// ============================================================
// GET ONE
// ============================================================

export async function getEntity(
  userId: string,
  modelId: string,
  entityId: string,
): Promise<EntityWithLint> {
  await assertCanAccessModel(userId, modelId);
  const [row] = await db
    .select()
    .from(dataModelEntities)
    .where(and(eq(dataModelEntities.id, entityId), eq(dataModelEntities.dataModelId, modelId)))
    .limit(1);
  if (!row) throw new NotFoundError('Entity');
  return withLint(row);
}

// ============================================================
// CREATE
// ============================================================

/**
 * Parse an existing display_id label ("E001", "E042", "E1000", …) into
 * its numeric component. Returns `0` for null / malformed values so
 * the "next" calculation below treats them as unset.
 *
 * Kept internal — the display-id allocator is only ever called from
 * `createEntity` below and the migration backfill runs once per boot
 * from a single SQL UPDATE (no race with this allocator).
 */
function parseDisplayIdNumber(label: string | null | undefined): number {
  if (!label) return 0;
  const match = /^E(\d+)$/.exec(label);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Compose the next display_id for a model given the highest existing
 * sequence number. Pads to 3 digits (`E001`, `E042`) and overflows
 * cleanly to 4+ digits (`E1000`, `E99999`) once the model grows
 * beyond 999 entities. Column is VARCHAR(20) so the ceiling is far
 * out of reach.
 */
function formatDisplayId(n: number): string {
  return `E${String(n).padStart(3, '0')}`;
}

export async function createEntity(
  userId: string,
  modelId: string,
  dto: EntityCreate,
): Promise<EntityWithLint> {
  await assertCanAccessModel(userId, modelId);

  try {
    // The display_id allocation + INSERT ride ONE transaction so two
    // concurrent `createEntity` calls on the same model can't claim
    // the same sequence number. Inside the TX we take the max
    // existing `display_id` (parsed via regex), add 1, and insert.
    // For strict serialisability we'd also need SERIALIZABLE + a
    // retry loop; at current scale the TX plus the auditable
    // `display_id` is sufficient and the UI always re-reads via GET.
    const created = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ displayId: dataModelEntities.displayId })
        .from(dataModelEntities)
        .where(eq(dataModelEntities.dataModelId, modelId));

      const maxN = existing.reduce((acc, row) => {
        const n = parseDisplayIdNumber(row.displayId);
        return n > acc ? n : acc;
      }, 0);
      const nextDisplayId = formatDisplayId(maxN + 1);

      const [row] = await tx
        .insert(dataModelEntities)
        .values({
          dataModelId: modelId,
          name: dto.name,
          businessName: dto.businessName ?? null,
          description: dto.description ?? null,
          layer: dto.layer,
          entityType: dto.entityType ?? 'standard',
          displayId: nextDisplayId,
          metadata: dto.metadata ?? {},
          tags: dto.tags ?? [],
        })
        .returning();
      return row;
    });

    await recordChange({
      dataModelId: modelId,
      objectId: created.id,
      objectType: 'entity',
      action: 'create',
      changedBy: userId,
      afterState: created,
    });

    await enqueueEmbedding({
      dataModelId: modelId,
      objectId: created.id,
      objectType: 'entity',
      content: buildEmbeddingContent(created),
    });

    logger.info(
      {
        userId,
        modelId,
        entityId: created.id,
        layer: created.layer,
        displayId: created.displayId,
      },
      'Model Studio: entity created',
    );
    // Use `withFullLint` so the response carries both the identifier
    // lint and the Direction A business-key advisory (`info` rule
    // fires only on surrogate PKs without any AK group). On create
    // there are no attributes yet, so the rule is a no-op; keeping
    // the same pathway for create + update avoids UI drift.
    return withFullLint(created);
  } catch (err) {
    logger.error({ err, userId, modelId, name: dto.name }, 'createEntity failed');
    throw new DBError('createEntity');
  }
}

// ============================================================
// UPDATE
// ============================================================

export async function updateEntity(
  userId: string,
  modelId: string,
  entityId: string,
  patch: EntityUpdate,
): Promise<EntityWithLint> {
  await assertCanAccessModel(userId, modelId);

  const before = await getEntity(userId, modelId, entityId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.businessName !== undefined) updates.businessName = patch.businessName;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.layer !== undefined) updates.layer = patch.layer;
  if (patch.entityType !== undefined) updates.entityType = patch.entityType;
  if (patch.metadata !== undefined) updates.metadata = patch.metadata;
  if (patch.tags !== undefined) updates.tags = patch.tags;

  try {
    const [updated] = await db
      .update(dataModelEntities)
      .set(updates)
      .where(and(eq(dataModelEntities.id, entityId), eq(dataModelEntities.dataModelId, modelId)))
      .returning();
    if (!updated) throw new NotFoundError('Entity');

    await recordChange({
      dataModelId: modelId,
      objectId: entityId,
      objectType: 'entity',
      action: 'update',
      changedBy: userId,
      beforeState: before,
      afterState: updated,
    });

    // Only re-embed when content actually changed.
    const contentChanged =
      patch.name !== undefined ||
      patch.businessName !== undefined ||
      patch.description !== undefined;
    if (contentChanged) {
      await enqueueEmbedding({
        dataModelId: modelId,
        objectId: entityId,
        objectType: 'entity',
        content: buildEmbeddingContent(updated),
      });
    }

    logger.info(
      { userId, modelId, entityId, fields: Object.keys(patch) },
      'Model Studio: entity updated',
    );
    // Direction A — include the BK advisory in the update response so
    // the UI can render the "add an alt-key group" info banner as
    // soon as the modeller lands back on the entity card.
    return withFullLint(updated);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, userId, modelId, entityId }, 'updateEntity failed');
    throw new DBError('updateEntity');
  }
}

// ============================================================
// DELETE — cascade-aware
// ============================================================

export interface EntityDependents {
  attributes: number;
  relationships: number;
  layerLinks: number;
}

export async function describeDependents(
  modelId: string,
  entityId: string,
): Promise<EntityDependents> {
  const [{ value: attrCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributes)
    .where(eq(dataModelAttributes.entityId, entityId));

  const [{ value: relCount } = { value: 0 }] = await db
    .select({ value: count() })
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

  const [{ value: linkCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelLayerLinks)
    .where(
      or(eq(dataModelLayerLinks.parentId, entityId), eq(dataModelLayerLinks.childId, entityId)),
    );

  return {
    attributes: Number(attrCount),
    relationships: Number(relCount),
    layerLinks: Number(linkCount),
  };
}

export async function deleteEntity(
  userId: string,
  modelId: string,
  entityId: string,
  options: { cascade: boolean },
): Promise<{ deleted: true; cascaded: EntityDependents }> {
  await assertCanAccessModel(userId, modelId);

  const before = await getEntity(userId, modelId, entityId);
  const dependents = await describeDependents(modelId, entityId);
  const hasDependents =
    dependents.attributes + dependents.relationships + dependents.layerLinks > 0;

  if (hasDependents && !options.cascade) {
    throw new ConflictError(
      `Cannot delete entity "${before.name}" — it has ${dependents.attributes} attribute(s), ${dependents.relationships} relationship(s), and ${dependents.layerLinks} layer link(s). Pass ?confirm=cascade to delete them all.`,
    );
  }

  try {
    const [deleted] = await db
      .delete(dataModelEntities)
      .where(and(eq(dataModelEntities.id, entityId), eq(dataModelEntities.dataModelId, modelId)))
      .returning({ id: dataModelEntities.id });
    if (!deleted) throw new NotFoundError('Entity');

    await recordChange({
      dataModelId: modelId,
      objectId: entityId,
      objectType: 'entity',
      action: 'delete',
      changedBy: userId,
      beforeState: { ...before, dependents, cascaded: options.cascade },
    });

    logger.info(
      { userId, modelId, entityId, cascaded: options.cascade, dependents },
      'Model Studio: entity deleted',
    );
    return { deleted: true, cascaded: dependents };
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, userId, modelId, entityId }, 'deleteEntity failed');
    throw new DBError('deleteEntity');
  }
}

// ============================================================
// AUTO-DESCRIBE (delight D5)
//
// Single Claude call. The system prompt is DB-backed (per
// feedback_no_hardcoded_prompts). The result is written into
// `description` and an embedding job is queued so the new text
// flows into RAG. Refusals + timeouts surface as typed errors so
// the controller can map to the right status.
// ============================================================

interface AutoDescribeResult {
  entity: EntityWithLint;
  description: string;
}

export async function autoDescribeEntity(
  userId: string,
  modelId: string,
  entityId: string,
  deps: {
    /** Injected for tests; defaults to the live providerRegistry. */
    completer?: typeof providerRegistry.complete;
    /** Injected for tests; defaults to a real timer. */
    timeoutMs?: number;
  } = {},
): Promise<AutoDescribeResult> {
  const completer = deps.completer ?? providerRegistry.complete.bind(providerRegistry);
  const timeoutMs = deps.timeoutMs ?? AUTO_DESCRIBE_TIMEOUT_MS;

  await assertCanAccessModel(userId, modelId);
  const entity = await getEntity(userId, modelId, entityId);

  const [prompt] = await db
    .select({ body: systemPrompts.body, isActive: systemPrompts.isActive })
    .from(systemPrompts)
    .where(eq(systemPrompts.slug, AUTO_DESCRIBE_SLUG))
    .limit(1);
  if (!prompt || !prompt.isActive) {
    throw new ValidationError({
      autoDescribe: [
        `System prompt "${AUTO_DESCRIBE_SLUG}" is missing or inactive. An admin must add it.`,
      ],
    });
  }

  const userMessage = [
    `Entity name: ${entity.name}`,
    entity.businessName ? `Business name: ${entity.businessName}` : null,
    `Layer: ${entity.layer}`,
    entity.description ? `Existing description: ${entity.description}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  let response;
  try {
    response = await Promise.race([
      completer({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: prompt.body },
          { role: 'user', content: userMessage },
        ],
        maxTokens: AUTO_DESCRIBE_MAX_TOKENS,
        temperature: 0.4,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ProviderTimeoutError(ProviderType.OPENROUTER)), timeoutMs),
      ),
    ]);
  } catch (err) {
    if (err instanceof ProviderTimeoutError) throw err;
    logger.error({ err, userId, modelId, entityId }, 'autoDescribe provider call failed');
    throw new ProviderUnavailableError(
      ProviderType.OPENROUTER,
      'Auto-describe could not reach the AI provider.',
    );
  }

  const newDescription = response.content?.trim() ?? '';
  if (looksLikeRefusal(newDescription)) {
    throw new AIRefusalError('The model declined to write a description for this entity.');
  }

  // Persist into the entity. updateEntity() handles change_log + re-embed.
  const updated = await updateEntity(userId, modelId, entityId, {
    description: newDescription,
  });

  return { entity: updated, description: newDescription };
}
