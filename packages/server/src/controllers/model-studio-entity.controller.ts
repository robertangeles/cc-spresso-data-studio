import type { Request, Response, NextFunction } from 'express';
import type { EntityCreate, EntityListQuery, EntityUpdate } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as entityService from '../services/model-studio-entity.service.js';

/**
 * Thin pass-through controllers for Model Studio entity CRUD + auto-describe.
 * Validation runs in middleware; authz lives in the service.
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await entityService.listEntities(
      userId,
      req.params.id,
      req.query as unknown as EntityListQuery,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const entity = await entityService.createEntity(
      userId,
      req.params.id,
      req.body as EntityCreate,
    );
    res.status(201).json({ success: true, data: entity });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const entity = await entityService.getEntity(userId, req.params.id, req.params.entityId);
    res.json({ success: true, data: entity });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const entity = await entityService.updateEntity(
      userId,
      req.params.id,
      req.params.entityId,
      req.body as EntityUpdate,
    );
    res.json({ success: true, data: entity });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const cascade = req.query.confirm === 'cascade';
    const result = await entityService.deleteEntity(userId, req.params.id, req.params.entityId, {
      cascade,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function autoDescribe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await entityService.autoDescribeEntity(
      userId,
      req.params.id,
      req.params.entityId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
