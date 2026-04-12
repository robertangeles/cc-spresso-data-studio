import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { UnauthorizedError } from '../utils/errors.js';
import * as pagesService from '../services/pages.service.js';

const router = Router();

// Public: get page by slug (no auth required)
router.get(
  '/:slug',
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      const page = await pagesService.getPageBySlug(req.params.slug);
      if (!page || !page.isPublished) {
        res.status(404).json({ success: false, data: null, message: 'Page not found' });
        return;
      }
      res.json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  },
);

// Admin: list all pages
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const pages = await pagesService.listPages();
      res.json({ success: true, data: pages });
    } catch (err) {
      next(err);
    }
  },
);

// Admin: update page
router.put(
  '/:slug',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { title, body, isPublished } = req.body;
      const page = await pagesService.updatePage(req.params.slug, { title, body, isPublished });
      if (!page) {
        res.status(404).json({ success: false, data: null, message: 'Page not found' });
        return;
      }
      res.json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  },
);

export { router as pagesRoutes };
