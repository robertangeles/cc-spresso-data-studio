import { Router } from 'express';
import { loginSchema, registerSchema } from '@cc/shared';
import { validate } from '../middleware/validate.middleware.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

export { router as authRoutes };
