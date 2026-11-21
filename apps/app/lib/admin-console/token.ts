import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  isUserBanned,
  NO_STORE_HEADERS,
  oauthError,
  verifyCodeChallenge,
} from "@/lib/oauth";
import { currentAdminConsoleClient } from "./authorize";
import { ADMIN_CONSOLE_ACCESS_TOKEN_SECONDS } from "./client";
import { mintAdminConsoleGrant } from "./grants";
import {
  consumeAdminConsoleCode,
  issueAdminConsoleAccessToken,
} from "./tickets";

/** Equal strings, in time that doesn't depend on where they differ. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const field = (body: FormData, key: string): string | null => {
  const value = body.get(key);
  return typeof value === "string" && value ? value : null;
};

/**
 * POST /api/oauth/token for the console client: authorization_code only
 * (no refresh tokens; the console signs in again after its own session
 * ends), with the client secret and the PKCE verifier both required. The
 * code is consumed as it's read, so it's good once. The answer is an
 * access token for userinfo, good for a minute and once, and this sign-in's
 * grant (`console_grant`, ./grants.ts), which the console sends with every
 * signed call. Without the grants table, the console couldn't make one, so
 * the sign-in is refused.
 */
export async function exchangeAdminConsoleCode(
  body: FormData,
): Promise<Response> {
  const client = currentAdminConsoleClient();
  if (!client) {
    return oauthError("invalid_client", "Invalid client credentials", 401);
  }
  if (field(body, "grant_type") !== "authorization_code") {
    return oauthError(
      "unsupported_grant_type",
      "This client supports authorization_code only",
    );
  }
  const secret = field(body, "client_secret");
  const code = field(body, "code");
  const redirectUri = field(body, "redirect_uri");
  const codeVerifier = field(body, "code_verifier");
  if (!(secret && code && redirectUri && codeVerifier)) {
    return oauthError(
      "invalid_request",
      "Missing required parameters: client_secret, code, redirect_uri, code_verifier",
    );
  }
  if (!sameSecret(secret, client.secret)) {
    return oauthError("invalid_client", "Invalid client credentials", 401);
  }

  const ticket = await consumeAdminConsoleCode(code);
  if (!ticket) {
    return oauthError(
      "invalid_grant",
      "Invalid, expired or already used authorization code",
    );
  }
  if (ticket.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "redirect_uri mismatch");
  }
  if (!verifyCodeChallenge(codeVerifier, ticket.codeChallenge, "S256")) {
    return oauthError("invalid_grant", "PKCE verification failed");
  }
  if (await isUserBanned(ticket.userId)) {
    return oauthError("invalid_grant", "This account is suspended");
  }

  const accessToken = await issueAdminConsoleAccessToken({
    userId: ticket.userId,
    sessionId: ticket.sessionId,
    scopes: ticket.scopes,
  });
  const grant = await mintAdminConsoleGrant({
    userId: ticket.userId,
    sessionId: ticket.sessionId,
  });
  if (!grant) {
    return oauthError(
      "server_error",
      "This deployment can't mint console grants yet (update the database schema: the migrate service with Docker, bun run db:push otherwise)",
      503,
    );
  }
  return Response.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ADMIN_CONSOLE_ACCESS_TOKEN_SECONDS,
      scope: ticket.scopes.join(" "),
      console_grant: grant,
    },
    { headers: NO_STORE_HEADERS },
  );
}
