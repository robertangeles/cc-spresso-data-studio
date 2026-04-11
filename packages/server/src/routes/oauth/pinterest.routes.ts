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
    const provider = oauthService.getOAuthProvider('pinterest');
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
      logger.warn({ error }, 'Pinterest OAuth denied by user');
      return res.redirect(`${config.clientUrl}/profile?oauth=error&platform=pinterest`);
    }

    if (!code || !state) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=pinterest&reason=missing_params`,
      );
    }

    const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(
        `${config.clientUrl}/profile?oauth=error&platform=pinterest&reason=invalid_state`,
      );
    }

    const provider = oauthService.getOAuthProvider('pinterest');
    const redirectBase = `${req.protocol}://${req.get('host')}`;
    const tokens = await provider.exchangeCode(code as string, redirectBase);

    await oauthService.storeTokens(userId, 'pinterest', tokens);

    logger.info({ userId, accountName: tokens.accountName }, 'Pinterest connected');
    res.redirect(`${config.clientUrl}/profile?oauth=success&platform=pinterest`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, message: errMsg }, 'Pinterest OAuth callback failed');
    res.redirect(
      `${config.clientUrl}/profile?oauth=error&platform=pinterest&reason=${encodeURIComponent(errMsg)}`,
    );
  }
});

router.get(
  '/status',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'pinterest');
      res.json({
        success: true,
        data: account
          ? {
              connected: true,
              accountName: account.accountName,
              accountId: account.accountId,
              metadata: account.metadata,
            }
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
      const { socialAccountId } = req.body;
      if (socialAccountId) {
        await oauthService.disconnectAccount(socialAccountId, req.user.userId);
      } else {
        const account = await oauthService.getConnectedAccount(req.user.userId, 'pinterest');
        if (account) await oauthService.disconnectAccount(account.id, req.user.userId);
      }
      res.json({ success: true, data: null, message: 'Pinterest disconnected' });
    } catch (err) {
      next(err);
    }
  },
);

// Fetch user's Pinterest boards for board selection
router.get(
  '/boards',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const account = await oauthService.getConnectedAccount(req.user.userId, 'pinterest');
      if (!account?.accessToken) {
        res
          .status(400)
          .json({ success: false, data: [], message: 'No Pinterest account connected' });
        return;
      }
      const { PinterestOAuthProvider } = await import('../../services/oauth/pinterest.oauth.js');
      const provider = new PinterestOAuthProvider();
      const boards = await provider.getBoards(account.accessToken);
      res.json({ success: true, data: boards });
    } catch (err) {
      next(err);
    }
  },
);

// Set default board for Pinterest publishing
router.put(
  '/default-board',
  authenticate,
  async (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { boardId, boardName } = req.body;
      if (!boardId) {
        res.status(400).json({ success: false, data: null, message: 'boardId is required' });
        return;
      }
      await oauthService.updateAccountMetadata(req.user.userId, 'pinterest', {
        defaultBoardId: boardId,
        defaultBoardName: boardName ?? '',
      });
      res.json({ success: true, data: { boardId, boardName }, message: 'Default board set' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as pinterestOAuthRoutes };
