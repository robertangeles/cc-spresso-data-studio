import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as promptService from '../services/prompt.service.js';

export async function listPrompts(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const category = req.query.category as string | undefined;
    const prompts = await promptService.listPrompts(req.user.userId, category);
    res.json({ success: true, data: prompts });
  } catch (err) {
    next(err);
  }
}

export async function getPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const prompt = await promptService.getPromptWithVersions(req.params.id, req.user.userId);
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function createPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { name, description, body, defaultModel, category } = req.body;
    const prompt = await promptService.createPrompt({
      userId: req.user.userId,
      name,
      description,
      body,
      defaultModel,
      category,
    });
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function updatePrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const prompt = await promptService.updatePrompt(req.params.id, req.body, req.user.userId);
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function deletePrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await promptService.deletePrompt(req.params.id, req.user.userId);
    res.json({ success: true, data: null, message: 'Prompt deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listPromptVersions(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const versions = await promptService.listPromptVersions(req.params.id, req.user.userId);
    res.json({ success: true, data: versions });
  } catch (err) {
    next(err);
  }
}

export async function revertPrompt(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const version = parseInt(req.params.version, 10);
    const prompt = await promptService.revertPrompt(req.params.id, version, req.user.userId);
    res.json({ success: true, data: prompt });
  } catch (err) {
    next(err);
  }
}

export async function generateApex(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');

    const { persona, useCase, constraints, outputFormat, targetAudience, model } = req.body;

    if (!persona || !useCase || !outputFormat || !targetAudience) {
      return res.status(400).json({ success: false, data: null, message: 'Missing required fields: persona, useCase, outputFormat, targetAudience' });
    }

    const result = await promptService.generateApexPrompt({
      persona,
      useCase,
      constraints: constraints || [],
      outputFormat,
      targetAudience,
      model,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
