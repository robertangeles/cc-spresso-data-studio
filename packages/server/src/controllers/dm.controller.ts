import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as dmService from '../services/dm.service.js';
import { blockUser, unblockUser, getBlockedUsers } from '../services/block.service.js';

export async function listConversations(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const conversations = await dmService.listConversations(req.user.userId);
    res.json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
}

export async function createConversation(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await dmService.getOrCreateConversation(req.user.userId, req.body.userId);
    res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getMessages(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { before, limit } = req.query;
    const messages = await dmService.getMessages(req.params.id, req.user.userId, {
      before: before as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function sendMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { content, attachments } = req.body;
    const message = await dmService.sendMessage(
      req.params.id,
      req.user.userId,
      content,
      attachments,
    );
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

export async function editMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const message = await dmService.editMessage(req.params.id, req.user.userId, req.body.content);
    res.json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await dmService.deleteMessage(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listBlocks(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const blocks = await getBlockedUsers(req.user.userId);
    res.json({ success: true, data: blocks });
  } catch (err) {
    next(err);
  }
}

export async function block(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await blockUser(req.user.userId, req.body.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function unblock(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await unblockUser(req.user.userId, req.params.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function markRead(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError();
    const result = await dmService.markConversationRead(req.params.id, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
