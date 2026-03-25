import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as systemPromptController from '../controllers/system-prompt.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', systemPromptController.listSystemPrompts);
router.post('/', systemPromptController.createSystemPrompt);
router.get('/:id', systemPromptController.getSystemPrompt);
router.put('/:id', systemPromptController.updateSystemPrompt);
router.delete('/:id', systemPromptController.deleteSystemPrompt);

export { router as systemPromptRoutes };
