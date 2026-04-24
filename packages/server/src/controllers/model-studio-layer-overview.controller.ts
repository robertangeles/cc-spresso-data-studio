import type { Request, Response, NextFunction } from 'express';
import type { LayerLinkSuggestionsQuery } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as overviewService from '../services/model-studio-layer-overview.service.js';

/** Step 7 — GET /layer-coverage + GET /layer-links/suggestions. */

function requireUserId(req: Request): string {
  if (!req.user?.userId) throw new UnauthorizedError();
  return req.user.userId;
}

export async function getCoverage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const result = await overviewService.getLayerCoverage(userId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const query = req.query as unknown as LayerLinkSuggestionsQuery;
    const result = await overviewService.suggestNameMatches({
      userId,
      modelId: req.params.id,
      fromLayer: query.fromLayer,
      toLayer: query.toLayer,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
