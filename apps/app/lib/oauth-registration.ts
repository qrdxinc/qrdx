// Dynamic client registration (RFC 7591) for MCP clients: ChatGPT, Claude,
// Cursor and VS Code register themselves at /api/oauth/register before they
// send someone to sign in, since none of them can be given a client ID by
// hand. Anyone can call it, so what it accepts is narrow:
//
// - redirect URIs: https://, or http:// on a loopback address for desktop
//   apps (any port at authorization time, RFC 8252 §7.3); never a QRdx host,
//   whose own redirects could carry a code on to someone else; up to 5;
// - authorization code + refresh token only, and PKCE (S256) always;
// - only the scopes the MCP server's sign-in tools use (MCP_SCOPES);
// - a name of up to 60 plain characters, never one containing "QRdx";
// - nothing else is stored: no logo, website or contacts, which would only
//   be the registrant's own claims on the consent screen.
//
// A registered client is never first-party: the consent screen always asks,
// marks it unverified and names it by the host it sends people back to
// (lib/oauth-apps/access.ts, builder.ts). Its rows say registration_type =
// 'dynamic', so they can be listed or removed together.
import "server-only";

import { randomBytes } from "node:crypto";
import { isQrdxHost } from "@repo/config";
import { database as db, oauthApp } from "@repo/database";
import cuid from "cuid";
import { baseUrl } from "@/lib/metadata";
import { hashSecret, parseScopes } from "@/lib/oauth";
import { DYNAMIC_REGISTRATION } from "@/lib/oauth-apps/access";
import {
  generateClientId,
  generateClientSecret,
} from "@/lib/oauth-apps/secrets";
import {
  checkRedirectUri,
  isLoopbackHost,
  MAX_APP_NAME_LENGTH,
} from "@/lib/oauth-apps/validation";
import {
  MCP_SCOPES,
  TOKEN_ENDPOINT_AUTH_METHODS,
  type TokenEndpointAuthMethod,
} from "@/lib/oauth-metadata";
import { SHORT_LINK_BASE } from "@/lib/short-links";

export const MAX_DYNAMIC_REDIRECT_URIS = 5;
/** The registration request's largest body: a few URIs and a name. */
export const MAX_REGISTRATION_BYTES = 16 * 1024;

const GRANT_TYPES = ["authorization_code", "refresh_token"] as const;

export type RegistrationError = {
  ok: false;
  error: "invalid_redirect_uri" | "invalid_client_metadata";
  description: string;
};

export interface ClientRegistration {
  name: string;
  redirectUris: string[];
  scopes: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
}

const metadataError = (description: string): RegistrationError => ({
  ok: false,
  error: "invalid_client_metadata",
  description,
});
const redirectError = (description: string): RegistrationError => ({
  ok: false,
  error: "invalid_redirect_uri",
  description,
});

// Control characters, and the bidirectional and invisible formatting ones
// that could make a name read differently from what it is.
const UNSAFE_NAME =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * QRdx's own hosts: qrdx.dev and its subdomains, this deployment, short
 * links. Loopback addresses never count: a code sent there stays on the
 * person's own machine (and local development runs on one).
 */
function isOwnHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isLoopbackHost(host)) return false;
  return (
    isQrdxHost(host) ||
    host === baseUrl.hostname ||
    host === new URL(SHORT_LINK_BASE).hostname
  );
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function cleanName(value: unknown): string | RegistrationError | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    return metadataError("client_name must be a string.");
  }
  const name = value.replace(UNSAFE_NAME, "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (name.length > MAX_APP_NAME_LENGTH) {
    return metadataError(
      `client_name can be up to ${MAX_APP_NAME_LENGTH} characters.`,
    );
  }
  if (/qrdx/i.test(name)) {
    return metadataError("client_name can't name QRdx itself.");
  }
  return name;
}

function checkRedirectUris(value: unknown): string[] | RegistrationError {
  if (!isStringList(value) || value.length === 0) {
    return redirectError("redirect_uris must be a list of at least one URI.");
  }
  if (value.length > MAX_DYNAMIC_REDIRECT_URIS) {
    return redirectError(
      `Register up to ${MAX_DYNAMIC_REDIRECT_URIS} redirect URIs.`,
    );
  }
  const uris: string[] = [];
  for (const input of value) {
    const checked = checkRedirectUri(input);
    if (!checked.ok) return redirectError(`${input}: ${checked.message}`);
    // checkRedirectUri keeps the URI as typed (trimmed); it must also be
    // exactly what was sent, since authorization requests compare strings.
    if (checked.url !== input) {
      return redirectError(`${input}: no spaces around redirect URIs.`);
    }
    if (isOwnHost(new URL(checked.url).hostname)) {
      return redirectError(
        `${input}: redirect URIs can't point at QRdx itself.`,
      );
    }
    if (!uris.includes(checked.url)) uris.push(checked.url);
  }
  return uris;
}

/**
 * A registration request (parsed JSON) checked against the rules above, as
 * the client will be stored; or the RFC 7591 §3.2.2 error.
 */
export function checkRegistration(
  body: unknown,
): ({ ok: true } & ClientRegistration) | RegistrationError {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return metadataError("The request body must be a JSON object.");
  }
  const input = body as Record<string, unknown>;

  const redirectUris = checkRedirectUris(input.redirect_uris);
  if (!Array.isArray(redirectUris)) return redirectUris;

  const method = input.token_endpoint_auth_method ?? "client_secret_basic";
  if (
    typeof method !== "string" ||
    !(TOKEN_ENDPOINT_AUTH_METHODS as readonly string[]).includes(method)
  ) {
    return metadataError(
      `token_endpoint_auth_method must be one of ${TOKEN_ENDPOINT_AUTH_METHODS.join(", ")}.`,
    );
  }

  const grants = input.grant_types ?? ["authorization_code"];
  if (
    !isStringList(grants) ||
    !grants.includes("authorization_code") ||
    !grants.every((grant) => (GRANT_TYPES as readonly string[]).includes(grant))
  ) {
    return metadataError(
      "grant_types must include authorization_code and may add refresh_token; nothing else is supported.",
    );
  }

  const responses = input.response_types ?? ["code"];
  if (!isStringList(responses) || !responses.every((type) => type === "code")) {
    return metadataError('response_types can only be ["code"].');
  }

  const name = cleanName(input.client_name);
  if (name && typeof name === "object") return name;

  if (input.scope !== undefined && typeof input.scope !== "string") {
    return metadataError("scope must be a space-separated string.");
  }
  // The scopes asked for, of those the MCP tools use; all of them when the
  // request names none of them.
  const asked = parseScopes(input.scope ?? "");
  const scopes = MCP_SCOPES.filter((scope) => asked.includes(scope));

  return {
    ok: true,
    // A client that gives no name is known by where it sends people back.
    name:
      name ??
      new URL(redirectUris[0] as string).host.slice(0, MAX_APP_NAME_LENGTH),
    redirectUris,
    scopes: scopes.length > 0 ? scopes : [...MCP_SCOPES],
    tokenEndpointAuthMethod: method as TokenEndpointAuthMethod,
  };
}

/** The RFC 7591 §3.2.1 response for a stored client. */
export interface RegisteredClient {
  client_id: string;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at?: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  scope: string;
}

/**
 * Stores the client: no owner, no team, registration_type 'dynamic', PKCE
 * required. A public client ("none") gets no secret; its secret column
 * holds a value no bcrypt check can match, and the token endpoint never
 * checks one for it.
 */
export async function registerClient(
  client: ClientRegistration,
  now: Date = new Date(),
): Promise<RegisteredClient> {
  const publicClient = client.tokenEndpointAuthMethod === "none";
  const secret = publicClient ? null : generateClientSecret();
  const clientId = generateClientId();
  await db.insert(oauthApp).values({
    id: cuid(),
    name: client.name,
    description: null,
    clientId,
    clientSecretHash: secret
      ? await hashSecret(secret)
      : `public:${randomBytes(16).toString("hex")}`,
    redirectUris: client.redirectUris,
    scopes: client.scopes,
    isActive: true,
    ownerUserId: null,
    organizationId: null,
    logoUrl: null,
    websiteUrl: null,
    verified: false,
    pkceRequired: true,
    registrationType: DYNAMIC_REGISTRATION,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    createdAt: now,
    updatedAt: now,
  });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: [...GRANT_TYPES],
    response_types: ["code"],
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    scope: client.scopes.join(" "),
  };
}
