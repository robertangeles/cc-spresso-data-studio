import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as assistantController from '../controllers/assistant.controller.js';

const router = Router();
router.use(authenticate);
router.post('/chat', assistantController.chat);

export { router as assistantRoutes };
