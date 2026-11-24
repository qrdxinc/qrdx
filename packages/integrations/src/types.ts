/**
 * Integration database record type (decrypted)
 */
export interface Integration {
  id: string;
  userId: string;
  provider: string;
  accessToken: string; // Decrypted when returned
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  metadata: Record<string, any> | null;
  status: "active" | "disconnected" | "error";
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  responseType?: string;
  extraParams?: Record<string, string>;
  /** How the token endpoint authenticates the client (default: in the body). */
  tokenAuth?: "body" | "basic";
  /** Token request encoding (default: form). Notion expects JSON. */
  tokenFormat?: "form" | "json";
  /**
   * Other sign-in hosts the person can pick when connecting, by name, like
   * Salesforce's "sandbox" (test.salesforce.com). The pick is kept in the
   * connection's metadata.oauthVariant, so refreshes use the same host.
   */
  variants?: Record<string, OAuthHostVariant>;
}

export interface OAuthHostVariant {
  authUrl: string;
  tokenUrl: string;
}

/**
 * OAuth token response structure
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

/**
 * Integration type
 */
/** "none": works without connecting (smart link parsers like YouTube). */
export type IntegrationType = "oauth" | "api_key" | "webhook" | "none";

/**
 * Integration category
 */
export type IntegrationCategory =
  | "analytics"
  | "storage"
  | "assets"
  | "marketing"
  | "crm"
  | "communication";
