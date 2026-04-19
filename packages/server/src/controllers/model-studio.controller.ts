import type { Request, Response, NextFunction } from 'express';
import * as modelStudioService from '../services/model-studio.service.js';

/**
 * Step 1 controllers for Model Studio.
 * Thin pass-throughs — validate inputs, call service, format response.
 */

export async function getFlag(_req: Request, res: Response, next: NextFunction) {
  try {
    const enabled = await modelStudioService.getFlagEnabled();
    res.json({ success: true, data: { enabled } });
  } catch (err) {
    next(err);
  }
}

export async function setFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const { enabled } = req.body as { enabled: boolean };
    const updated = await modelStudioService.setFlagEnabled(enabled);
    res.json({ success: true, data: { enabled: updated } });
  } catch (err) {
    next(err);
  }
}
