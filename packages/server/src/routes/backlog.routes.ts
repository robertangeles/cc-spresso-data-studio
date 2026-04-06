import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { requireCommunityEnabled } from '../middleware/community.middleware.js';
import * as backlogController from '../controllers/backlog.controller.js';

const router = Router();

// All backlog routes require auth + feature flag
router.use(authenticate, requireCommunityEnabled);

// ── Items ───────────────────────────────────────────────────
router.get('/items', backlogController.listItems);
router.get('/items/:id', backlogController.getItem);
router.post('/items', requireRole('Administrator'), backlogController.createItem);
router.put('/items/:id', requireRole('Administrator'), backlogController.updateItem);
router.delete('/items/:id', requireRole('Administrator'), backlogController.archiveItem);

// ── Voting ──────────────────────────────────────────────────
router.post('/items/:id/vote', backlogController.vote);
router.delete('/items/:id/vote', backlogController.removeVote);

export { router as backlogRoutes };
