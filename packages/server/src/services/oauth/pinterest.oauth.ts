import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export class PinterestOAuthProvider implements OAuthProvider {
  platform = 'pinterest';

  private async getCredentials(): Promise<{ appId: string; appSecret: string }> {
    const appIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'PINTEREST_APP_ID'),
    });
    const appSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'PINTEREST_APP_SECRET'),
    });
    if (!appIdSetting?.value || !appSecretSetting?.value) {
      throw new Error(
        'Pinterest credentials not configured. Add PINTEREST_APP_ID and PINTEREST_APP_SECRET in Settings.',
      );
    }
    return { appId: appIdSetting.value, appSecret: appSecretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { appId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/pinterest/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = 'boards:read,pins:read,pins:write,user_accounts:read';
    return `https://www.pinterest.com/oauth/?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&state=${state}`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { appId, appSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/pinterest/callback`;

    const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = (await tokenRes.json()) as any;

    if (tokenData.error || !tokenData.access_token) {
      logger.error({ error: tokenData }, 'Pinterest code exchange failed');
      throw new Error(tokenData.message || 'Failed to exchange code');
    }

    const { accountId, accountName } = await this.getAccountInfo(tokenData.access_token);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + (tokenData.expires_in || 2592000) * 1000), // 30 days default
      accountId,
      accountName,
      accountType: 'personal',
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const { appId, appSecret } = await this.getCredentials();

    const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentToken,
      }),
    });
    const data = (await res.json()) as any;

    if (data.error || !data.access_token) {
      logger.error({ error: data }, 'Pinterest token refresh failed');
      throw new Error(data.message || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 2592000) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as any;

    return {
      accountId: data.id ?? data.username ?? '',
      accountName: data.username ?? data.business_name ?? 'Pinterest User',
    };
  }

  async revokeAccess(_accessToken: string): Promise<void> {
    logger.info('Pinterest access revoked locally');
  }
}
