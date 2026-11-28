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
  /** Joins the scopes in the authorize URL (default: a space). Zoho: ",". */
  scopeSeparator?: string;
  /**
   * For a provider with one app and a token server per region (Zoho's data
   * centres): the callback names the person's server in the query parameter
   * `param`. The code is exchanged there, and the connection keeps the origin
   * in metadata.oauthTokenOrigin so refreshes go there too. Only the https
   * origins in `allowed` are ever used; the callback refuses any other.
   */
  tokenOrigins?: { param: string; allowed: readonly string[] };
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
