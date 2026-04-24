import type { Request, Response, NextFunction } from 'express';
import type { AttributeLinkCreate, AttributeLinkListQuery } from '@cc/shared';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import * as attributeLinksService from '../services/model-studio-attribute-links.service.js';

/** Step 7 — thin pass-through controllers for attribute_links. Mirror
 *  of the layer-links controller; same validation/authz/error-mapping
 *  conventions apply. */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const body = req.body as AttributeLinkCreate;
    const created = await attributeLinksService.createAttributeLink({
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
    await attributeLinksService.deleteAttributeLink({
      userId,
      modelId: req.params.id,
      linkId: req.params.linkId,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const query = req.query as unknown as AttributeLinkListQuery;
    if (query.parentId) {
      const result = await attributeLinksService.listAttributeLinksByParent({
        userId,
        modelId: req.params.id,
        parentId: query.parentId,
      });
      res.json({ success: true, data: result });
      return;
    }
    if (query.childId) {
      const result = await attributeLinksService.listAttributeLinksByChild({
        userId,
        modelId: req.params.id,
        childId: query.childId,
      });
      res.json({ success: true, data: result });
      return;
    }
    throw new ValidationError({
      query: ['Supply exactly one of parentId or childId.'],
    });
  } catch (err) {
    next(err);
  }
}
