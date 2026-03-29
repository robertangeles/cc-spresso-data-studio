import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import { config } from '../config/index.js';

export async function uploadImage(
  req: Request,
  res: Response<ApiResponse<{ url: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    if (!req.file) {
      res.status(400).json({ success: false, data: { url: '' }, error: 'No file uploaded' } as any);
      return;
    }

    const serverUrl = config.isDev
      ? `http://localhost:${config.port}`
      : process.env.SERVER_URL || `http://localhost:${config.port}`;

    const url = `${serverUrl}/uploads/${req.file.filename}`;
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}
