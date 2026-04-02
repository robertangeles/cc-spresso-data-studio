import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as contentController from '../controllers/content.controller.js';

const router = Router();

router.get('/channels', contentController.listChannels);

router.use(authenticate);

router.get('/', contentController.listContent);
router.post('/batch', contentController.createBatch);
router.post('/generate-multi', contentController.generateMulti);
router.post('/templates', contentController.generateTemplate);
router.get('/:id', contentController.getContent);
router.put('/:id', contentController.updateContent);
router.post('/remix', contentController.remixContent);
router.post('/scrape-url', contentController.scrapeUrlHandler);
router.post('/repurpose', contentController.repurposeContent);
router.post('/delete-batch', contentController.deleteBatch);
router.delete('/:id', contentController.deleteContent);

export { router as contentRoutes };
