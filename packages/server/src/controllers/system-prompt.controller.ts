import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as systemPromptService from '../services/system-prompt.service.js';

export async function listSystemPrompts(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { category } = req.query;
    const prompts = await systemPromptService.listSystemPrompts(category as string | undefined);
    res.json({ success: true, data: prompts });
  } catch (err) {
    next(err);
  }
}

export async function getSystemPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const prompt = await systemPromptService.getSystemPrompt(req.params.id);
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function createSystemPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const prompt = await systemPromptService.createSystemPrompt(req.body);
    res.status(201).json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function updateSystemPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const prompt = await systemPromptService.updateSystemPrompt(req.params.id, req.body);
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function deleteSystemPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await systemPromptService.deleteSystemPrompt(req.params.id);
    res.json({ success: true, data: null, message: 'System prompt deleted' });
  } catch (err) {
    next(err);
  }
}
