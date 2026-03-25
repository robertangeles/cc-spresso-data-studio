import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import * as usageService from '../services/usage.service.js';

export async function getUsageSummary(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await usageService.getSummary(from, to);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

export async function getUsageByModel(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await usageService.getByModel(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getUsageByFlow(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await usageService.getByFlow(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getUsageByUser(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await usageService.getByUser(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getUsageTimeseries(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await usageService.getTimeseries(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getCostSuggestions(_req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const data = await usageService.getCostSuggestions();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function refreshUsageData(_req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const result = await usageService.aggregate();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listModels(_req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const models = await usageService.listDimModels();
    res.json({ success: true, data: models });
  } catch (err) {
    next(err);
  }
}

export async function updateModelPricing(req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) {
  try {
    const { id } = req.params;
    const { inputCostPerM, outputCostPerM, displayName, isActive } = req.body;
    const updated = await usageService.updateDimModel(id, { inputCostPerM, outputCostPerM, displayName, isActive });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
