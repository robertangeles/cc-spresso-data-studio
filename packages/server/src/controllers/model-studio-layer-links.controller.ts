import type { Request, Response, NextFunction } from 'express';
import type { LayerLinkCreate, LayerLinkListQuery } from '@cc/shared';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import * as layerLinksService from '../services/model-studio-layer-links.service.js';

/**
 * Step 7 — thin pass-through controllers for entity-level layer_links.
 *
 * Validation runs in middleware (the `@cc/shared` zod schemas), authz
 * lives in the service (`assertCanAccessModel`), and error-to-HTTP
 * mapping is done by the global errorHandler (each thrown class
 * already carries its own status code).
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const body = req.body as LayerLinkCreate;
    const created = await layerLinksService.createLink({
      userId,
      modelId: req.params.id,
      parentId: body.parentId,
      childId: body.childId,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    await layerLinksService.deleteLink({
      userId,
      modelId: req.params.id,
      linkId: req.params.linkId,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /models/:id/layer-links?parentId=… OR ?childId=…
 *
 * The shared `layerLinkListQuerySchema` already refines that exactly
 * one of `parentId` / `childId` is supplied, so reaching this handler
 * means we have one. We branch on which is present and call the
 * matching service method.
 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const query = req.query as unknown as LayerLinkListQuery;
    if (query.parentId) {
      const result = await layerLinksService.listByParent({
        userId,
        modelId: req.params.id,
        parentId: query.parentId,
      });
      res.json({ success: true, data: result });
      return;
    }
    if (query.childId) {
      const result = await layerLinksService.listByChild({
        userId,
        modelId: req.params.id,
        childId: query.childId,
      });
      res.json({ success: true, data: result });
      return;
    }
    // Defence in depth — the zod refine should prevent reaching here,
    // but the type narrowing doesn't know that. Fail explicitly so
    // tests and curl don't see silent empty-list responses.
    throw new ValidationError({
      query: ['Supply exactly one of parentId or childId.'],
    });
  } catch (err) {
    next(err);
  }
}
