import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as backlogService from '../services/backlog.service.js';

export async function listItems(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { status, category } = req.query;
    const items = await backlogService.listItems(req.user.userId, {
      status: status as string | undefined,
      category: category as string | undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function getItem(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.getItem(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function createItem(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.createItem(req.body, req.user.userId);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.updateItem(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function archiveItem(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.archiveItem(req.params.id);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function vote(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.vote(req.params.id, req.user.userId, req.body.voteType);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function removeVote(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const item = await backlogService.removeVote(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}
