import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { UnauthorizedError } from '../utils/errors.js';
import * as emailTemplateService from '../services/emailTemplate.service.js';

const router = Router();

router.use(authenticate);

// List all email templates
router.get('/', async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const templates = await emailTemplateService.listTemplates();
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
});

// Get a specific template by event type
router.get(
  '/:eventType',
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const template = await emailTemplateService.getTemplate(req.params.eventType);
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },
);

// Update a template
router.put(
  '/:eventType',
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const updated = await emailTemplateService.updateTemplate(req.params.eventType, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// Preview a template with sample data
router.post(
  '/preview',
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { subject, bodyHtml, bodyText } = req.body;
      const preview = emailTemplateService.previewTemplate(
        subject || '',
        bodyHtml || '',
        bodyText || '',
      );
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  },
);

export { router as emailTemplateRoutes };
