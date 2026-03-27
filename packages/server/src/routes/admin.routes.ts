import { Router } from 'express';
import { executeQuerySchema } from '@cc/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

router.use(authenticate);

router.get('/database/status', adminController.getDatabaseStatus);
router.get('/database/url', adminController.getDatabaseUrl);
router.get('/database/tables', adminController.getTableInfo);
router.post('/database/query', validate(executeQuerySchema), adminController.executeQuery);
// Specific settings routes (before generic :key route)
router.get('/settings/site', adminController.getSiteSettings);
router.put('/settings/site', adminController.updateSiteSettings);
router.get('/settings/cloudinary', adminController.getCloudinaryConfig);
router.put('/settings/cloudinary', adminController.updateCloudinaryConfig);
router.post('/settings/cloudinary/test', adminController.testCloudinaryConnection);

// Generic key-value settings (key in body)
router.put('/settings', adminController.upsertSetting);
// Single setting by key (key in URL)
router.get('/settings/:key', adminController.getSetting);
router.put('/settings/:key', adminController.updateSetting);

router.get('/ai-providers', adminController.getAIProviders);
router.get('/ai-providers/configured', adminController.getConfiguredModels);
router.get('/ai-providers/:id/key', adminController.getAIProviderKey);
router.put('/ai-providers/:id/key', adminController.updateAIProviderKey);

export { router as adminRoutes };
