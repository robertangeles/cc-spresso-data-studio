import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface TikTokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export class TikTokOAuthProvider implements OAuthProvider {
  platform = 'tiktok';

  private async getCredentials(): Promise<{ clientKey: string; clientSecret: string }> {
    const keySetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'TIKTOK_CLIENT_KEY'),
    });
    const secretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'TIKTOK_CLIENT_SECRET'),
    });
    if (!keySetting?.value || !secretSetting?.value) {
      throw new Error(
        'TikTok credentials not configured. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Settings > Social Media.',
      );
    }
    return { clientKey: keySetting.value, clientSecret: secretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { clientKey } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/tiktok/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');

    // TikTok OAuth v2 scopes for content posting
    const scopes = ['user.info.basic', 'video.publish', 'video.upload'].join(',');

    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/tiktok/callback`;

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const data = (await res.json()) as TikTokTokenResponse;
    if (data.error || !data.access_token) {
      logger.error({ error: data }, 'TikTok code exchange failed');
      throw new Error(data.error_description || data.error || 'Failed to exchange TikTok code');
    }

    const { accountId, accountName } = await this.getAccountInfo(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      accountId: accountId || data.open_id || '',
      accountName,
      accountType: 'creator',
    };
  }

  async refreshToken(currentRefreshToken: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret } = await this.getCredentials();

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        refresh_token: currentRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await res.json()) as TikTokTokenResponse;
    if (data.error || !data.access_token) {
      logger.error({ error: data }, 'TikTok token refresh failed');
      throw new Error(data.error_description || data.error || 'TikTok token refresh failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const data = (await res.json()) as TikTokUserInfoResponse;
    if (data.error?.code) {
      logger.warn({ error: data.error }, 'TikTok user info fetch failed — using defaults');
      return { accountId: '', accountName: 'TikTok Account' };
    }

    const user = data.data?.user;
    return {
      accountId: user?.open_id ?? '',
      accountName: user?.display_name ?? 'TikTok Account',
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    const { clientKey, clientSecret } = await this.getCredentials();

    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        token: accessToken,
      }),
    }).catch(() => {});
    logger.info('TikTok access revoked');
  }
}
