import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface YouTubeChannelResponse {
  items?: Array<{
    id: string;
    snippet?: { title: string };
  }>;
}

export class YouTubeOAuthProvider implements OAuthProvider {
  platform = 'youtube';

  private async getCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const idSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'GOOGLE_CLIENT_ID'),
    });
    const secretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'GOOGLE_CLIENT_SECRET'),
    });
    if (!idSetting?.value || !secretSetting?.value) {
      throw new Error(
        'Google credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Settings.',
      );
    }
    return { clientId: idSetting.value, clientSecret: secretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { clientId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/youtube/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&access_type=offline&prompt=consent`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/youtube/callback`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = (await res.json()) as GoogleTokenResponse;
    if (data.error || !data.access_token) {
      logger.error({ error: data }, 'YouTube code exchange failed');
      throw new Error(data.error_description || 'Failed to exchange code');
    }

    const { accountId, accountName } = await this.getAccountInfo(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      accountId,
      accountName,
      accountType: 'personal',
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: currentToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await res.json()) as GoogleTokenResponse;
    if (data.error || !data.access_token) {
      logger.error({ error: data }, 'YouTube token refresh failed');
      throw new Error(data.error_description || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = (await res.json()) as YouTubeChannelResponse;
    const channel = data.items?.[0];

    return {
      accountId: channel?.id ?? '',
      accountName: channel?.snippet?.title ?? 'YouTube Channel',
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
    }).catch(() => {});
    logger.info('YouTube access revoked');
  }
}
