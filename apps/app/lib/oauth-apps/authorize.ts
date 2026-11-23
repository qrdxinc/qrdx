import "server-only";

import {
  database as db,
  oauthApp,
  oauthAuthorizationCode,
  oauthToken,
  organization,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, isNull } from "drizzle-orm";
import { OAUTH_AUTHORIZATION_CODE_EXPIRY_SECONDS } from "@/lib/constants";
import {
  generateSecureToken,
  hashToken,
  isValidPkceValue,
  PKCE_METHODS,
  parseScopes,
  validateScopes,
} from "@/lib/oauth";
import { isOwnResource, oauthIssuer } from "@/lib/oauth-metadata";
import { OAUTH_SCOPES, type OAuthScope } from "@/lib/oauth-scopes";
import { isDynamicApp, isTrustedApp } from "./access";
import { appBuilderName } from "./builder";
import { isAllowedRedirectUri } from "./validation";

/**
 * The authorization request (RFC 6749 §4.1.1 + PKCE, RFC 7636), checked the
 * same way by GET/POST /api/oauth/authorize and the consent page.
 */

export const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "prompt",
  // RFC 8707: the server the token is for (MCP clients always send it)
  "resource",
] as const;

export interface AuthorizeParams {
  responseType: string | null;
  clientId: string | null;
  redirectUri: string | null;
  scope: string | null;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string;
  prompt: string | null;
  resource: string | null;
}

export function readAuthorizeParams(
  get: (key: (typeof AUTHORIZE_PARAMS)[number]) => string | null | undefined,
): AuthorizeParams {
  const value = (key: (typeof AUTHORIZE_PARAMS)[number]) => get(key) || null;
  return {
    responseType: value("response_type"),
    clientId: value("client_id"),
    redirectUri: value("redirect_uri"),
    scope: value("scope"),
    state: value("state"),
    codeChallenge: value("code_challenge"),
    codeChallengeMethod: value("code_challenge_method") ?? "S256",
    prompt: value("prompt"),
    resource: value("resource"),
  };
}

/** The params as a query string or hidden form fields (what was sent, only). */
export function authorizeParamEntries(
  params: AuthorizeParams,
): [string, string][] {
  const entries: [string, string | null][] = [
    ["response_type", params.responseType],
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["scope", params.scope],
    ["state", params.state],
    ["code_challenge", params.codeChallenge],
    [
      "code_challenge_method",
      params.codeChallenge ? params.codeChallengeMethod : null,
    ],
    ["resource", params.resource],
  ];
  return entries.filter(
    (entry): entry is [string, string] => entry[1] !== null,
  );
}

export interface AuthorizeApp {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  /** Reviewed by QRdx, or registered by it */
  trusted: boolean;
  /** "QRdx", the owning team's name or the developer's name */
  builtBy: string;
  redirectUris: string[];
  scopes: string[];
  pkceRequired: boolean;
  /**
   * Registered itself at /api/oauth/register (an MCP client): the consent
   * screen always asks, and loopback redirect URIs match on any port.
   */
  dynamic: boolean;
}

export type AuthorizeError = { error: string; description: string };

export type AuthorizeCheck =
  | { ok: true; app: AuthorizeApp; scopes: OAuthScope[] }
  | ({ ok: false } & AuthorizeError);

const reject = (error: string, description: string) =>
  ({ ok: false, error, description }) as const;

const MISSING_PARAMETERS: AuthorizeError = {
  error: "invalid_request",
  description:
    "Missing required parameters: client_id, redirect_uri, response_type, scope",
};

/** Checks that need no database: required params, response type, PKCE shape. */
export function checkAuthorizeParams(
  params: AuthorizeParams,
): AuthorizeError | null {
  // `scope` is checked with the app: a client that registered itself may
  // leave it out and gets the scopes it registered.
  if (!params.clientId || !params.redirectUri || !params.responseType) {
    return MISSING_PARAMETERS;
  }
  if (params.responseType !== "code") {
    return {
      error: "unsupported_response_type",
      description: "Only response_type=code is supported",
    };
  }
  if (params.codeChallenge) {
    if (params.codeChallengeMethod === "plain") {
      return {
        error: "invalid_request",
        description:
          "code_challenge_method=plain is not supported: send an S256 challenge (BASE64URL(SHA256(code_verifier))) with code_challenge_method=S256",
      };
    }
    if (
      !PKCE_METHODS.includes(
        params.codeChallengeMethod as (typeof PKCE_METHODS)[number],
      )
    ) {
      return {
        error: "invalid_request",
        description: "Unsupported code_challenge_method (use S256)",
      };
    }
    if (!isValidPkceValue(params.codeChallenge)) {
      return {
        error: "invalid_request",
        description: "Malformed code_challenge",
      };
    }
  }
  if (params.resource !== null && !isOwnResource(params.resource)) {
    return {
      error: "invalid_target",
      description:
        "resource must be this QRdx server's MCP endpoint or REST API",
    };
  }
  return null;
}

/** Checks against the registered app: redirect URI, scopes, PKCE policy. */
export function checkAuthorizeApp(
  app: Pick<AuthorizeApp, "redirectUris" | "scopes" | "pkceRequired"> & {
    dynamic?: boolean;
  },
  params: AuthorizeParams,
): { ok: true; scopes: OAuthScope[] } | ({ ok: false } & AuthorizeError) {
  const dynamic = app.dynamic === true;
  if (
    !(
      params.redirectUri &&
      isAllowedRedirectUri(params.redirectUri, app.redirectUris, {
        loopbackAnyPort: dynamic,
      })
    )
  ) {
    return reject("invalid_request", "redirect_uri not registered");
  }
  let requested = parseScopes(params.scope ?? "");
  if (dynamic) {
    // MCP clients ask for what discovery listed, which can include scopes
    // they weren't registered for (or none): they get the registered ones
    // they asked for, or all of them when they named none.
    const registered = requested.filter((scope) => app.scopes.includes(scope));
    requested = params.scope ? registered : [...app.scopes];
    if (params.scope && requested.length === 0) {
      return reject("invalid_scope", "Invalid or unsupported scope");
    }
  } else if (!params.scope) {
    return { ok: false, ...MISSING_PARAMETERS };
  }
  if (!validateScopes(requested, app.scopes)) {
    return reject("invalid_scope", "Invalid or unsupported scope");
  }
  if (
    app.pkceRequired &&
    !(params.codeChallenge && params.codeChallengeMethod === "S256")
  ) {
    return reject(
      "invalid_request",
      "This app requires PKCE: send code_challenge with code_challenge_method=S256",
    );
  }
  // Canonical order, no duplicates.
  const scopes = OAUTH_SCOPES.filter((scope) => requested.includes(scope));
  return { ok: true, scopes };
}

/** An active app by client_id, with who built it. */
export async function loadAuthorizeApp(
  clientId: string,
): Promise<AuthorizeApp | null> {
  const [row] = await db
    .select({
      id: oauthApp.id,
      name: oauthApp.name,
      description: oauthApp.description,
      logoUrl: oauthApp.logoUrl,
      websiteUrl: oauthApp.websiteUrl,
      verified: oauthApp.verified,
      ownerUserId: oauthApp.ownerUserId,
      organizationId: oauthApp.organizationId,
      redirectUris: oauthApp.redirectUris,
      scopes: oauthApp.scopes,
      pkceRequired: oauthApp.pkceRequired,
      registrationType: oauthApp.registrationType,
      teamName: organization.name,
      ownerName: user.name,
    })
    .from(oauthApp)
    .leftJoin(organization, eq(organization.id, oauthApp.organizationId))
    .leftJoin(user, eq(user.id, oauthApp.ownerUserId))
    .where(and(eq(oauthApp.clientId, clientId), eq(oauthApp.isActive, true)))
    .limit(1);
  if (!row) return null;
  const redirectUris = Array.isArray(row.redirectUris) ? row.redirectUris : [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    websiteUrl: row.websiteUrl,
    trusted: isTrustedApp(row),
    builtBy: appBuilderName({ ...row, redirectUris }),
    redirectUris,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    // A self-registered client always needs PKCE, whatever its row says.
    pkceRequired: row.pkceRequired || isDynamicApp(row),
    dynamic: isDynamicApp(row),
  };
}

export async function checkAuthorizeRequest(
  params: AuthorizeParams,
): Promise<AuthorizeCheck> {
  const invalid = checkAuthorizeParams(params);
  if (invalid) return { ok: false, ...invalid };
  const app = await loadAuthorizeApp(params.clientId as string);
  if (!app) return reject("invalid_client", "Unknown client_id");
  const checked = checkAuthorizeApp(app, params);
  return checked.ok ? { ok: true, app, scopes: checked.scopes } : checked;
}

/**
 * The user already granted these scopes to this app and still has a usable
 * grant, so a repeat authorization can skip the consent screen.
 */
export async function hasPriorConsent(
  appId: string,
  userId: string,
  scopes: readonly string[],
): Promise<boolean> {
  const rows = await db
    .select({
      scopes: oauthToken.scopes,
      refreshTokenExpiresAt: oauthToken.refreshTokenExpiresAt,
    })
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.appId, appId),
        eq(oauthToken.userId, userId),
        isNull(oauthToken.revokedAt),
      ),
    )
    .limit(20);
  const now = new Date();
  return rows.some(
    (row) =>
      (!row.refreshTokenExpiresAt || row.refreshTokenExpiresAt > now) &&
      Array.isArray(row.scopes) &&
      scopes.every((scope) => row.scopes.includes(scope)),
  );
}

/** Stores a one-time code (hashed) and returns where to send the browser. */
export async function issueAuthorizationCode(
  appId: string,
  userId: string,
  params: AuthorizeParams,
  scopes: readonly OAuthScope[],
): Promise<string> {
  const code = generateSecureToken();
  const now = new Date();
  await db.insert(oauthAuthorizationCode).values({
    id: cuid(),
    // Only the hash is stored; the plaintext code goes to the client once.
    code: hashToken(code),
    appId,
    userId,
    scopes: [...scopes],
    redirectUri: params.redirectUri as string,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallenge
      ? params.codeChallengeMethod
      : null,
    expiresAt: new Date(
      now.getTime() + OAUTH_AUTHORIZATION_CODE_EXPIRY_SECONDS * 1000,
    ),
    createdAt: now,
  });
  return authorizationResponse(params, { code });
}

/**
 * An authorization response (a code, or an error once the redirect URI is
 * known to be the app's): redirectWith plus `iss`, the issuer, so clients
 * can tell which server answered (RFC 9207; the metadata says it's always
 * sent).
 */
export function authorizationResponse(
  params: Pick<AuthorizeParams, "redirectUri" | "state">,
  values: Record<string, string>,
): string {
  return redirectWith(params, { ...values, iss: oauthIssuer() });
}

/** redirect_uri plus `values` and the client's state (query kept, RFC 6749 §3.1.2). */
export function redirectWith(
  params: Pick<AuthorizeParams, "redirectUri" | "state">,
  values: Record<string, string>,
): string {
  const url = new URL(params.redirectUri as string);
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}
