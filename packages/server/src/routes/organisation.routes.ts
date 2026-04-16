import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as orgController from '../controllers/organisation.controller.js';

const router = Router();

// All organisation routes require authentication
router.use(authenticate);

// --- Invite / join ---
// NOTE: /join MUST be declared before /:orgId param routes to prevent Express
// matching "join" as an orgId value.
router.post('/join', orgController.joinOrganisation);

// --- Organisations ---
router.post('/', orgController.createOrganisation);
router.get('/', orgController.listOrganisations);
router.get('/:orgId', orgController.getOrganisation);
router.put('/:orgId', orgController.updateOrganisation);
router.delete('/:orgId', orgController.deleteOrganisation);

// --- Members ---
router.delete('/:orgId/members/:userId', orgController.removeMember);
router.put('/:orgId/members/:userId', orgController.updateMemberRole);

// --- Join key management ---
router.post('/:orgId/regenerate-key', orgController.regenerateJoinKey);

export { router as organisationRoutes };
