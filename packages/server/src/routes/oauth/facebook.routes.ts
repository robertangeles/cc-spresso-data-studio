import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

// GET /oauth/facebook/connect — redirect to Meta OAuth for Pages
router.get('/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const provider = oauthService.getOAuthProvider('facebook');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const authUrl = await provider.getAuthUrl(req.user.userId, redirectBase);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /oauth/facebook/callback — handle Meta OAuth callback
router.get('/callback', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'Facebook OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=facebook`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=facebook&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=facebook&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('facebook');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase);

    await oauthService.storeTokens(userId, 'facebook', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'Facebook Page connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=facebook`);
  } catch (err) {
    logger.error({ err }, 'Facebook OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=facebook&reason=exchange_failed`,
    );
  }
});

// GET /oauth/facebook/status
router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const accounts = await oauthService.getConnectedAccounts(req.user.userId, 'facebook');
      res.json({
        success: true,
        data:
          accounts.length > 0
            ? {
                connected: true,
                accounts: accounts.map((a) => ({
                  id: a.id,
                  accountName: a.accountName,
                  accountId: a.accountId,
                  accountType: a.accountType,
                  label: a.label,
                })),
              }
            : { connected: false },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /oauth/facebook/disconnect
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
        const account = await oauthService.getConnectedAccount(req.user.userId, 'facebook');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'Facebook disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as facebookOAuthRoutes };
