import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireCommunityEnabled } from '../middleware/community.middleware.js';
import * as dmController from '../controllers/dm.controller.js';

const router = Router();

// All DM routes require auth + feature flag
router.use(authenticate, requireCommunityEnabled);

// ── Conversations ───────────────────────────────────────────
router.get('/conversations', dmController.listConversations);
router.post('/conversations', dmController.createConversation);
router.get('/conversations/:id/messages', dmController.getMessages);
router.post('/conversations/:id/messages', dmController.sendMessage);
router.put('/conversations/:id/read', dmController.markRead);

// ── Messages ────────────────────────────────────────────────
router.put('/messages/:id', dmController.editMessage);
router.delete('/messages/:id', dmController.deleteMessage);

// ── Blocks ──────────────────────────────────────────────────
router.get('/blocks', dmController.listBlocks);
router.post('/blocks', dmController.block);
router.delete('/blocks/:userId', dmController.unblock);

export { router as dmRoutes };
