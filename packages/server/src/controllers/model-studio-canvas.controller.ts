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
    const { layer, nodePositions, viewport, notation } = req.body as {
      layer: Layer;
      nodePositions: Record<string, { x: number; y: number }>;
      viewport: { x: number; y: number; zoom: number };
      // Optional per the shared `canvasStatePutSchema` — when the
      // client (e.g. useCanvasState drag-end save) omits it, the
      // service preserves the stored value. The hook (useNotation)
      // sends it explicitly on notation flip.
      notation?: 'ie' | 'idef1x';
    };
    const state = await canvasService.upsertCanvasState(userId, req.params.id, layer, {
      nodePositions,
      viewport,
      // Pass through as-is so `useCanvasState.save` (drag-end, omits
      // notation) leaves the stored preference alone, while
      // `useNotation.set` (flip toggle, sends notation) writes it.
      notation,
    });
    res.json({ success: true, data: state });
  } catch (err) {
    next(err);
  }
}
