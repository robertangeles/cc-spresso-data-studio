import type { Request, Response, NextFunction } from 'express';
import type {
  AttributeCreate,
  AttributeReorder,
  AttributeUpdate,
  SyntheticDataRequest,
} from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as attributeService from '../services/model-studio-attribute.service.js';

/**
 * Thin pass-through controllers for Model Studio attribute CRUD,
 * reorder, and D9 synthetic data. Validation runs in middleware;
 * authz lives in the service.
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await attributeService.listAttributes(
      userId,
      req.params.id,
      req.params.entityId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const attr = await attributeService.getAttribute(
      userId,
      req.params.id,
      req.params.entityId,
      req.params.attributeId,
    );
    res.json({ success: true, data: attr });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const attr = await attributeService.createAttribute(
      userId,
      req.params.id,
      req.params.entityId,
      req.body as AttributeCreate,
    );
    res.status(201).json({ success: true, data: attr });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const attr = await attributeService.updateAttribute(
      userId,
      req.params.id,
      req.params.entityId,
      req.params.attributeId,
      req.body as AttributeUpdate,
    );
    res.json({ success: true, data: attr });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const cascade = req.query.confirm === 'cascade';
    const result = await attributeService.deleteAttribute(
      userId,
      req.params.id,
      req.params.entityId,
      req.params.attributeId,
      { cascade },
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function reorder(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const body = req.body as AttributeReorder;
    const result = await attributeService.reorderAttributes(
      userId,
      req.params.id,
      req.params.entityId,
      body.ids,
    );
    res.json({ success: true, data: { attributes: result } });
  } catch (err) {
    next(err);
  }
}

export async function syntheticData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const body = (req.body ?? {}) as SyntheticDataRequest;
    const result = await attributeService.generateSyntheticData(
      userId,
      req.params.id,
      req.params.entityId,
      body,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
