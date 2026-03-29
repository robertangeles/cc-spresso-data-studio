import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@cc/shared';
import { authenticate } from '../../middleware/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import * as oauthService from '../../services/oauth/oauth.service.js';
import type { LinkedInOAuthProvider } from '../../services/oauth/linkedin.oauth.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

const router = Router();

// GET /oauth/linkedin/connect — redirect to LinkedIn OAuth
router.get('/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const provider = oauthService.getOAuthProvider('linkedin');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const authUrl = await provider.getAuthUrl(req.user.userId, redirectBase);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /oauth/linkedin/callback — handle LinkedIn OAuth callback
router.get('/callback', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'LinkedIn OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=linkedin`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('linkedin');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase);

    await oauthService.storeTokens(userId, 'linkedin', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'LinkedIn connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=linkedin`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'LinkedIn OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

// GET /oauth/linkedin/status
router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'linkedin');
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

// GET /oauth/linkedin/connect-page — redirect to LinkedIn OAuth for Company Pages
router.get(
  '/connect-page',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const provider = oauthService.getOAuthProvider('linkedin') as LinkedInOAuthProvider;
      const redirectBase = `${req.protocol}://${req.get('host')}`;
      const authUrl = await provider.getOrgAuthUrl(req.user.userId, redirectBase);
      res.redirect(authUrl);
    } catch (err) {
      next(err);
    }
  },
);

// GET /oauth/linkedin/callback-page — handle LinkedIn Company Page OAuth callback
router.get('/callback-page', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn({ error }, 'LinkedIn Page OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=linkedin`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('linkedin') as LinkedInOAuthProvider;
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeOrgCode(code as string, redirectBase);

    // Get admin organizations and connect each one
    const orgs = await provider.getAdminOrganizations(tokens.accessToken);

    if (orgs.length === 0) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=No%20LinkedIn%20Company%20Pages%20found`,
      );
    }

    for (const org of orgs) {
      await oauthService.storeTokens(userId, 'linkedin', {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        accountId: org.orgId,
        accountName: org.orgName,
        accountType: 'page',
      });
    }

    logger.info({ userId, orgCount: orgs.length }, 'LinkedIn Company Pages connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=linkedin`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'LinkedIn Page OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=linkedin&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

// POST /oauth/linkedin/disconnect
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
        const account = await oauthService.getConnectedAccount(req.user.userId, 'linkedin');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'LinkedIn disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as linkedinOAuthRoutes };
