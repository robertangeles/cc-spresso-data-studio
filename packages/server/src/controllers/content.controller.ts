import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as contentService from '../services/content.service.js';

export async function listContent(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { channelId, status, search } = req.query;
    const items = await contentService.listContentItems({
      userId: req.user.userId,
      channelId: channelId as string | undefined,
      status: status as string | undefined,
      search: search as string | undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function getContent(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const item = await contentService.getContentItem(req.params.id, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateContent(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const item = await contentService.updateContentItem(req.params.id, req.body, req.user.userId);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function deleteContent(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await contentService.deleteContentItem(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Content deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listChannels(_req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const channels = await contentService.listChannels();
    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}
