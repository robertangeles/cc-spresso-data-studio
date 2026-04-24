import { and, count, eq, sql } from 'drizzle-orm';
import { type Cardinality, inferCardinalityFromFlags } from '@cc/shared';
import { db } from '../db/index.js';
import {
  dataModelAttributes,
  dataModelEmbeddingJobs,
  dataModelEntities,
  dataModelRelationships,
} from '../db/schema.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';

/**
 * Step 6 — FK-graph relationship inference.
 *
 * Walks every `is_foreign_key=true` attribute in a model, resolves the
 * target PK attribute (if the author recorded `fk_target_attr_id` in
 * the attribute metadata bag), and emits a proposal per distinct
 * (source_entity, target_entity) pair. Existing relationships are
 * skipped with a warning so the UI can explain why a graph-visible
 * edge wasn't proposed.
 *
 * Mode 5A:
 *   - ≤ 2000 FK-flagged attrs → sync, returns `{ async: false, proposals, warnings }`.
 *   - > 2000 FK-flagged attrs → enqueues an `embedding_jobs` row of type
 *     `relationship_inference` (re-using the existing worker queue —
 *     no new infra) and returns `{ async: true, jobId }`.
 *
 * Heuristic constraints:
 *   - Only attrs whose metadata specifies `fk_target_attr_id` can
 *     produce a proposal. Attrs flagged FK without a target pointer
 *     are reported as warnings ("dangling FK — no target recorded").
 *   - `inferCardinalityFromFlags` (shared) makes the UQ/NN → cardinality
 *     decision. Pure so the client can preview before POST.
 */

const SYNC_THRESHOLD = 2000;

export interface InferredProposal {
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable explanation for the audit trail + UI tooltip. */
  reason: string;
}

export interface InferResultSync {
  async: false;
  proposals: InferredProposal[];
  warnings: string[];
}

export interface InferResultAsync {
  async: true;
  jobId: string;
  attrCount: number;
}

export type InferResult = InferResultSync | InferResultAsync;

interface AttrRow {
  id: string;
  entityId: string;
  name: string;
  isUnique: boolean;
  isNullable: boolean;
  metadata: Record<string, unknown> | null;
}

/** Narrow the loose metadata bag to the specific key we care about. */
function readFkTargetAttrId(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  const val = meta['fk_target_attr_id'];
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

/**
 * Main entry point. Authorises access, counts FK attrs, and either
 * runs sync inference or enqueues an async job depending on volume.
 */
export async function inferRelationshipsFromFkGraph(input: {
  userId: string;
  modelId: string;
}): Promise<InferResult> {
  const { userId, modelId } = input;
  await assertCanAccessModel(userId, modelId);

  // Count FK attrs FIRST so we can decide sync vs async without pulling
  // every row into memory on huge models. COUNT(*) uses the existing
  // `idx_data_model_attributes_entity_id` + a table scan — acceptable
  // because a model with >2000 attrs is already a special case.
  const [{ value: attrCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(
      and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelAttributes.isForeignKey, true)),
    );

  const total = Number(attrCount);

  if (total > SYNC_THRESHOLD) {
    // Async path — enqueue an embedding-jobs row tagged as an inference
    // job. The Step 10 worker (or a future dedicated worker) drains it.
    // We re-use the embedding_jobs table rather than adding a new one
    // because Step 6 is explicitly forbidden from adding new infra
    // (alignment-step6.md §"No new deps / tables").
    const [job] = await db
      .insert(dataModelEmbeddingJobs)
      .values({
        dataModelId: modelId,
        objectId: modelId,
        objectType: 'relationship_inference',
        contentDigest: `infer-${modelId}-${Date.now()}`,
        content: JSON.stringify({ requestedBy: userId, attrCount: total }),
        status: 'pending',
      })
      .returning({ id: dataModelEmbeddingJobs.id });

    logger.info({ userId, modelId, jobId: job.id, attrCount: total }, 'relationship.infer.async');
    return { async: true, jobId: job.id, attrCount: total };
  }

  // Sync path — load every FK attr + every PK attr in the model, then
  // stream proposals. Two queries beats a join because PKs are a tiny
  // subset.
  const fkRows = await db
    .select({
      id: dataModelAttributes.id,
      entityId: dataModelAttributes.entityId,
      name: dataModelAttributes.name,
      isUnique: dataModelAttributes.isUnique,
      isNullable: dataModelAttributes.isNullable,
      metadata: dataModelAttributes.metadata,
    })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(
      and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelAttributes.isForeignKey, true)),
    );

  const pkRows = await db
    .select({
      id: dataModelAttributes.id,
      entityId: dataModelAttributes.entityId,
      isPrimaryKey: dataModelAttributes.isPrimaryKey,
    })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(
      and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelAttributes.isPrimaryKey, true)),
    );
  const pkById = new Map(pkRows.map((r) => [r.id, r]));

  // Entity id → name map for the human-readable proposal reasons.
  const entityRows = await db
    .select({
      id: dataModelEntities.id,
      name: dataModelEntities.name,
    })
    .from(dataModelEntities)
    .where(eq(dataModelEntities.dataModelId, modelId));
  const entityNameById = new Map(entityRows.map((r) => [r.id, r.name]));

  // Existing (source, target) pairs so we can skip duplicates cleanly.
  const existing = await db
    .select({
      source: dataModelRelationships.sourceEntityId,
      target: dataModelRelationships.targetEntityId,
    })
    .from(dataModelRelationships)
    .where(eq(dataModelRelationships.dataModelId, modelId));
  const existingPairs = new Set(existing.map((e) => `${e.source}::${e.target}`));

  const proposals: InferredProposal[] = [];
  const warnings: string[] = [];
  const seenPair = new Set<string>();

  for (const fk of fkRows as AttrRow[]) {
    const targetAttrId = readFkTargetAttrId(fk.metadata);
    if (!targetAttrId) {
      warnings.push(
        `Attribute "${fk.name}" is flagged FK but has no fk_target_attr_id in metadata — skipped.`,
      );
      continue;
    }
    const targetPk = pkById.get(targetAttrId);
    if (!targetPk) {
      warnings.push(`Attribute "${fk.name}" points to an attr that is not a PK — skipped.`);
      continue;
    }
    const targetEntityId = targetPk.entityId;

    const pairKey = `${fk.entityId}::${targetEntityId}`;
    if (existingPairs.has(pairKey)) {
      warnings.push(
        `Relationship from ${entityNameById.get(fk.entityId) ?? '?'} to ${entityNameById.get(targetEntityId) ?? '?'} already exists — skipped.`,
      );
      continue;
    }
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);

    const inferred = inferCardinalityFromFlags({
      isFk: true,
      isUq: fk.isUnique,
      isNn: !fk.isNullable,
      targetIsPk: true,
    });
    if (!inferred) continue;

    proposals.push({
      sourceEntityId: fk.entityId,
      sourceEntityName: entityNameById.get(fk.entityId) ?? '',
      targetEntityId,
      targetEntityName: entityNameById.get(targetEntityId) ?? '',
      sourceCardinality: inferred.source,
      targetCardinality: inferred.target,
      confidence: inferred.confidence,
      reason: `Inferred from FK attribute "${fk.name}" (${fk.isNullable ? 'nullable' : 'not null'}, ${fk.isUnique ? 'unique' : 'non-unique'}).`,
    });
  }

  logger.info(
    {
      userId,
      modelId,
      attrCount: total,
      proposalCount: proposals.length,
      warningCount: warnings.length,
    },
    'relationship.infer.sync',
  );
  return { async: false, proposals, warnings };
}

/**
 * Admin-facing helper used by the diagnostics endpoint to preview how
 * many FK attrs live in a model without running inference.
 */
export async function countModelFkAttributes(modelId: string): Promise<number> {
  const [{ value } = { value: 0 }] = await db
    .select({ value: count() })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(
      and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelAttributes.isForeignKey, true)),
    );
  return Number(value);
}

/**
 * Exports the sql helper so tests can inject fixtures without reaching
 * into the private module graph. Kept at module scope so it tree-shakes
 * cleanly when unused.
 */
export const __sqlHelper = sql;
