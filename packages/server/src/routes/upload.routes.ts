import { Router } from 'express';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import * as uploadController from '../controllers/upload.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

// Video: disk storage to avoid holding 100MB in RAM
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      cb(null, `spresso_video_${Date.now()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4, WebM, MOV, and AVI videos are allowed'));
    }
  },
});

const router = Router();

router.use(authenticate);
router.post('/image', upload.single('image'), uploadController.uploadImage);
router.post('/video', videoUpload.single('video'), uploadController.uploadVideo);

export { router as uploadRoutes };
