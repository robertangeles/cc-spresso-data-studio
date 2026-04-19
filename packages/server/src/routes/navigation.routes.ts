import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { getSetting, updateSetting } from '../services/admin.service.js';
import { UnauthorizedError } from '../utils/errors.js';

const NAV_SETTING_KEY = 'sidebar-nav-config';

const router = Router();

router.use(authenticate);

/**
 * GET /api/navigation-config
 * Any authenticated user can read — the sidebar needs this on every login.
 * Returns `{ items: null }` if no admin has configured yet (caller falls back
 * to the client-side manifest default).
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setting = await getSetting(NAV_SETTING_KEY);
    if (!setting) {
      res.json({ success: true, data: { items: null } });
      return;
    }
    try {
      const parsed = JSON.parse(setting.value);
      res.json({ success: true, data: { items: parsed.items ?? null } });
    } catch {
      res.json({ success: true, data: { items: null } });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/navigation-config
 * Administrator only. Body: { items: [{ key, visible }, ...] }
 */
router.put(
  '/',
  requireRole('Administrator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { items } = req.body as { items?: Array<{ key: string; visible: boolean }> };
      if (!Array.isArray(items)) {
        res
          .status(400)
          .json({ success: false, error: 'items must be an array of { key, visible }' });
        return;
      }
      // Defensive shape check
      const clean = items
        .filter((i) => typeof i?.key === 'string' && typeof i?.visible === 'boolean')
        .map((i) => ({ key: i.key, visible: i.visible }));

      await updateSetting(NAV_SETTING_KEY, JSON.stringify({ items: clean }), false);
      res.json({ success: true, data: { items: clean } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as navigationRoutes };
