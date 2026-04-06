import { Router } from 'express';
import { createSkillSchema, updateSkillSchema, updateVisibilitySchema } from '@cc/shared';
import { authenticate, optionalAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as skillController from '../controllers/skill.controller.js';

const router = Router();

// ── Community & Trending (must be before /:idOrSlug to avoid route collision) ──
router.get('/community/trending', optionalAuth, skillController.getTrendingSkills);
router.get('/community/creator/:userId', optionalAuth, skillController.listCommunitySkills);
router.get('/community', optionalAuth, skillController.listCommunitySkills);

// ── My Workshop (authenticated) ──
router.get('/mine', authenticate, skillController.listMySkills);

// ── Import from GitHub ──
router.get('/import/available', authenticate, skillController.listImportableSkills);
router.post('/import', authenticate, skillController.importSkill);

// ── Single skill detail (optional auth for visibility check) ──
router.get('/:idOrSlug', optionalAuth, skillController.getSkill);
router.get('/:id/versions', skillController.getSkillVersions);

// ── Marketplace actions ──
router.post('/:id/fork', authenticate, skillController.forkSkill);
router.post('/:id/favorite', authenticate, skillController.toggleFavorite);
router.patch(
  '/:id/visibility',
  authenticate,
  validate(updateVisibilitySchema),
  skillController.updateVisibility,
);

// ── CRUD ──
router.post('/', authenticate, validate(createSkillSchema), skillController.createSkill);
router.put('/:id', authenticate, validate(updateSkillSchema), skillController.updateSkill);
router.delete('/:id', authenticate, skillController.deleteSkill);

export { router as skillRoutes };
