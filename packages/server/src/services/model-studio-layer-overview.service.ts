import { and, eq, inArray } from 'drizzle-orm';
import type {
  LayerCoverageCell,
  LayerCoverageResponse,
  LayerLinkSuggestion,
  LayerLinkSuggestionsResponse,
  Layer,
} from '@cc/shared';
import { db } from '../db/index.js';
import { dataModelEntities, dataModelLayerLinks } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { assertCanAccessModel } from './model-studio-authz.service.js';

/**
 * Step 7 — layer overview queries.
 *
 * Two read-only surfaces live here:
 *
 *   1. getLayerCoverage(modelId, userId) → per-entity `{c,l,p}` matrix.
 *      One query to load entities + one to load the model's layer_links,
 *      then a pure in-memory fold. Closes the N+1 gap where S7-C6
 *      coverage badges, EXP-5 overlay sort, and EXP-6 unlinked glow
 *      would each otherwise roundtrip per entity.
 *
 *   2. suggestNameMatches(modelId, userId, fromLayer, toLayer) →
 *      EXP-3 auto-link suggestions. MVP is exact-match case-insensitive;
 *      confidence is always 'high' so future fuzzy-match phases can add
 *      'medium' / 'low' without a breaking schema change.
 *
 * Read-only: no transactions, no cycle checks, no mutations. Both
 * paths go through assertCanAccessModel for authz.
 */

// ============================================================
// Pure helpers (exported for unit tests)
// ============================================================

/** Direct-coverage semantics: for each entity E on layer X,
 *    coverage[E.id][X]                = true  (self)
 *    coverage[E.id][L] for each link (E as parent, other on L)  = true
 *    coverage[E.id][L] for each link (E as child,  other on L)  = true
 *
 *  "Direct" means one hop in either direction. Chain-walking every
 *  entity's full projection graph is overkill for the UX (badge says
 *  "does this entity have ANY projection on layer X?" not "can I reach
 *  layer X via N hops?"). If Step 8 needs deeper reach, resolveChain
 *  is already there.
 *
 *  Input shape matches the two cheap SELECTs the service does: entities
 *  with (id, layer), links with (parentId, childId). The helper is
 *  pure so tests don't need a DB.
 */
export function buildCoverageMatrix(
  entities: readonly { id: string; layer: string }[],
  links: readonly { parentId: string; childId: string }[],
): Record<string, LayerCoverageCell> {
  // Map entityId → its own layer so we can resolve link endpoints
  // to a layer without another lookup.
  const entityLayerById = new Map<string, string>();
  for (const e of entities) {
    entityLayerById.set(e.id, e.layer);
  }

  // Initialise coverage — each entity's own-layer cell is true.
  const coverage: Record<string, LayerCoverageCell> = {};
  for (const e of entities) {
    const cell: LayerCoverageCell = { conceptual: false, logical: false, physical: false };
    markLayer(cell, e.layer);
    coverage[e.id] = cell;
  }

  // Walk links in both directions. If a link row survives without one
  // of its endpoints resolving (shouldn't happen under FK cascade),
  // skip — we don't mark a layer we can't name.
  for (const link of links) {
    const parentLayer = entityLayerById.get(link.parentId);
    const childLayer = entityLayerById.get(link.childId);
    if (!parentLayer || !childLayer) continue;
    const parentCell = coverage[link.parentId];
    const childCell = coverage[link.childId];
    if (parentCell) markLayer(parentCell, childLayer);
    if (childCell) markLayer(childCell, parentLayer);
  }

  return coverage;
}

function markLayer(cell: LayerCoverageCell, layer: string): void {
  if (layer === 'conceptual') cell.conceptual = true;
  else if (layer === 'logical') cell.logical = true;
  else if (layer === 'physical') cell.physical = true;
  // Unknown layers are silently ignored; schema-level check constraint
  // on `entities.layer` already guards against bogus values.
}

/** Build the EXP-3 suggestion list. MVP uses exact-match case-
 *  insensitive. The filter is a simple Map<lowercasedName, Entity>
 *  per layer — O(N) rather than the naive O(N²) pairwise scan the
 *  eng review's outside-voice flagged. */
export function buildNameMatchSuggestions(
  fromEntities: readonly { id: string; name: string }[],
  toEntities: readonly { id: string; name: string }[],
  existingLinks: readonly { parentId: string; childId: string }[],
  direction: 'forward' | 'reverse',
): LayerLinkSuggestion[] {
  // Index the "to" side by lowercased name so each "from" entity does
  // one hash lookup instead of an array scan.
  const toByName = new Map<string, { id: string; name: string }>();
  for (const t of toEntities) {
    // First-wins on duplicate names — rare but possible within a layer;
    // Step 7's exact-match suggester deliberately doesn't pick a
    // winner among duplicates, just proposes one pairing.
    const key = t.name.toLowerCase();
    if (!toByName.has(key)) toByName.set(key, t);
  }

  // Build a set of already-linked pairs using the caller's direction
  // convention so we don't suggest a link that already exists.
  const linkedPairs = new Set<string>();
  for (const link of existingLinks) {
    if (direction === 'forward') {
      linkedPairs.add(`${link.parentId}::${link.childId}`);
    } else {
      linkedPairs.add(`${link.childId}::${link.parentId}`);
    }
  }

  const suggestions: LayerLinkSuggestion[] = [];
  for (const from of fromEntities) {
    const match = toByName.get(from.name.toLowerCase());
    if (!match) continue;
    const pairKey = `${from.id}::${match.id}`;
    if (linkedPairs.has(pairKey)) continue;
    suggestions.push({
      fromEntityId: from.id,
      fromEntityName: from.name,
      toEntityId: match.id,
      toEntityName: match.name,
      confidence: 'high',
    });
  }
  return suggestions;
}

// ============================================================
// Public service methods
// ============================================================

export async function getLayerCoverage(
  userId: string,
  modelId: string,
): Promise<LayerCoverageResponse> {
  await assertCanAccessModel(userId, modelId);

  // Two simple queries — one for entities, one for links scoped to
  // this model. Links are scoped via the entity table since link rows
  // don't carry a modelId column.
  const entities = await db
    .select({
      id: dataModelEntities.id,
      layer: dataModelEntities.layer,
    })
    .from(dataModelEntities)
    .where(eq(dataModelEntities.dataModelId, modelId));

  if (entities.length === 0) {
    return { coverage: {} };
  }

  const entityIds = entities.map((e) => e.id);
  const links = await db
    .select({
      parentId: dataModelLayerLinks.parentId,
      childId: dataModelLayerLinks.childId,
    })
    .from(dataModelLayerLinks)
    .where(inArray(dataModelLayerLinks.parentId, entityIds));

  const coverage = buildCoverageMatrix(entities, links);
  logger.info(
    { userId, modelId, entityCount: entities.length, linkCount: links.length },
    'Model Studio: layer coverage fetched',
  );
  return { coverage };
}

export async function suggestNameMatches(args: {
  userId: string;
  modelId: string;
  fromLayer: Layer;
  toLayer: Layer;
}): Promise<LayerLinkSuggestionsResponse> {
  const { userId, modelId, fromLayer, toLayer } = args;
  await assertCanAccessModel(userId, modelId);

  if (fromLayer === toLayer) {
    // Zod layer rejects this in the route, but the service is a
    // narrower contract — fail cleanly if called directly too.
    return { suggestions: [] };
  }

  // Load entities on each layer in parallel. Each query is scoped to
  // the model via `dataModelId`.
  const [fromEntities, toEntities] = await Promise.all([
    db
      .select({ id: dataModelEntities.id, name: dataModelEntities.name })
      .from(dataModelEntities)
      .where(
        and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelEntities.layer, fromLayer)),
      ),
    db
      .select({ id: dataModelEntities.id, name: dataModelEntities.name })
      .from(dataModelEntities)
      .where(and(eq(dataModelEntities.dataModelId, modelId), eq(dataModelEntities.layer, toLayer))),
  ]);

  if (fromEntities.length === 0 || toEntities.length === 0) {
    return { suggestions: [] };
  }

  // Existing links scoped to fromLayer → toLayer direction. Any link
  // where the parent is on `fromLayer` and child is on `toLayer` (or
  // vice-versa — schema allows either orientation) should be excluded
  // from suggestions so we never propose a duplicate.
  const allLayerEntityIds = [...fromEntities.map((e) => e.id), ...toEntities.map((e) => e.id)];
  const existingLinks = await db
    .select({
      parentId: dataModelLayerLinks.parentId,
      childId: dataModelLayerLinks.childId,
    })
    .from(dataModelLayerLinks)
    .where(inArray(dataModelLayerLinks.parentId, allLayerEntityIds));

  const suggestions = buildNameMatchSuggestions(fromEntities, toEntities, existingLinks, 'forward');

  logger.info(
    {
      userId,
      modelId,
      fromLayer,
      toLayer,
      fromCount: fromEntities.length,
      toCount: toEntities.length,
      suggestionCount: suggestions.length,
    },
    'Model Studio: layer-link suggestions computed',
  );

  return { suggestions };
}
