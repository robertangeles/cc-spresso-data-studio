import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// All user management routes require admin
router.use(authenticate);
router.use(requireRole('Administrator'));

router.get('/', userController.listUsers);
router.get('/:id', userController.getUser);
router.put('/:id', userController.updateUser);
router.post('/:id/block', userController.blockUser);
router.put('/:id/roles', userController.setUserRoles);
router.delete('/:id', userController.deleteUser);

export default router;
