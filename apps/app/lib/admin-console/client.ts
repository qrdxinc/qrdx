// QRdx's back-office console, at its own address (ADMIN_CONSOLE_URL), signs
// admins in through this app's OAuth provider as a first-party client. The
// client isn't a row in oauth_app: it's defined here from two variables, and
// doesn't exist while either is unset. Pure: the routes and tests import it.
//
// What makes it different from a registered app:
// - one exact redirect URI, <ADMIN_CONSOLE_URL>/auth/callback;
// - its own scopes (openid, email, profile), which no registered app can
//   be granted, and which only open the userinfo endpoint;
// - PKCE (S256) and `state` are required, not optional;
// - no consent screen (it's QRdx's own back office) and no refresh tokens:
//   the console keeps its own short session and signs in again after it;
// - the client secret is CONSOLE_ZONE_KEY, the value both deployments
//   already share. Codes and access tokens are one-time rows in
//   `verification` (./tickets.ts), not oauth_authorization_code/oauth_token,
//   which belong to oauth_app rows.

import {
  ADMIN_CONSOLE_CALLBACK_PATH,
  ADMIN_CONSOLE_CLIENT_ID,
  ADMIN_CONSOLE_SCOPES,
  ADMIN_CONSOLE_TOKEN_PREFIX,
  type AdminConsoleScope,
  adminConsoleAddress,
} from "@repo/next-config/console-zone";
import { isValidPkceValue, parseScopes } from "@/lib/oauth";
import type { AuthorizeParams } from "@/lib/oauth-apps/authorize";

// The client's id, redirect path, scopes and token prefix are in
// @repo/next-config/console-zone, which the console imports too.
export {
  ADMIN_CONSOLE_CALLBACK_PATH,
  ADMIN_CONSOLE_CLIENT_ID,
  ADMIN_CONSOLE_SCOPES,
  ADMIN_CONSOLE_TOKEN_PREFIX,
  type AdminConsoleScope,
};

/** How long the console has to exchange a code (seconds). */
export const ADMIN_CONSOLE_CODE_SECONDS = 120;
/** How long its access token opens userinfo (seconds); used once. */
export const ADMIN_CONSOLE_ACCESS_TOKEN_SECONDS = 60;

const MAX_STATE_LENGTH = 1024;

export interface AdminConsoleClient {
  clientId: typeof ADMIN_CONSOLE_CLIENT_ID;
  /** The one redirect URI, character for character. */
  redirectUri: string;
  /** The client secret the token exchange checks (CONSOLE_ZONE_KEY). */
  secret: string;
}

/**
 * The client as this deployment has it, or null while ADMIN_CONSOLE_URL or
 * CONSOLE_ZONE_KEY is unset, or the key is too short (adminConsoleAddress):
 * then the client id is unknown, as any other.
 */
export function adminConsoleClient({
  adminConsoleUrl,
  secret,
}: {
  adminConsoleUrl: string | undefined;
  secret: string | undefined;
}): AdminConsoleClient | null {
  const origin = adminConsoleAddress({ adminConsoleUrl, secret });
  if (!(origin && secret)) return null;
  return {
    clientId: ADMIN_CONSOLE_CLIENT_ID,
    redirectUri: `${origin}${ADMIN_CONSOLE_CALLBACK_PATH}`,
    secret,
  };
}

export const isAdminConsoleClientId = (
  clientId: string | null | undefined,
): boolean => clientId === ADMIN_CONSOLE_CLIENT_ID;

export const isAdminConsoleToken = (token: string): boolean =>
  token.startsWith(ADMIN_CONSOLE_TOKEN_PREFIX);

export type AdminConsoleAuthorizeCheck =
  | { ok: true; scopes: AdminConsoleScope[] }
  | { ok: false; error: string; description: string };

const reject = (error: string, description: string) =>
  ({ ok: false, error, description }) as const;

/**
 * The authorization request as the console must send it. Checked before
 * anything else, and errors are answered as JSON, never a redirect: until
 * the redirect URI matched, nothing may be sent there.
 */
export function checkAdminConsoleAuthorizeRequest(
  client: AdminConsoleClient,
  params: AuthorizeParams,
): AdminConsoleAuthorizeCheck {
  if (params.responseType !== "code") {
    return reject(
      "unsupported_response_type",
      "Only response_type=code is supported",
    );
  }
  if (params.redirectUri !== client.redirectUri) {
    return reject("invalid_request", "redirect_uri not registered");
  }
  const requested = parseScopes(params.scope ?? "");
  const known = (scope: string): scope is AdminConsoleScope =>
    (ADMIN_CONSOLE_SCOPES as readonly string[]).includes(scope);
  if (
    requested.length === 0 ||
    !requested.every(known) ||
    !requested.includes("openid")
  ) {
    return reject(
      "invalid_scope",
      "The console's scopes are openid (required), email and profile",
    );
  }
  if (!params.state || params.state.length > MAX_STATE_LENGTH) {
    return reject("invalid_request", "state is required");
  }
  if (!params.codeChallenge) {
    return reject(
      "invalid_request",
      "This client requires PKCE: send code_challenge with code_challenge_method=S256",
    );
  }
  if (params.codeChallengeMethod !== "S256") {
    return reject(
      "invalid_request",
      "Unsupported code_challenge_method (use S256)",
    );
  }
  if (!isValidPkceValue(params.codeChallenge)) {
    return reject("invalid_request", "Malformed code_challenge");
  }
  // Canonical order, no duplicates.
  const scopes = ADMIN_CONSOLE_SCOPES.filter((scope) =>
    requested.includes(scope),
  );
  return { ok: true, scopes };
}
