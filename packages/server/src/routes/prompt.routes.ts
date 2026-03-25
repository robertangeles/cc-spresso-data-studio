import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as promptController from '../controllers/prompt.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', promptController.listPrompts);
router.post('/generate-apex', promptController.generateApex);
router.get('/:id', promptController.getPrompt);
router.post('/', promptController.createPrompt);
router.put('/:id', promptController.updatePrompt);
router.delete('/:id', promptController.deletePrompt);
router.get('/:id/versions', promptController.listPromptVersions);
router.post('/:id/revert/:version', promptController.revertPrompt);

export { router as promptRoutes };
