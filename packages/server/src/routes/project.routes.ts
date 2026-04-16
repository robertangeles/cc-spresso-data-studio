import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as projectController from '../controllers/project.controller.js';

const router = Router();

// All project routes require authentication
router.use(authenticate);

// --- Projects ---
router.get('/', projectController.listProjects);
router.post('/', projectController.createProject);
router.get('/:projectId', projectController.getProject);
router.put('/:projectId', projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

// --- Columns ---
// Reorder MUST come before :columnId param routes to avoid conflicts
router.patch('/:projectId/columns/reorder', projectController.reorderColumns);
router.post('/:projectId/columns', projectController.addColumn);
router.put('/:projectId/columns/:columnId', projectController.updateColumn);
router.delete('/:projectId/columns/:columnId', projectController.deleteColumn);

// --- Cards ---
// Reorder MUST come before :cardId param routes to avoid conflicts
router.patch('/:projectId/cards/reorder', projectController.reorderCards);
router.post('/:projectId/cards', projectController.createCard);
router.put('/:projectId/cards/:cardId', projectController.updateCard);
router.delete('/:projectId/cards/:cardId', projectController.deleteCard);
router.patch('/:projectId/cards/:cardId/move', projectController.moveCard);

// --- Comments ---
router.get('/:projectId/cards/:cardId/comments', projectController.listComments);
router.post('/:projectId/cards/:cardId/comments', projectController.addComment);
router.put('/:projectId/cards/:cardId/comments/:commentId', projectController.updateComment);
router.delete('/:projectId/cards/:cardId/comments/:commentId', projectController.deleteComment);

// --- Attachments ---
router.get('/:projectId/cards/:cardId/attachments', projectController.listAttachments);
router.post('/:projectId/cards/:cardId/attachments', projectController.addAttachment);
router.delete(
  '/:projectId/cards/:cardId/attachments/:attachmentId',
  projectController.deleteAttachment,
);

export { router as projectRoutes };
