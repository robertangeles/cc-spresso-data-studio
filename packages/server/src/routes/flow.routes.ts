import { Router } from 'express';
import { createFlowSchema, updateFlowSchema } from '@cc/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as flowController from '../controllers/flow.controller.js';

const router = Router();

// All flow routes require authentication
router.use(authenticate);

router.get('/', flowController.list);
router.get('/:id', flowController.getById);
router.post('/', validate(createFlowSchema), flowController.create);
router.put('/:id', validate(updateFlowSchema), flowController.update);
router.delete('/:id', flowController.remove);

export { router as flowRoutes };
