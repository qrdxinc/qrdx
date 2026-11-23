// Dynamic client registration (RFC 7591) for MCP clients: ChatGPT, Claude,
// Cursor and VS Code register themselves at /api/oauth/register before they
// send someone to sign in, since none of them can be given a client ID by
// hand. Anyone can call it, so what it accepts is narrow:
//
// - redirect URIs: https://, or http:// on a loopback address for desktop
//   apps (any port at authorization time, RFC 8252 §7.3); never a QRdx host,
//   whose own redirects could carry a code on to someone else; up to 5, of
//   up to 512 characters and 1,024 together;
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
// 'dynamic'; those never used are deleted after a week
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
import { and, asc, eq, inArray, lt, notExists } from "drizzle-orm";
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
/** All of its redirect URIs together, which bounds a row's size. */
export const MAX_DYNAMIC_REDIRECT_URIS_LENGTH = 1024;
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
 * A confusables skeleton for the four letters of "qrdx" (after UTS #39's
 * confusables.txt): characters that look like q, r, d or x, in any case,
 * mapped to the Latin letter, for the QRdx check only (the stored name keeps
 * them). NFKC already folds the compatibility forms (fullwidth, math
 * letters, roman numerals, ℛ and friends).
 */
const LOOKALIKES: Record<string, string> = {
  // q, Q
  "\u051b": "q", // ԛ Cyrillic small qa
  "\u051a": "q", // Ԛ Cyrillic capital qa
  "\u0566": "q", // զ Armenian small za
  "\u0563": "q", // գ Armenian small gim
  "\u024b": "q", // ɋ q with hook tail
  "\u02a0": "q", // ʠ q with hook
  "\ua7af": "q", // ꞯ Latin small capital q
  "\u2d55": "q", // ⵕ Tifinagh yarr
  // r, R
  "\u0433": "r", // г Cyrillic small ghe
  "\u1d26": "r", // ᴦ Greek letter small capital gamma
  "\u2c85": "r", // ⲅ Coptic small gamma
  "\uab47": "r", // ꭇ Latin small r without handle
  "\uab48": "r", // ꭈ Latin small double r
  "\uab81": "r", // ꮁ Cherokee small hu
  "\u0280": "r", // ʀ Latin small capital r
  "\u1d19": "r", // ᴙ Latin small capital reversed r
  "\u027e": "r", // ɾ r with fishhook
  "\u01a6": "r", // Ʀ Latin letter yr
  "\u13d2": "r", // Ꮢ Cherokee sv
  "\u13a1": "r", // Ꭱ Cherokee e
  "\u1587": "r", // ᖇ Canadian syllabics tlhi
  "\ua4e3": "r", // ꓣ Lisu letter zha
  "\u16b1": "r", // ᚱ runic raido
  // d, D
  "\u0501": "d", // ԁ Cyrillic small komi de
  "\u0500": "d", // Ԁ Cyrillic capital komi de
  "\u13e7": "d", // Ꮷ Cherokee tsu
  "\u146f": "d", // ᑯ Canadian syllabics ko
  "\ua4d2": "d", // ꓒ Lisu letter pha
  "\u1d05": "d", // ᴅ Latin small capital d
  "\u0257": "d", // ɗ d with hook
  "\u13a0": "d", // Ꭰ Cherokee a
  "\uab70": "d", // ꭰ Cherokee small a
  "\u15de": "d", // ᗞ Canadian syllabics carrier the
  "\u15ea": "d", // ᗪ Canadian syllabics carrier pe
  "\ua4d3": "d", // ꓓ Lisu letter da
  // x, X
  "\u0445": "x", // х Cyrillic small ha
  "\u0425": "x", // Х Cyrillic capital ha
  "\u03c7": "x", // χ Greek small chi
  "\u03a7": "x", // Χ Greek capital chi
  "\uab53": "x", // ꭓ Latin small chi
  "\u00d7": "x", // × multiplication sign
  "\u2a2f": "x", // ⨯ vector or cross product
  "\u1541": "x", // ᕁ Canadian syllabics sayisi yi
  "\u157d": "x", // ᕽ Canadian syllabics hk
  "\u166e": "x", // ᙮ Canadian syllabics full stop
  "\u2cac": "x", // Ⲭ Coptic capital khi
  "\u2cad": "x", // ⲭ Coptic small khi
  "\u16b7": "x", // ᚷ runic gebo
  "\u2573": "x", // ╳ box drawings diagonal cross
  "\ua4eb": "x", // ꓫ Lisu letter sha
  "\u292b": "x", // ⤫ rising diagonal crossing falling diagonal
  "\u292c": "x", // ⤬ falling diagonal crossing rising diagonal
};
const LOOKALIKE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "gu");
const fold = (text: string) =>
  text.replace(LOOKALIKE, (char) => LOOKALIKES[char] ?? char);

/**
 * The name as compared with "qrdx": NFKC, lookalikes folded (before and
 * after lower-casing, which turns some capitals into other lookalikes),
 * lower case, and spaces, dots, dashes and other separators dropped, so
 * "Q.R d-x" reads as "qrdx" too.
 */
function asLatin(name: string): string {
  return fold(fold(name.normalize("NFKC")).toLowerCase()).replace(
    /[\p{Z}\p{P}\p{S}]/gu,
    "",
  );
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
  if (
    value.reduce((sum, input) => sum + input.length, 0) >
    MAX_DYNAMIC_REDIRECT_URIS_LENGTH
  ) {
    return redirectError(
      `Redirect URIs can be up to ${MAX_DYNAMIC_REDIRECT_URIS_LENGTH} characters together.`,
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

/**
 * How long a registered client may go unused before it's deleted: one
 * window for every client. A week covers ChatGPT, which registers once when
 * a connection is set up and reuses that client for everyone, so its first
 * sign-in may come days later.
 */
export const UNUSED_CLIENT_DAYS = 7;
/** Rows deleted per statement. */
const PRUNE_BATCH = 500;

/**
 * Deletes self-registered clients nobody ever used: registered more than
 * UNUSED_CLIENT_DAYS ago, never marked used (updated_at is still
 * created_at: the first authorization code moves it), and with no
 * authorization code or token. A client that ever issued a token is never
 * deleted. Oldest first, in batches, until none are left or `deadline`
 * (epoch ms) passes; returns how many went.
 */
export async function pruneUnusedDynamicClients({
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
}: {
  now?: Date;
  deadline?: number;
} = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - UNUSED_CLIENT_DAYS * 86_400_000);
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
  let deleted = 0;
  while (Date.now() < deadline) {
    const batch = await db
      .select({ id: oauthApp.id })
      .from(oauthApp)
      .where(unused)
      .orderBy(asc(oauthApp.createdAt), asc(oauthApp.id))
      .limit(PRUNE_BATCH);
    if (batch.length === 0) break;
    // The same conditions again: a sign-in that started meanwhile keeps it.
    const gone = await db
      .delete(oauthApp)
      .where(
        and(
          inArray(
            oauthApp.id,
            batch.map((row) => row.id),
          ),
          unused,
        ),
      )
      .returning({ id: oauthApp.id });
    deleted += gone.length;
    if (batch.length < PRUNE_BATCH || gone.length === 0) break;
  }
  return deleted;
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
