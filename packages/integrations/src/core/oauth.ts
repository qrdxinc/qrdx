/** biome-ignore-all lint/style/noParameterProperties: false positive */
import type {
  IntegrationConfig,
  IntegrationDefinition,
} from "../registry/types";
import type { TokenResponse } from "../types";
import { generateCodeChallenge } from "../utils/pkce";

/**
 * Generic OAuth handler for any OAuth 2.0 provider
 */
export class OAuthHandler {
  constructor(private readonly config: IntegrationConfig) {}

  /**
   * Generate OAuth authorization URL with PKCE
   */
  generateAuthUrl(codeVerifier: string, state?: string): string {
    if (!this.config.oauth?.authUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    const url = new URL(this.config.oauth.authUrl);
    url.searchParams.append("client_id", this.config.clientId);
    url.searchParams.append("redirect_uri", this.config.redirectUri);
    url.searchParams.append(
      "response_type",
      this.config.oauth.responseType || "code"
    );
    // Some providers (Bitly, Notion) have no scopes and reject an empty one
    if (this.config.oauth.scopes.length > 0) {
      url.searchParams.append(
        "scope",
        this.config.oauth.scopes.join(this.config.oauth.scopeSeparator ?? " ")
      );
    }

    // Add PKCE if supported
    if (this.config.oauth.pkce) {
      const codeChallenge = generateCodeChallenge(codeVerifier);
      url.searchParams.append("code_challenge", codeChallenge);
      url.searchParams.append("code_challenge_method", "S256");
    }

    // Add state if provided
    if (state) {
      url.searchParams.append("state", state);
    }

    for (const [key, value] of Object.entries(
      this.config.oauth.extraParams || {}
    )) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string
  ): Promise<TokenResponse> {
    if (!this.config.oauth?.tokenUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };

    // Add PKCE code verifier if supported
    if (this.config.oauth.pkce && codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await this.postTokenRequest(body);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    return readTokenResponse(response, "Token exchange");
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    if (!this.config.oauth?.tokenUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    if (!this.config.supportsRefresh) {
      throw new Error(`Token refresh not supported for ${this.config.slug}`);
    }

    const body = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    const response = await this.postTokenRequest(body);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    return readTokenResponse(response, "Token refresh");
  }

  /**
   * POST to the token endpoint. Defaults to a form body with the client
   * credentials in it; `tokenAuth: "basic"` moves them to an Authorization
   * header and `tokenFormat: "json"` sends JSON (Notion).
   */
  private postTokenRequest(body: Record<string, string>): Promise<Response> {
    const oauth = this.config.oauth;
    if (!oauth?.tokenUrl) {
      throw new Error(`OAuth not supported for ${this.config.slug}`);
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    let payload = body;

    if (oauth.tokenAuth === "basic") {
      headers.Authorization = `Basic ${Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString("base64")}`;
      const {
        client_id: _clientId,
        client_secret: _clientSecret,
        ...rest
      } = body;
      payload = rest;
    }

    const json = oauth.tokenFormat === "json";
    headers["Content-Type"] = json
      ? "application/json"
      : "application/x-www-form-urlencoded";

    return fetch(oauth.tokenUrl, {
      method: "POST",
      headers,
      body: json
        ? JSON.stringify(payload)
        : new URLSearchParams(payload).toString(),
    });
  }

  /**
   * Validate that a token is still valid (provider-specific)
   */
  async validateToken(accessToken: string): Promise<boolean> {
    // For Dub, we can validate by calling the workspaces endpoint
    if (this.config.slug === "dub") {
      try {
        const response = await fetch("https://api.dub.co/workspaces", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    // Default: assume token is valid (can't validate without provider-specific endpoint)
    return true;
  }
}

/**
 * A 2xx token response, refused when it carries no access token: some
 * providers (Zoho) answer a bad code or refresh token with 200 and
 * `{ "error": "invalid_code" }`. Only the error code is kept, never the body.
 */
async function readTokenResponse(
  response: Response,
  what: string
): Promise<TokenResponse> {
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (typeof body?.access_token === "string" && body.access_token) {
    return body as unknown as TokenResponse;
  }
  const code =
    typeof body?.error === "string" && /^[\w.-]{1,64}$/.test(body.error)
      ? body.error
      : "no access token";
  throw new Error(`${what} failed: ${response.status} - ${code}`);
}

/** Where a connection keeps its token server (OAuthConfig.tokenOrigins). */
export const OAUTH_TOKEN_ORIGIN_KEY = "oauthTokenOrigin";

type WithOAuth = Pick<IntegrationDefinition, "oauth">;

/**
 * `value` as one of the provider's token servers (OAuthConfig.tokenOrigins),
 * or null: only a bare https origin on its list counts (no other host, port,
 * path, query or credentials).
 */
export function allowedTokenOrigin(
  config: WithOAuth,
  value: unknown
): string | null {
  const allowed = config.oauth?.tokenOrigins?.allowed;
  if (!allowed || typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const bare =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash;
  return bare && allowed.includes(url.origin) ? url.origin : null;
}

/**
 * The token server a callback names, for a provider with
 * OAuthConfig.tokenOrigins: its origin; null when the callback names none
 * (the default token URL is used); "invalid" for a server off the list,
 * which the callback refuses.
 */
export function callbackTokenOrigin(
  config: WithOAuth,
  query: URLSearchParams
): string | null | "invalid" {
  const param = config.oauth?.tokenOrigins?.param;
  if (!param) return null;
  const value = query.get(param);
  if (value === null) return null;
  return allowedTokenOrigin(config, value) ?? "invalid";
}

/**
 * The config with its token URL on `origin` (same path), for a connection
 * kept on one of the provider's token servers. Unchanged without an origin,
 * or for a provider with a single token server; throws for an origin off the
 * provider's list, so no code or token is ever sent to another host.
 */
export function withTokenOrigin<T extends IntegrationConfig>(
  config: T,
  origin: unknown
): T {
  const oauth = config.oauth;
  if (origin === null || origin === undefined || !oauth?.tokenOrigins) {
    return config;
  }
  const allowed = allowedTokenOrigin(config, origin);
  if (!allowed) {
    throw new Error(`Not a token server ${config.slug} uses`);
  }
  const { pathname } = new URL(oauth.tokenUrl);
  return { ...config, oauth: { ...oauth, tokenUrl: `${allowed}${pathname}` } };
}

/**
 * Create an OAuth handler for a specific provider
 */
export function createOAuthHandler(config: IntegrationConfig): OAuthHandler {
  return new OAuthHandler(config);
}
