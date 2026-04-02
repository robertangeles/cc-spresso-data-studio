import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import type { TwitterOAuthProvider } from '../../services/oauth/twitter.oauth.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

// GET /oauth/twitter/connect — redirect to Twitter/X OAuth 2.0 + PKCE
router.get('/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const provider = oauthService.getOAuthProvider('twitter');
    const redirectBase = config.clientUrl || `${req.protocol}://${req.get('host')}`;
    const authUrl = await provider.getAuthUrl(req.user.userId, redirectBase);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /oauth/twitter/callback — handle Twitter/X OAuth callback with PKCE
router.get('/callback', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'Twitter OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=twitter`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=twitter&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const { userId, codeVerifier } = stateData;

    if (!userId || !codeVerifier) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=twitter&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('twitter') as TwitterOAuthProvider;
    const redirectBase = config.clientUrl || `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase, codeVerifier);

    await oauthService.storeTokens(userId, 'twitter', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'Twitter/X connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=twitter`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'Twitter OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=twitter&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

// GET /oauth/twitter/status
router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'twitter');
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

// POST /oauth/twitter/disconnect
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
        const account = await oauthService.getConnectedAccount(req.user.userId, 'twitter');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'Twitter/X disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as twitterOAuthRoutes };
