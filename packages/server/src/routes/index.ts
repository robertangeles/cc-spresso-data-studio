import { Router } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authRoutes } from './auth.routes.js';
import { flowRoutes } from './flow.routes.js';
import { adminRoutes } from './admin.routes.js';
import { skillRoutes } from './skill.routes.js';
import { executionRoutes, executionStreamRoutes } from './execution.routes.js';
import { contentRoutes } from './content.routes.js';
import roleRoutes from './role.routes.js';
import profileRoutes from './profile.routes.js';
import { chatRoutes } from './chat.routes.js';
import usageRoutes from './usage.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: { status: 'ok' },
  };
  res.json(response);
});

router.use('/auth', authRoutes);
router.use('/flows', executionStreamRoutes); // SSE — must be before authenticated routes
router.use('/flows', flowRoutes);
router.use('/admin', adminRoutes);
router.use('/skills', skillRoutes);
router.use('/flows', executionRoutes);
router.use('/content', contentRoutes);
router.use('/roles', roleRoutes);
router.use('/profile', profileRoutes);
router.use('/chat', chatRoutes);
router.use('/admin/usage', usageRoutes);

export { router };
