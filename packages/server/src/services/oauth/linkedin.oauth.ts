import type { OAuthProvider, OAuthTokens } from './oauth.interface.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export class LinkedInOAuthProvider implements OAuthProvider {
  platform = 'linkedin';

  private async getCredentials(
    type: 'personal' | 'org' = 'personal',
  ): Promise<{ clientId: string; clientSecret: string }> {
    const idKey = type === 'org' ? 'LINKEDIN_ORG_CLIENT_ID' : 'LINKEDIN_CLIENT_ID';
    const secretKey = type === 'org' ? 'LINKEDIN_ORG_CLIENT_SECRET' : 'LINKEDIN_CLIENT_SECRET';

    const clientIdSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, idKey),
    });
    const clientSecretSetting = await db.query.settings.findFirst({
      where: eq(schema.settings.key, secretKey),
    });
    if (!clientIdSetting?.value || !clientSecretSetting?.value) {
      throw new Error(
        `LinkedIn ${type} credentials not configured. Add ${idKey} and ${secretKey} in Settings.`,
      );
    }
    return { clientId: clientIdSetting.value, clientSecret: clientSecretSetting.value };
  }

  /**
   * Get OAuth URL for Company Page access (uses org app credentials).
   */
  async getOrgAuthUrl(userId: string, redirectBase: string): Promise<string> {
    const { clientId } = await this.getCredentials('org');
    const redirectUri = `${redirectBase}/api/oauth/linkedin/callback-page`;
    const state = Buffer.from(JSON.stringify({ userId, type: 'org' })).toString('base64url');
    const scopes = 'w_organization_social r_organization_social openid profile';
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}`;
  }

  /**
   * Exchange code using org credentials.
   */
  async exchangeOrgCode(code: string, redirectBase: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = await this.getCredentials('org');
    const redirectUri = `${redirectBase}/api/oauth/linkedin/callback-page`;

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
      logger.error({ error: tokenData.error }, 'LinkedIn org code exchange failed');
      throw new Error(tokenData.error_description || 'Failed to exchange code');
    }

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000),
      accountType: 'org',
    };
  }

  /**
   * Get organizations the user is admin of.
   */
  async getAdminOrganizations(accessToken: string): Promise<
    Array<{
      orgId: string;
      orgName: string;
    }>
  > {
    const res = await fetch(
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'LinkedIn-Version': '202602',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );
    const data = (await res.json()) as any;

    if (!data.elements || data.elements.length === 0) {
      return [];
    }

    return data.elements.map((el: any) => ({
      orgId: String(el['organization~']?.id ?? ''),
      orgName: el['organization~']?.localizedName ?? 'Unknown Organization',
    }));
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
