import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as schedulerService from '../services/scheduler.service.js';

export async function listScheduled(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const posts = await schedulerService.listScheduledPosts(req.user.userId);
    res.json({ success: true, data: posts });
  } catch (err) {
    next(err);
  }
}

export async function createScheduled(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { contentItemId, channelId, scheduledAt } = req.body;
    const post = await schedulerService.schedulePost({
      userId: req.user.userId,
      contentItemId,
      channelId,
      scheduledAt,
    });
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
}

export async function cancelScheduled(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const post = await schedulerService.cancelScheduledPost(req.params.id, req.user.userId);
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
}

export async function rescheduleScheduled(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const post = await schedulerService.reschedulePost(req.params.id, req.body.scheduledAt, req.user.userId);
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
}

export async function getCalendar(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { start, end } = req.query;
    const posts = await schedulerService.getCalendarPosts(
      req.user.userId,
      start as string,
      end as string,
    );
    res.json({ success: true, data: posts });
  } catch (err) {
    next(err);
  }
}
