import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import type { FacebookOAuthProvider } from '../../services/oauth/facebook.oauth.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

// Temporary storage for user tokens during page selection flow
const pendingUserTokens = new Map<string, { token: string; expiresAt: Date }>();

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

// GET /oauth/facebook/callback — store user token, redirect to page picker
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

    // Store user token temporarily for page selection (expires in 10 min)
    pendingUserTokens.set(userId, {
      token: tokens.accessToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    logger.info({ userId }, 'Facebook OAuth success — redirecting to page picker');
    res.redirect(`${config.clientUrl}/profile?oauth=pages&platform=facebook`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'Facebook OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=facebook&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

// GET /oauth/facebook/pages — list available pages + linked IG accounts
router.get(
  '/pages',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      const pending = pendingUserTokens.get(req.user.userId);
      if (!pending || pending.expiresAt < new Date()) {
        pendingUserTokens.delete(req.user.userId);
        res
          .status(400)
          .json({
            success: false,
            data: null,
            error: 'No pending Facebook auth. Please reconnect.',
          });
        return;
      }

      const fbProvider = oauthService.getOAuthProvider('facebook') as FacebookOAuthProvider;
      const pages = await fbProvider.getAvailablePages(pending.token);

      res.json({ success: true, data: { pages } });
    } catch (err) {
      next(err);
    }
  },
);

// POST /oauth/facebook/connect-pages — connect selected pages (+ their IG accounts)
router.post(
  '/connect-pages',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      const pending = pendingUserTokens.get(req.user.userId);
      if (!pending || pending.expiresAt < new Date()) {
        pendingUserTokens.delete(req.user.userId);
        res
          .status(400)
          .json({ success: false, data: null, error: 'Session expired. Please reconnect.' });
        return;
      }

      const { selectedPages } = req.body as {
        selectedPages: Array<{
          pageId: string;
          pageName: string;
          pageAccessToken: string;
          connectInstagram?: boolean;
          instagramAccountId?: string;
          instagramUsername?: string;
        }>;
      };

      if (!selectedPages || selectedPages.length === 0) {
        res.status(400).json({ success: false, data: null, error: 'No pages selected' });
        return;
      }

      const connected: string[] = [];

      for (const page of selectedPages) {
        // Connect Facebook Page
        await oauthService.storeTokens(req.user.userId, 'facebook', {
          accessToken: page.pageAccessToken,
          accountId: page.pageId,
          accountName: page.pageName,
          accountType: 'page',
        });
        connected.push(`Facebook: ${page.pageName}`);

        // Connect linked Instagram if selected
        if (page.connectInstagram && page.instagramAccountId) {
          await oauthService.storeTokens(req.user.userId, 'instagram', {
            accessToken: page.pageAccessToken,
            accountId: page.instagramAccountId,
            accountName: page.instagramUsername ?? page.pageName,
            accountType: 'business',
          });
          connected.push(`Instagram: @${page.instagramUsername ?? page.pageName}`);
        }
      }

      // Clean up pending token
      pendingUserTokens.delete(req.user.userId);

      logger.info({ userId: req.user.userId, connected }, 'Facebook pages connected');
      res.json({ success: true, data: { connected } });
    } catch (err) {
      next(err);
    }
  },
);

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
