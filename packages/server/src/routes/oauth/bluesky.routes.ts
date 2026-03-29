import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import type { BlueskyOAuthProvider } from '../../services/oauth/bluesky.oauth.js';
import { logger } from '../../config/logger.js';

const router = Router();

// POST /oauth/bluesky/connect — authenticate with handle + app password
router.post(
  '/connect',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      const { handle, appPassword } = req.body;

      if (!handle || !appPassword) {
        res.status(400).json({
          success: false,
          data: null,
          message: 'Both handle and appPassword are required',
        } as ApiResponse<unknown>);
        return;
      }

      // Validate credentials by creating a session
      const provider = oauthService.getOAuthProvider('bluesky') as BlueskyOAuthProvider;
      const tokens = await provider.connectWithCredentials(handle, appPassword);

      // Store tokens
      await oauthService.storeTokens(req.user.userId, 'bluesky', tokens);

      logger.info(
        { userId: req.user.userId, accountName: tokens.accountName },
        'Bluesky connected',
      );

      res.json({
        success: true,
        data: {
          accountName: tokens.accountName,
          accountId: tokens.accountId,
        },
        message: 'Bluesky account connected successfully',
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /oauth/bluesky/status — check connection status
router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'bluesky');
      res.json({
        success: true,
        data: account
          ? { connected: true, accountName: account.accountName, accountId: account.accountId }
          : { connected: false },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /oauth/bluesky/disconnect — remove connection
router.post(
  '/disconnect',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { socialAccountId } = req.body;
      if (socialAccountId) {
        await oauthService.disconnectAccount(socialAccountId, req.user.userId);
      } else {
        // Legacy: disconnect first connected bluesky account
        const account = await oauthService.getConnectedAccount(req.user.userId, 'bluesky');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'Bluesky disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as blueskyOAuthRoutes };
