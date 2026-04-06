import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { requireCommunityEnabled } from '../middleware/community.middleware.js';
import * as communityController from '../controllers/community.controller.js';

const router = Router();

// All community routes require auth + feature flag
router.use(authenticate, requireCommunityEnabled);

// ── Channels ────────────────────────────────────────────────
router.get('/channels', communityController.listChannels);
router.get('/channels/:id', communityController.getChannel);
router.post('/channels', requireRole('Administrator'), communityController.createChannel);
router.put('/channels/:id', requireRole('Administrator'), communityController.updateChannel);
router.delete('/channels/:id', requireRole('Administrator'), communityController.archiveChannel);

// ── Messages ────────────────────────────────────────────────
router.get('/channels/:id/messages', communityController.getMessages);
router.post('/channels/:id/messages', communityController.sendMessage);
router.put('/messages/:id', communityController.editMessage);
router.delete('/messages/:id', communityController.deleteMessage);

// ── Reactions ───────────────────────────────────────────────
router.post('/messages/:id/reactions', communityController.addReaction);
router.delete('/messages/:id/reactions/:emoji', communityController.removeReaction);

// ── Members ─────────────────────────────────────────────────
router.post('/channels/:id/join', communityController.joinChannel);
router.put('/channels/:id/read', communityController.markRead);
router.get('/channels/:id/members', communityController.getChannelMembers);
router.get('/members', communityController.getAllCommunityUsers);

// ── Unread ──────────────────────────────────────────────────
router.get('/unread', communityController.getUnreadCounts);

export { router as communityRoutes };
