import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as chatService from '../services/chat.service.js';

export async function listConversations(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const conversations = await chatService.listConversations(req.user.userId);
    res.json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const conversation = await chatService.getConversation(req.params.id, req.user.userId);
    res.json({ success: true, data: conversation });
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
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { model, title } = req.body;
    const conversation = await chatService.createConversation(
      req.user.userId,
      model ?? 'claude-sonnet-4-6',
      title,
    );
    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await chatService.deleteConversation(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Conversation deleted' });
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
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { content, model, systemPrompt } = req.body;
    const result = await chatService.sendMessage(
      req.params.id,
      req.user.userId,
      content,
      model,
      systemPrompt,
      req.user.role,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
