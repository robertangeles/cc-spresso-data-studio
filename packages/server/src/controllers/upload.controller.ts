import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { randomUUID } from 'crypto';
import { UnauthorizedError } from '../utils/errors.js';
import { uploadImage as cloudinaryUpload } from '../services/cloudinary.service.js';

export async function uploadImage(
  req: Request,
  res: Response<ApiResponse<{ url: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    if (!req.file) {
      res.status(400).json({ success: false, data: { url: '' }, error: 'No file uploaded' });
      return;
    }

    // Convert buffer to base64 data URI for Cloudinary
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await cloudinaryUpload(dataUri, {
      folder: 'content',
      publicId: `content_${randomUUID()}`,
    });

    res.json({ success: true, data: { url: result.url } });
  } catch (err) {
    next(err);
  }
}
