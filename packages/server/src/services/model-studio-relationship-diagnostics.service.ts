import { and, asc, eq, sql } from 'drizzle-orm';
import type { Cardinality } from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelAttributes, dataModelEntities, dataModelRelationships } from '../db/schema.js';
import { logger } from '../config/logger.js';

/**
 * Step 6 — admin diagnostics for the relationships subsystem.
 *
 * Two exported helpers:
 *
 *   1. `findOrphanPropagatedAttrs(modelId)` — walks every attribute
 *      whose metadata points to a rel that no longer exists. This
 *      indicates a past TX that rolled back partially (impossible
 *      under 2A, but the endpoint is here as a fallback + for the
 *      9A decision). The result is a readable report the admin can
 *      use to run a clean-up.
 *
 *   2. `exportMermaidER(modelId)` — emits a Mermaid ER-diagram string
 *      for the entire model. Useful for read-only documentation,
 *      change-log attachments, and sharing in PRs / Notion.
 *
 * Both are synchronous (no LLM calls). Authorisation is the caller's
 * responsibility — these helpers are gated at the route layer to
 * org-admin roles.
 */

export interface OrphanPropagatedAttr {
  attributeId: string;
  attributeName: string;
  entityId: string;
  entityName: string;
  referencedRelId: string;
}

export async function findOrphanPropagatedAttrs(modelId: string): Promise<OrphanPropagatedAttr[]> {
  // One query: pull every attr flagged with `propagated_from_rel_id`
  // whose referenced rel does not exist. Uses a subquery rather than
  // a LEFT JOIN because the metadata lookup is a `jsonb->>` expression
  // that doesn't compose cleanly with Drizzle's join helpers.
  const rows = await db.execute(sql<OrphanPropagatedAttr>`
    SELECT
      a.id             AS "attributeId",
      a.name           AS "attributeName",
      a.entity_id      AS "entityId",
      e.name           AS "entityName",
      (a.metadata->>'propagated_from_rel_id') AS "referencedRelId"
    FROM data_model_attributes a
    INNER JOIN data_model_entities e ON e.id = a.entity_id
    WHERE e.data_model_id = ${modelId}
      AND a.metadata->>'propagated_from_rel_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM data_model_relationships r
        WHERE r.id::text = a.metadata->>'propagated_from_rel_id'
      )
  `);

  // drizzle's sql<T> result type in @0.45 returns a plain { rows } shape
  // on node-postgres. Normalise to the typed array.
  const list = (rows as unknown as { rows: OrphanPropagatedAttr[] }).rows ?? [];

  logger.info({ modelId, orphanCount: list.length }, 'relationship.diagnostics.orphans');
  return list;
}

/** Mermaid ER-diagram symbol table. Mirrors IE (crow's foot) semantics.
 *  Each cardinality maps to "lhs" (near the rel) and "rhs" (far end)
 *  fragments; `mermaidSide('one', 'lhs')` yields "||", etc. */
const MERMAID_LHS: Record<Cardinality, string> = {
  one: '||',
  zero_or_one: '|o',
  many: '}|',
  zero_or_many: '}o',
  one_or_many: '}|',
};
const MERMAID_RHS: Record<Cardinality, string> = {
  one: '||',
  zero_or_one: 'o|',
  many: '|{',
  zero_or_many: 'o{',
  one_or_many: '|{',
};

function mermaidLhs(c: string): string {
  return MERMAID_LHS[c as Cardinality] ?? '||';
}
function mermaidRhs(c: string): string {
  return MERMAID_RHS[c as Cardinality] ?? '||';
}

/** Mermaid-safe entity identifier. Replaces whitespace with underscores
 *  and strips anything outside `[A-Z0-9_]` (Mermaid's ER node-id rule).
 *  The display label is passed through a separate `["..."]` alias so
 *  the original name still appears in the diagram. */
function mermaidIdentifier(name: string): string {
  const cleaned = name.replace(/\s+/g, '_').toUpperCase();
  const stripped = cleaned.replace(/[^A-Z0-9_]/g, '');
  return stripped.length > 0 ? stripped : 'UNNAMED';
}

export interface MermaidExportResult {
  mermaid: string;
  entityCount: number;
  relationshipCount: number;
}

export async function exportMermaidER(modelId: string): Promise<MermaidExportResult> {
  const entities = await db
    .select({
      id: dataModelEntities.id,
      name: dataModelEntities.name,
    })
    .from(dataModelEntities)
    .where(eq(dataModelEntities.dataModelId, modelId))
    .orderBy(asc(dataModelEntities.name));

  const rels = await db
    .select({
      id: dataModelRelationships.id,
      name: dataModelRelationships.name,
      sourceEntityId: dataModelRelationships.sourceEntityId,
      targetEntityId: dataModelRelationships.targetEntityId,
      sourceCardinality: dataModelRelationships.sourceCardinality,
      targetCardinality: dataModelRelationships.targetCardinality,
      isIdentifying: dataModelRelationships.isIdentifying,
    })
    .from(dataModelRelationships)
    .where(eq(dataModelRelationships.dataModelId, modelId))
    .orderBy(asc(dataModelRelationships.createdAt));

  // Build an id→identifier map so the same entity emits the same label
  // on both sides of every edge. Name-collisions get numeric suffixes.
  const identByName = new Map<string, number>();
  const identById = new Map<string, string>();
  for (const e of entities) {
    const base = mermaidIdentifier(e.name);
    const n = identByName.get(base) ?? 0;
    identByName.set(base, n + 1);
    identById.set(e.id, n === 0 ? base : `${base}_${n}`);
  }

  const lines: string[] = ['erDiagram'];
  for (const e of entities) {
    const id = identById.get(e.id)!;
    // Emit entity declaration with display label if it differs.
    const labelEscaped = e.name.replace(/"/g, '\\"');
    lines.push(`  ${id}["${labelEscaped}"] {`);
    lines.push(`  }`);
  }
  for (const r of rels) {
    const srcId = identById.get(r.sourceEntityId);
    const tgtId = identById.get(r.targetEntityId);
    if (!srcId || !tgtId) continue; // dangling — not possible but defensive.
    const lineStyle = r.isIdentifying ? '--' : '..';
    const lhs = mermaidLhs(r.sourceCardinality);
    const rhs = mermaidRhs(r.targetCardinality);
    const label = (r.name ?? 'relates_to').replace(/"/g, '\\"');
    // Mermaid syntax: LHS }|--|{ RHS : "label"
    lines.push(`  ${srcId} ${lhs}${lineStyle}${rhs} ${tgtId} : "${label}"`);
  }

  const mermaid = lines.join('\n');
  logger.info(
    { modelId, entityCount: entities.length, relationshipCount: rels.length },
    'relationship.diagnostics.mermaid',
  );
  return {
    mermaid,
    entityCount: entities.length,
    relationshipCount: rels.length,
  };
}

/**
 * Sanity helper used by the admin route. Returns the counts side by
 * side so operators can decide whether to run the Mermaid export.
 */
export async function summariseDiagnostics(
  modelId: string,
): Promise<{ entityCount: number; relationshipCount: number; orphanCount: number }> {
  const [{ value: entityCount } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(dataModelEntities)
    .where(eq(dataModelEntities.dataModelId, modelId));
  const [{ value: relationshipCount } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(dataModelRelationships)
    .where(eq(dataModelRelationships.dataModelId, modelId));

  // Reuse the orphan query so counts match the detailed endpoint.
  const orphans = await findOrphanPropagatedAttrs(modelId);

  return {
    entityCount: Number(entityCount),
    relationshipCount: Number(relationshipCount),
    orphanCount: orphans.length,
  };
}

/**
 * Exported for the admin attribute-level audit: take a list of attribute
 * ids and return the subset that were propagated (have
 * `propagated_from_rel_id` in their metadata). Used by the cascade
 * delete preview to warn operators that their delete is about to
 * touch auto-generated rows.
 */
export async function listPropagatedAttrsByIds(
  modelId: string,
  attributeIds: string[],
): Promise<Array<{ id: string; relId: string }>> {
  if (attributeIds.length === 0) return [];
  const placeholders = attributeIds.map(() => '?').join(',');
  // Drizzle does not currently expose a typed way to bind an IN clause
  // to a tagged-template SQL with dynamic size, so we fall back to the
  // raw `sql.raw` pattern used elsewhere in the codebase (see
  // `model-studio-entity.service.ts`). Safe because the ids are UUIDs
  // validated by the zod schema at the route boundary.
  void placeholders; // reserved for future binding; kept for symmetry

  const rows = await db
    .select({
      id: dataModelAttributes.id,
      metadata: dataModelAttributes.metadata,
    })
    .from(dataModelAttributes)
    .innerJoin(dataModelEntities, eq(dataModelEntities.id, dataModelAttributes.entityId))
    .where(
      and(
        eq(dataModelEntities.dataModelId, modelId),
        sql`${dataModelAttributes.id} = ANY(ARRAY[${sql.raw(
          attributeIds.map((id) => `'${id}'::uuid`).join(','),
        )}])`,
      ),
    );

  return rows
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const relId = meta['propagated_from_rel_id'];
      return typeof relId === 'string' ? { id: r.id, relId } : null;
    })
    .filter((v): v is { id: string; relId: string } => v !== null);
}
