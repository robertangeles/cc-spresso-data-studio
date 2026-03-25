import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as schedulerController from '../controllers/scheduler.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', schedulerController.listScheduled);
router.post('/', schedulerController.createScheduled);
router.get('/calendar', schedulerController.getCalendar);
router.put('/:id', schedulerController.rescheduleScheduled);
router.delete('/:id', schedulerController.cancelScheduled);

export { router as schedulerRoutes };
