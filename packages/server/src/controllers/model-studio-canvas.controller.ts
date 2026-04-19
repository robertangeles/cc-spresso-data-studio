import type { Request, Response, NextFunction } from 'express';
import type { Layer } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as canvasService from '../services/model-studio-canvas.service.js';

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function getState(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const layer = (req.query.layer as Layer) ?? 'conceptual';
    const state = await canvasService.getCanvasState(userId, req.params.id, layer);
    res.json({ success: true, data: state });
  } catch (err) {
    next(err);
  }
}

export async function putState(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const { layer, nodePositions, viewport } = req.body as {
      layer: Layer;
      nodePositions: Record<string, { x: number; y: number }>;
      viewport: { x: number; y: number; zoom: number };
    };
    const state = await canvasService.upsertCanvasState(userId, req.params.id, layer, {
      nodePositions,
      viewport,
    });
    res.json({ success: true, data: state });
  } catch (err) {
    next(err);
  }
}
