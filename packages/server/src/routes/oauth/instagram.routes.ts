import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

// GET /oauth/instagram/connect — redirect to Meta OAuth
router.get('/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const provider = oauthService.getOAuthProvider('instagram');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const authUrl = await provider.getAuthUrl(req.user.userId, redirectBase);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /oauth/instagram/callback — handle Meta OAuth callback
router.get('/callback', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'Instagram OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=instagram`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=instagram&reason=missing_params`,
      );
    }

    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=instagram&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('instagram');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase);

    await oauthService.storeTokens(userId, 'instagram', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'Instagram connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=instagram`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'Instagram OAuth callback failed');
    console.error('INSTAGRAM OAUTH ERROR:', errMsg);
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=instagram&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

// GET /oauth/instagram/status — check connection status
router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'instagram');
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

// POST /oauth/instagram/disconnect
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
        const account = await oauthService.getConnectedAccount(req.user.userId, 'instagram');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'Instagram disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as instagramOAuthRoutes };
