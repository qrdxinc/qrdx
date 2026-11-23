// Dynamic client registration (RFC 7591) for MCP clients: ChatGPT, Claude,
// Cursor and VS Code register themselves at /api/oauth/register before they
// send someone to sign in, since none of them can be given a client ID by
// hand. Anyone can call it, so what it accepts is narrow:
//
// - redirect URIs: https://, or http:// on a loopback address for desktop
//   apps (any port at authorization time, RFC 8252 §7.3); never a QRdx host,
//   whose own redirects could carry a code on to someone else; up to 5, of
//   up to 512 characters;
// - authorization code + refresh token only, and PKCE (S256) always;
// - only the scopes the MCP server's sign-in tools use (MCP_SCOPES);
// - a name of up to 60 plain characters (NFKC, no invisible characters, no
//   Latin mixed with lookalike scripts), never one that reads "QRdx";
// - nothing else is stored: no logo, website or contacts, which would only
//   be the registrant's own claims on the consent screen.
//
// A registered client is never first-party: the consent screen always asks,
// marks it unverified and names it by the host it sends people back to
// (lib/oauth-apps/access.ts, builder.ts), and its tokens work on the MCP
// server only (lib/oauth.ts mcpOnly). Its rows say registration_type =
// 'dynamic'; those never used are deleted after a day
// (pruneUnusedDynamicClients, from the daily cron).
import "server-only";

import { randomBytes } from "node:crypto";
import { isQrdxHost } from "@repo/config";
import {
  database as db,
  oauthApp,
  oauthAuthorizationCode,
  oauthToken,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, inArray, lt, notExists } from "drizzle-orm";
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
/** A self-registered client's redirect URI: far shorter than an app's 2,048. */
export const MAX_DYNAMIC_REDIRECT_URI_LENGTH = 512;
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

// Control and format characters (soft hyphens, zero-width and bidi marks)
// and every default-ignorable one (variation selectors, the combining
// grapheme joiner): they render as nothing, so "QR\u00addx" would show as
// "QRdx".
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * Letters from other scripts that look like the Latin ones in "qrdx", for
 * the QRdx check only (the stored name keeps them).
 */
const LOOKALIKES: Record<string, string> = {
  // q
  "\u051b": "q", // Cyrillic qa
  "\u0566": "q", // Armenian za
  // r
  "\u0433": "r", // Cyrillic ghe
  "\u1d26": "r", // Greek letter small capital gamma
  "\u2c85": "r", // Coptic gamma
  // d
  "\u0501": "d", // Cyrillic komi de
  "\u13e7": "d", // Cherokee
  "\u146f": "d", // Canadian syllabics
  // x
  "\u0445": "x", // Cyrillic ha
  "\u03c7": "x", // Greek chi
  "\u00d7": "x", // multiplication sign
  "\u2179": "x", // small roman numeral ten (NFKC folds it too)
  "\u1541": "x", // Canadian syllabics
};
const LOOKALIKE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

/** The name as compared with "qrdx": NFKC, lower case, lookalikes folded. */
function asLatin(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(LOOKALIKE, (char) => LOOKALIKES[char] ?? char);
}

/** Latin letters next to Cyrillic, Greek or Armenian ones: a mixed-script spoof. */
const mixesScripts = (name: string) =>
  /\p{Script=Latin}/u.test(name) &&
  /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}]/u.test(name);

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
  // NFKC first: fullwidth and other compatibility forms become plain
  // letters ("ＱＲｄｘ" is "QRdx"), and the stored name is the one shown.
  const name = value
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  if (name.length > MAX_APP_NAME_LENGTH) {
    return metadataError(
      `client_name can be up to ${MAX_APP_NAME_LENGTH} characters.`,
    );
  }
  if (mixesScripts(name)) {
    return metadataError(
      "client_name can't mix Latin letters with Cyrillic, Greek or Armenian ones.",
    );
  }
  if (asLatin(name).includes("qrdx")) {
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
    if (input.length > MAX_DYNAMIC_REDIRECT_URI_LENGTH) {
      return redirectError(
        `${input.slice(0, 80)}…: redirect URIs can be up to ${MAX_DYNAMIC_REDIRECT_URI_LENGTH} characters.`,
      );
    }
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

/**
 * The address a registration counts against: an IPv4 address as it is, an
 * IPv6 one by its /64 (one network hands out the rest of it freely).
 */
export function rateLimitAddress(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1]) return mapped[1];
  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
          ...right,
        ];
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0");
  return `${prefix.join(":")}::/64`;
}

/** How long a registered client may go unused before it's deleted. */
export const UNUSED_CLIENT_HOURS = 24;
/**
 * ChatGPT registers once per connection, when the app is set up, and
 * reuses that client for everyone; the first person may sign in days
 * later. Its clients get longer.
 */
export const UNUSED_CHATGPT_CLIENT_DAYS = 30;
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

const sendsToChatGpt = (uris: unknown) =>
  Array.isArray(uris) &&
  uris.some((uri) => {
    try {
      return CHATGPT_HOSTS.has(new URL(String(uri)).hostname);
    } catch {
      return false;
    }
  });

/**
 * Deletes self-registered clients nobody ever used: registered more than a
 * day ago (30 days for ChatGPT's), never marked used (updated_at is still
 * created_at: the first authorization code moves it), and with no
 * authorization code or token. A client that ever issued a token is never
 * deleted. At most `limit` a run; returns how many went.
 */
export async function pruneUnusedDynamicClients(
  now: Date = new Date(),
  { limit = 500 }: { limit?: number } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - UNUSED_CLIENT_HOURS * 3_600_000);
  const chatGptCutoff = new Date(
    now.getTime() - UNUSED_CHATGPT_CLIENT_DAYS * 86_400_000,
  );
  const unused = and(
    eq(oauthApp.registrationType, DYNAMIC_REGISTRATION),
    lt(oauthApp.createdAt, cutoff),
    eq(oauthApp.updatedAt, oauthApp.createdAt),
    notExists(
      db
        .select({ id: oauthAuthorizationCode.id })
        .from(oauthAuthorizationCode)
        .where(eq(oauthAuthorizationCode.appId, oauthApp.id)),
    ),
    notExists(
      db
        .select({ id: oauthToken.id })
        .from(oauthToken)
        .where(eq(oauthToken.appId, oauthApp.id)),
    ),
  );
  const candidates = await db
    .select({
      id: oauthApp.id,
      createdAt: oauthApp.createdAt,
      redirectUris: oauthApp.redirectUris,
    })
    .from(oauthApp)
    .where(unused)
    .limit(limit);
  const ids = candidates
    .filter(
      (row) =>
        !sendsToChatGpt(row.redirectUris) ||
        new Date(row.createdAt) < chatGptCutoff,
    )
    .map((row) => row.id);
  if (ids.length === 0) return 0;
  // The same conditions again: a sign-in that started meanwhile keeps it.
  const deleted = await db
    .delete(oauthApp)
    .where(and(inArray(oauthApp.id, ids), unused))
    .returning({ id: oauthApp.id });
  return deleted.length;
}

/**
 * Marks a self-registered client used, on its first authorization code:
 * pruneUnusedDynamicClients never deletes it after that, even if every
 * account that signed in through it is deleted later.
 */
export async function markDynamicClientUsed(
  appId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(oauthApp)
    .set({ updatedAt: now })
    .where(
      and(
        eq(oauthApp.id, appId),
        eq(oauthApp.registrationType, DYNAMIC_REGISTRATION),
        eq(oauthApp.updatedAt, oauthApp.createdAt),
      ),
    );
}
