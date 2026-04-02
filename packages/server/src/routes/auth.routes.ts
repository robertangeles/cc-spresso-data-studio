import { Router } from 'express';
import { loginSchema, registerSchema } from '@cc/shared';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter, resendLimiter } from '../middleware/rate-limit.middleware.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/google/url', authController.googleAuthUrl);
router.post('/google/callback', authController.googleCallback);

// Email verification
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authenticate, resendLimiter, authController.resendVerification);
router.get('/verification-status', authenticate, authController.verificationStatus);
router.get('/captcha-config', authController.captchaConfig);

export { router as authRoutes };
