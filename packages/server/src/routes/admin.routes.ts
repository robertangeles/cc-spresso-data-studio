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
router.get('/settings/google-oauth', adminController.getGoogleOAuthConfig);
router.put('/settings/google-oauth', adminController.updateGoogleOAuthConfig);
router.post('/settings/google-oauth/test', adminController.testGoogleOAuthConnection);
router.get('/settings/cloudinary', adminController.getCloudinaryConfig);
router.put('/settings/cloudinary', adminController.updateCloudinaryConfig);
router.post('/settings/cloudinary/test', adminController.testCloudinaryConnection);
router.get('/settings/smtp', adminController.getSmtpConfig);
router.put('/settings/smtp', adminController.updateSmtpConfig);
router.post('/settings/smtp/test', adminController.testSmtpConnection);
router.get('/settings/turnstile', adminController.getTurnstileConfig);
router.put('/settings/turnstile', adminController.updateTurnstileConfig);

// Generic key-value settings (key in body)
router.put('/settings', adminController.upsertSetting);
// Single setting by key (key in URL)
router.get('/settings/:key/reveal', adminController.revealSetting);
router.get('/settings/:key', adminController.getSetting);
router.put('/settings/:key', adminController.updateSetting);

router.get('/ai-providers', adminController.getAIProviders);
router.get('/ai-providers/configured', adminController.getConfiguredModels);
router.get('/ai-providers/:id/key', adminController.getAIProviderKey);
router.put('/ai-providers/:id/key', adminController.updateAIProviderKey);

// Model catalog management
router.post('/ai-providers/sync-catalog', adminController.syncModelCatalog);
router.get('/ai-providers/catalog', adminController.getModelCatalog);
router.patch('/ai-providers/catalog/batch-toggle', adminController.batchToggleCatalogModels);
router.patch('/ai-providers/catalog/:modelId/toggle', adminController.toggleCatalogModel);

export { router as adminRoutes };
