import type { Request, Response, NextFunction } from 'express';
import type { TokenPayload } from '@cc/shared';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

// Extend Express Request to include user
declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // Check Authorization header first, then fall back to ?token= query param (for browser redirects)
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/** Requires the authenticated user to have one of the specified roles. Must be chained after authenticate. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}

/** Populates req.user if a valid token is present, but doesn't reject if missing. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      req.user = verifyAccessToken(token);
    }
  } catch {
    // Invalid token — just skip, don't error
  }
  next();
}
