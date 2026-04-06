import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { logger } from '../../config/logger.js';

interface BlueskySessionResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  error?: string;
  message?: string;
}

const BLUESKY_API = 'https://bsky.social/xrpc';

export class BlueskyOAuthProvider implements OAuthProvider {
  platform = 'bluesky';

  async getAuthUrl(_userId: string, _redirectBase: string): Promise<string> {
    throw new Error('Bluesky does not use OAuth redirects. Use connectWithCredentials() instead.');
  }

  async exchangeCode(_code: string, _redirectBase: string): Promise<OAuthTokens> {
    throw new Error(
      'Bluesky does not use OAuth code exchange. Use connectWithCredentials() instead.',
    );
  }

  /**
   * Authenticate with Bluesky using handle + app password.
   * Calls com.atproto.server.createSession to validate credentials.
   */
  async connectWithCredentials(handle: string, appPassword: string): Promise<OAuthTokens> {
    const res = await fetch(`${BLUESKY_API}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    });

    const data = (await res.json()) as BlueskySessionResponse;

    if (!res.ok || data.error) {
      const message = data.message || data.error || 'Failed to authenticate with Bluesky';
      logger.error({ error: data.error, message }, 'Bluesky createSession failed');
      throw new Error(message);
    }

    return {
      accessToken: data.accessJwt,
      refreshToken: data.refreshJwt,
      accountId: data.did,
      accountName: data.handle,
    };
  }

  /**
   * Refresh an expired access token using the refresh JWT.
   */
  async refreshToken(currentRefreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(`${BLUESKY_API}/com.atproto.server.refreshSession`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentRefreshToken}` },
    });

    const data = (await res.json()) as BlueskySessionResponse;

    if (!res.ok || data.error) {
      logger.error({ error: data.error }, 'Bluesky token refresh failed');
      throw new Error(data.message || 'Bluesky token refresh failed');
    }

    return {
      accessToken: data.accessJwt,
      refreshToken: data.refreshJwt,
      accountId: data.did,
      accountName: data.handle,
    };
  }

  /**
   * Fetch the authenticated user's profile from Bluesky.
   */
  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch(`${BLUESKY_API}/app.bsky.actor.getProfile?actor=self`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = (await res.json()) as BlueskySessionResponse;

    if (!res.ok || data.error) {
      logger.error({ error: data.error }, 'Bluesky getProfile failed');
      throw new Error(data.message || 'Failed to fetch Bluesky profile');
    }

    return {
      accountId: data.did,
      accountName: data.handle,
    };
  }

  /**
   * Revoke access by deleting the current session.
   */
  async revokeAccess(accessToken: string): Promise<void> {
    try {
      await fetch(`${BLUESKY_API}/com.atproto.server.deleteSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      logger.info('Bluesky session deleted');
    } catch (err) {
      logger.warn({ err }, 'Failed to delete Bluesky session');
    }
  }
}
