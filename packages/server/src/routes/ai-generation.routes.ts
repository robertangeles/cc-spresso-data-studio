import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { UnauthorizedError } from '../utils/errors.js';
import * as aiGenService from '../services/ai-generation.service.js';

const router = Router();

/**
 * POST /api/ai/hashtags
 * Generate platform-specific hashtag suggestions for content.
 * Body: { description: string, platform?: string }
 */
router.post('/hashtags', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { description, platform = 'tiktok' } = req.body;

    if (!description || typeof description !== 'string') {
      res.status(400).json({ success: false, error: 'description is required' });
      return;
    }

    const hashtags = await aiGenService.generateHashtags(
      req.user.userId,
      req.user.role,
      description.slice(0, 2000), // Limit input size
      platform,
    );

    res.json({ success: true, data: { hashtags } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/adapt-caption
 * Adapt a caption for a specific platform's culture and style.
 * Body: { caption: string, platform: string }
 */
router.post(
  '/adapt-caption',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { caption, platform } = req.body;

      if (!caption || typeof caption !== 'string') {
        res.status(400).json({ success: false, error: 'caption is required' });
        return;
      }
      if (!platform || typeof platform !== 'string') {
        res.status(400).json({ success: false, error: 'platform is required' });
        return;
      }

      const adaptedCaption = await aiGenService.adaptCaption(
        req.user.userId,
        req.user.role,
        caption.slice(0, 5000), // Limit input size
        platform,
      );

      res.json({ success: true, data: { adaptedCaption } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as aiGenerationRoutes };
