import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export class LinkedInOAuthProvider implements OAuthProvider {
  platform = 'linkedin';

  private async getCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const clientIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'LINKEDIN_CLIENT_ID'),
    });
    const clientSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, 'LINKEDIN_CLIENT_SECRET'),
    });
    if (!clientIdSetting?.value || !clientSecretSetting?.value) {
      throw new Error(
        'LinkedIn credentials not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Settings.',
      );
    }
    return { clientId: clientIdSetting.value, clientSecret: clientSecretSetting.value };
  }

  async getAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { clientId } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/linkedin/callback`;
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const scopes = 'openid profile w_member_social';
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}`;
  }

  async exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();
    const redirectUri = `${redirectBase}/api/oauth/linkedin/callback`;

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = (await tokenRes.json()) as any;

    if (tokenData.error) {
      logger.error({ error: tokenData.error }, 'LinkedIn code exchange failed');
      throw new Error(tokenData.error_description || 'Failed to exchange code');
    }

    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000; // 60 days default
    const refreshToken = tokenData.refresh_token;

    // Get user profile
    const { accountId, accountName } = await this.getAccountInfo(accessToken);

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      accountId,
      accountName,
      accountType: 'personal',
    };
  }

  async refreshToken(currentToken: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials();

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = (await res.json()) as any;

    if (data.error) {
      logger.error({ error: data.error }, 'LinkedIn token refresh failed');
      throw new Error(data.error_description || 'Token refresh failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
    };
  }

  async getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }> {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as any;

    if (data.error) {
      throw new Error(data.error_description || 'Failed to get LinkedIn profile');
    }

    return {
      accountId: data.sub, // LinkedIn member ID
      accountName: data.name || `${data.given_name} ${data.family_name}`,
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      const { clientId, clientSecret } = await this.getCredentials();
      await fetch('https://www.linkedin.com/oauth/v2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: accessToken,
        }),
      });
      logger.info('LinkedIn access revoked');
    } catch (err) {
      logger.warn({ err }, 'LinkedIn revoke failed');
    }
  }
}
