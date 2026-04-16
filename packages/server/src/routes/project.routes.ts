import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import * as projectController from '../controllers/project.controller.js';

const router = Router();

// Multer for card attachment uploads (images + files, memory storage, 10MB cap)
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

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
// Upload endpoint: multipart/form-data with 'file' field → Cloudinary → DB record
router.post(
  '/:projectId/cards/:cardId/attachments/upload',
  attachmentUpload.single('file'),
  projectController.uploadAttachment,
);
router.delete(
  '/:projectId/cards/:cardId/attachments/:attachmentId',
  projectController.deleteAttachment,
);

// --- Members ---
router.get('/:projectId/members', projectController.listProjectMembers);
router.post('/:projectId/members', projectController.addProjectMember);
router.put('/:projectId/members/:userId', projectController.updateProjectMemberRole);
router.delete('/:projectId/members/:userId', projectController.removeProjectMember);

// --- Labels ---
router.get('/:projectId/labels', projectController.listLabels);
router.post('/:projectId/labels', projectController.createLabel);
router.put('/:projectId/labels/:labelId', projectController.updateLabel);
router.delete('/:projectId/labels/:labelId', projectController.deleteLabel);
// Card ↔ label assignment
router.post('/:projectId/cards/:cardId/labels', projectController.assignLabel);
router.delete('/:projectId/cards/:cardId/labels/:labelId', projectController.removeCardLabel);

// --- Activity Log ---
router.get('/:projectId/activities', projectController.listActivities);
router.get('/:projectId/cards/:cardId/activities', projectController.listCardActivities);

export { router as projectRoutes };
