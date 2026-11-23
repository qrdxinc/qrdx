import {
  database as db,
  oauthApp,
  oauthAuthorizationCode,
  oauthToken,
  user,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { isAdminConsoleClientId } from "@/lib/admin-console/client";
import { exchangeAdminConsoleCode } from "@/lib/admin-console/token";
import {
  createTokenPair,
  hashToken,
  isBanActive,
  isUserBanned,
  NO_STORE_HEADERS,
  oauthError,
  verifyCodeChallenge,
  verifySecret,
} from "@/lib/oauth";
import { isOwnResource } from "@/lib/oauth-metadata";
import { getClientIp } from "@/lib/request-guards";

// bcrypt client-secret checks are CPU-heavy: cap attempts per IP.
const tokenRateLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

/**
 * Public clients (MCP apps in a browser) exchange codes from their own
 * origin. Nothing here reads cookies: a code, a verifier or a secret is
 * what counts.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const response = await handleToken(req);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

async function handleToken(req: NextRequest): Promise<Response> {
  const { success } = await tokenRateLimiter.limit(
    `oauth-token:ip:${getClientIp(req)}`,
  );
  if (!success) {
    return oauthError(
      "temporarily_unavailable",
      "Too many requests. Please try again later.",
      429,
    );
  }

  const body = await req.formData().catch(() => null);
  if (!body) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }

  // The back-office console: a first-party client defined by environment,
  // with its own one-time codes (lib/admin-console).
  if (isAdminConsoleClientId(body.get("client_id") as string | null)) {
    return exchangeAdminConsoleCode(body);
  }

  const credentials = readClientCredentials(req, body);
  if (!credentials.ok) return credentials.error;

  // RFC 8707: a token for another server is never issued here.
  const resource = body.get("resource");
  if (typeof resource === "string" && !isOwnResource(resource)) {
    return oauthError(
      "invalid_target",
      "resource must be this QRdx server's MCP endpoint or REST API",
    );
  }

  const grantType = body.get("grant_type") as string | null;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(body, credentials);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(body, credentials);
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported: authorization_code, refresh_token",
  );
}

interface ClientCredentials {
  ok: true;
  clientId: string | null;
  clientSecret: string | null;
}

/**
 * The client's id and secret, from HTTP Basic (client_secret_basic, RFC 6749
 * §2.3.1: each part form-urlencoded) or the body (client_secret_post, and a
 * public client's bare client_id). One method per request.
 */
function readClientCredentials(
  req: NextRequest,
  body: FormData,
): ClientCredentials | { ok: false; error: Response } {
  const bodyId = body.get("client_id");
  const bodySecret = body.get("client_secret");
  const clientId = typeof bodyId === "string" && bodyId ? bodyId : null;
  const clientSecret =
    typeof bodySecret === "string" && bodySecret ? bodySecret : null;
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("basic ")) {
    return { ok: true, clientId, clientSecret };
  }
  const basic = parseBasic(header.slice(6).trim());
  if (!basic) {
    return {
      ok: false,
      error: oauthError("invalid_client", "Malformed Basic credentials", 401),
    };
  }
  if (clientSecret || (clientId && clientId !== basic.id)) {
    return {
      ok: false,
      error: oauthError(
        "invalid_request",
        "Send the client's credentials one way: the Authorization header or the body",
      ),
    };
  }
  return { ok: true, clientId: basic.id, clientSecret: basic.secret };
}

function parseBasic(value: string): { id: string; secret: string } | null {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon <= 0) return null;
    const formDecode = (part: string) =>
      decodeURIComponent(part.replace(/\+/g, " "));
    const id = formDecode(decoded.slice(0, colon));
    const secret = formDecode(decoded.slice(colon + 1));
    return id && secret ? { id, secret } : null;
  } catch {
    return null;
  }
}

interface TokenClient {
  id: string;
  /** token_endpoint_auth_method "none": no secret, PKCE instead */
  publicClient: boolean;
}

/**
 * The app a token request is for. A public client (one that registered with
 * token_endpoint_auth_method "none") sends its client_id alone and never a
 * secret; every other app proves its secret.
 */
async function authenticateTokenClient(
  credentials: ClientCredentials,
  required: string,
): Promise<TokenClient | Response> {
  const { clientId, clientSecret } = credentials;
  if (!clientId) {
    return oauthError(
      "invalid_request",
      `Missing required parameters: ${required}`,
    );
  }
  const [app] = await db
    .select({
      id: oauthApp.id,
      clientSecretHash: oauthApp.clientSecretHash,
      tokenEndpointAuthMethod: oauthApp.tokenEndpointAuthMethod,
    })
    .from(oauthApp)
    .where(and(eq(oauthApp.clientId, clientId), eq(oauthApp.isActive, true)))
    .limit(1);
  if (app?.tokenEndpointAuthMethod === "none") {
    // A secret from a public client means it's confused or someone guesses.
    return clientSecret
      ? oauthError("invalid_client", "Invalid client credentials", 401)
      : { id: app.id, publicClient: true };
  }
  if (!clientSecret) {
    return oauthError(
      "invalid_request",
      `Missing required parameters: ${required}`,
    );
  }
  if (!(app && (await verifySecret(clientSecret, app.clientSecretHash)))) {
    return oauthError("invalid_client", "Invalid client credentials", 401);
  }
  return { id: app.id, publicClient: false };
}

async function handleAuthorizationCode(
  body: FormData,
  credentials: ClientCredentials,
) {
  const code = body.get("code") as string | null;
  const redirectUri = body.get("redirect_uri") as string | null;
  const codeVerifier = body.get("code_verifier") as string | null;
  const required = "client_id, client_secret, code, redirect_uri";

  if (!code || !redirectUri) {
    return oauthError(
      "invalid_request",
      `Missing required parameters: ${required}`,
    );
  }

  const app = await authenticateTokenClient(credentials, required);
  if (app instanceof Response) return app;

  const now = new Date();

  // Consume the code atomically: concurrent exchanges of one code can't both win.
  const [authCode] = await db
    .update(oauthAuthorizationCode)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthAuthorizationCode.code, hashToken(code)),
        eq(oauthAuthorizationCode.appId, app.id),
        isNull(oauthAuthorizationCode.usedAt),
      ),
    )
    .returning({
      expiresAt: oauthAuthorizationCode.expiresAt,
      redirectUri: oauthAuthorizationCode.redirectUri,
      codeChallenge: oauthAuthorizationCode.codeChallenge,
      codeChallengeMethod: oauthAuthorizationCode.codeChallengeMethod,
      userId: oauthAuthorizationCode.userId,
      scopes: oauthAuthorizationCode.scopes,
    });

  if (!authCode) {
    return oauthError(
      "invalid_grant",
      "Invalid or already used authorization code",
    );
  }

  if (now > authCode.expiresAt) {
    return oauthError("invalid_grant", "Authorization code expired");
  }

  if (authCode.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "redirect_uri mismatch");
  }

  if (app.publicClient && !authCode.codeChallenge) {
    // Never issued (PKCE is required for them), but a public client's code
    // must not be redeemable on its client_id alone.
    return oauthError("invalid_grant", "PKCE verification failed");
  }

  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return oauthError("invalid_request", "code_verifier required for PKCE");
    }
    if (
      !verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod ?? "S256",
      )
    ) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }
  } else if (codeVerifier) {
    // PKCE downgrade: a verifier for a code issued without a challenge
    return oauthError(
      "invalid_grant",
      "code_verifier sent for a code issued without code_challenge",
    );
  }

  if (await isUserBanned(authCode.userId)) {
    return oauthError("invalid_grant", "This account is suspended");
  }

  const tokenResponse = await createTokenPair(
    app.id,
    authCode.userId,
    authCode.scopes,
  );

  return Response.json(tokenResponse, { headers: NO_STORE_HEADERS });
}

async function handleRefreshToken(
  body: FormData,
  credentials: ClientCredentials,
) {
  const refreshToken = body.get("refresh_token") as string | null;
  const required = "client_id, client_secret, refresh_token";

  if (!refreshToken) {
    return oauthError(
      "invalid_request",
      `Missing required parameters: ${required}`,
    );
  }

  const app = await authenticateTokenClient(credentials, required);
  if (app instanceof Response) return app;

  const now = new Date();
  const refreshTokenHash = hashToken(refreshToken);

  // Banned accounts can't refresh. Checked before rotating, so the grant
  // works again if a temporary ban ends.
  const [owner] = await db
    .select({ banned: user.banned, banExpires: user.banExpires })
    .from(oauthToken)
    .innerJoin(user, eq(user.id, oauthToken.userId))
    .where(
      and(
        eq(oauthToken.refreshTokenHash, refreshTokenHash),
        eq(oauthToken.appId, app.id),
        isNull(oauthToken.revokedAt),
      ),
    )
    .limit(1);
  if (owner && isBanActive(owner, now)) {
    return oauthError("invalid_grant", "This account is suspended");
  }

  // Rotate atomically: a refresh token can be redeemed exactly once.
  const [tokenRecord] = await db
    .update(oauthToken)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(oauthToken.refreshTokenHash, refreshTokenHash),
        eq(oauthToken.appId, app.id),
        isNull(oauthToken.revokedAt),
      ),
    )
    .returning({
      userId: oauthToken.userId,
      scopes: oauthToken.scopes,
      refreshTokenExpiresAt: oauthToken.refreshTokenExpiresAt,
    });

  if (!tokenRecord) {
    return oauthError("invalid_grant", "Invalid refresh token");
  }

  if (
    tokenRecord.refreshTokenExpiresAt &&
    now > tokenRecord.refreshTokenExpiresAt
  ) {
    return oauthError("invalid_grant", "Refresh token expired");
  }

  const tokenResponse = await createTokenPair(
    app.id,
    tokenRecord.userId,
    tokenRecord.scopes,
  );

  return Response.json(tokenResponse, { headers: NO_STORE_HEADERS });
}
