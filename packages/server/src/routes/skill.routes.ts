import { Router } from 'express';
import { createSkillSchema, updateSkillSchema } from '@cc/shared';
import { authenticate, optionalAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as skillController from '../controllers/skill.controller.js';

const router = Router();

// Public: browse catalog (optional auth to include user's unpublished skills)
router.get('/', optionalAuth, skillController.listSkills);
router.get('/:idOrSlug', optionalAuth, skillController.getSkill);
router.get('/:id/versions', skillController.getSkillVersions);

// Import from GitHub
router.get('/import/available', authenticate, skillController.listImportableSkills);
router.post('/import', authenticate, skillController.importSkill);

// Protected: CRUD
router.post('/', authenticate, validate(createSkillSchema), skillController.createSkill);
router.put('/:id', authenticate, validate(updateSkillSchema), skillController.updateSkill);
router.delete('/:id', authenticate, skillController.deleteSkill);

export { router as skillRoutes };
