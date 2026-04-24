import type { Request, Response, NextFunction } from 'express';
import type { Layer, ProjectEntityRequest } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import { resolveChain } from '../utils/link-graph.utils.js';
import { db } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { dataModelEntities, dataModelLayerLinks } from '../db/schema.js';
import * as projectionService from '../services/model-studio-projection.service.js';
import { assertCanAccessModel } from '../services/model-studio-authz.service.js';

/**
 * Step 7 — auto-project + projection-chain resolver.
 *
 * Two endpoints share this controller:
 *   POST /models/:id/entities/:entityId/project         → scaffold
 *   GET  /models/:id/entities/:entityId/projection-chain → chain resolver
 *
 * The scaffold path is a thin pass-through to
 * `projectionService.scaffoldEntity`. The chain path does its own
 * in-controller query + resolveChain call because it's a pure
 * read that doesn't warrant a dedicated service method of its own.
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function project(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const body = req.body as ProjectEntityRequest;
    const result = await projectionService.scaffoldEntity({
      userId,
      modelId: req.params.id,
      sourceEntityId: req.params.entityId,
      toLayer: body.toLayer,
      nameOverride: body.nameOverride,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /models/:id/entities/:entityId/projection-chain
 *
 * Returns the full connected component in the layer_links graph
 * containing the requested entity. Adjacency-list shape — client
 * looks up by id for breadcrumb rendering. Capped at depth 3.
 */
export async function chain(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const modelId = req.params.id;
    const entityId = req.params.entityId;

    await assertCanAccessModel(userId, modelId);

    // Load every entity in this model (we need their layers + names
    // to enrich the chain nodes) + every layer_link whose parent is
    // in the model. Link rows don't carry modelId so we scope via
    // entity ids.
    const entities = await db
      .select({
        id: dataModelEntities.id,
        name: dataModelEntities.name,
        layer: dataModelEntities.layer,
      })
      .from(dataModelEntities)
      .where(eq(dataModelEntities.dataModelId, modelId));

    // If the requested entity isn't in this model, treat as not found
    // to avoid cross-org existence leaks.
    const entityById = new Map(entities.map((e) => [e.id, e]));
    const root = entityById.get(entityId);
    if (!root) {
      res.status(404).json({ success: false, error: 'Entity not found', statusCode: 404 });
      return;
    }

    const entityIds = entities.map((e) => e.id);
    const links = entityIds.length
      ? await db
          .select({
            parentId: dataModelLayerLinks.parentId,
            childId: dataModelLayerLinks.childId,
          })
          .from(dataModelLayerLinks)
          .where(inArray(dataModelLayerLinks.parentId, entityIds))
      : [];

    const graph = resolveChain(links, entityId);

    // Enrich flat nodes with name + layer so the client doesn't need
    // a second round trip. Nodes outside the requested model are
    // filtered out (shouldn't exist given the scoping above, but
    // defence in depth).
    const nodes = graph.nodeIds
      .map((id) => {
        const entity = entityById.get(id);
        if (!entity) return null;
        return {
          entityId: id,
          entityName: entity.name,
          layer: entity.layer as Layer,
          parentIds: graph.adjacency[id]?.parentIds ?? [],
          childIds: graph.adjacency[id]?.childIds ?? [],
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);

    res.json({
      success: true,
      data: {
        rootId: entityId,
        nodes,
      },
    });
  } catch (err) {
    next(err);
  }
}
