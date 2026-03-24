import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as usageController from '../controllers/usage.controller.js';

const router = Router();

// All usage endpoints require authentication
router.use(authenticate);

router.get('/summary', usageController.getUsageSummary);
router.get('/by-model', usageController.getUsageByModel);
router.get('/by-flow', usageController.getUsageByFlow);
router.get('/by-user', usageController.getUsageByUser);
router.get('/timeseries', usageController.getUsageTimeseries);
router.get('/suggestions', usageController.getCostSuggestions);
router.post('/refresh', usageController.refreshUsageData);
router.get('/models', usageController.listModels);
router.patch('/models/:id', usageController.updateModelPricing);

export default router;
