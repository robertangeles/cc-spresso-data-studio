import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateProfileSchema, createRuleSchema, updateRuleSchema } from '@cc/shared';
import * as profileController from '../controllers/profile.controller.js';

const router = Router();
router.use(authenticate);

// Profile
router.get('/', profileController.getProfile);
router.put('/', validate(updateProfileSchema), profileController.updateProfile);
router.put('/password', profileController.changePassword);
router.post('/avatar', profileController.uploadAvatar);

// Rules
router.get('/rules', profileController.listRules);
router.post('/rules', validate(createRuleSchema), profileController.createRule);
router.put('/rules/:id', validate(updateRuleSchema), profileController.updateRule);
router.delete('/rules/:id', profileController.deleteRule);

export default router;
