import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createRoleSchema, updateRoleSchema } from '@cc/shared';
import * as roleController from '../controllers/role.controller.js';

const router = Router();

// All role management routes require admin
router.use(authenticate);
router.use(requireRole('Administrator'));

router.get('/', roleController.listRoles);
router.get('/:id', roleController.getRole);
router.post('/', validate(createRoleSchema), roleController.createRole);
router.put('/:id', validate(updateRoleSchema), roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

export default router;
