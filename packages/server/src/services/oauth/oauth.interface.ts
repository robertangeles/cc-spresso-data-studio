export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accountId?: string;
  accountName?: string;
}

export interface OAuthProvider {
  platform: string;
  getAuthUrl(userId: string, redirectBase: string): Promise<string>;
  exchangeCode(code: string, redirectBase: string): Promise<OAuthTokens>;
  refreshToken(currentToken: string): Promise<OAuthTokens>;
  getAccountInfo(accessToken: string): Promise<{ accountId: string; accountName: string }>;
  revokeAccess(accessToken: string): Promise<void>;
}
