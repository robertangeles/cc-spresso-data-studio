import type { Request, Response, NextFunction } from 'express';
import type { ModelCreate, ModelListQuery, ModelUpdate } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as modelService from '../services/model-studio-model.service.js';

/**
 * Thin pass-through controllers for Model Studio model CRUD.
 * Validation happens in middleware (Zod); authz happens in service.
 */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const model = await modelService.createModel(userId, req.body as ModelCreate);
    res.status(201).json({ success: true, data: model });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const { models, total } = await modelService.listModels(
      userId,
      req.query as unknown as ModelListQuery,
    );
    res.json({ success: true, data: { models, total } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const model = await modelService.getModel(userId, req.params.id);
    res.json({ success: true, data: model });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const model = await modelService.updateModel(userId, req.params.id, req.body as ModelUpdate);
    res.json({ success: true, data: model });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    await modelService.deleteModel(userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
