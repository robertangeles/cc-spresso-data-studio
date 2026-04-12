import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

router.get('/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const provider = oauthService.getOAuthProvider('youtube');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const authUrl = await provider.getAuthUrl(req.user.userId, redirectBase);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

router.get('/callback', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'YouTube OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=youtube`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=youtube&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=youtube&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('youtube');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase);

    await oauthService.storeTokens(userId, 'youtube', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'YouTube connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=youtube`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'YouTube OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=youtube&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'youtube');
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

router.post(
  '/disconnect',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'youtube');
      if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      res.json({ success: true, data: null, message: 'YouTube disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as youtubeOAuthRoutes };
