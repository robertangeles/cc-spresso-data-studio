import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@cc/shared';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiError>,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      statusCode: err.statusCode,
      details: err.details,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    statusCode: 500,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
