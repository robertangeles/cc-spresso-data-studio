import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as chatController from '../controllers/chat.controller.js';

const router = Router();
router.use(authenticate);

router.get('/conversations', chatController.listConversations);
router.post('/conversations', chatController.createConversation);
router.get('/conversations/:id', chatController.getConversation);
router.delete('/conversations/:id', chatController.deleteConversation);
router.post('/conversations/:id/messages', chatController.sendMessage);

export { router as chatRoutes };
