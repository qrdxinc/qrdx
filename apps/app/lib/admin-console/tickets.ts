import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { database as db, verification } from "@repo/database";
import { eq } from "drizzle-orm";
import { generateSecureToken } from "@/lib/oauth";
import {
  ADMIN_CONSOLE_ACCESS_TOKEN_SECONDS,
  ADMIN_CONSOLE_CODE_SECONDS,
  ADMIN_CONSOLE_TOKEN_PREFIX,
  type AdminConsoleScope,
} from "./client";

// The console client's one-time tickets: its authorization codes and its
// access tokens. Each is a random secret whose SHA-256 names a `verification`
// row (as "Confirm it's you" does, packages/auth/confirm-sign-in.ts) holding
// who it's for, for a short time. Reading one deletes it, so a code or token
// can be used exactly once, and two exchanges of one code can't both win.
// They never touch oauth_authorization_code or oauth_token, whose rows
// belong to oauth_app rows; the console isn't one.

export const CODE_IDENTIFIER_PREFIX = "qrdx-console-code-";
export const TOKEN_IDENTIFIER_PREFIX = "qrdx-console-token-";

/** What a code remembers until the console exchanges it. */
export interface AdminConsoleCode {
  userId: string;
  /** This app's session that signed in: strong confirmations belong to it. */
  sessionId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: AdminConsoleScope[];
}

/** What an access token opens userinfo for. */
export interface AdminConsoleGrant {
  userId: string;
  sessionId: string;
  scopes: AdminConsoleScope[];
}

/** The row's identifier for a secret: never the secret itself. */
export function ticketIdentifier(prefix: string, secret: string): string {
  return `${prefix}${createHash("sha256").update(secret).digest("base64url")}`;
}

async function issue(prefix: string, value: object, seconds: number) {
  const secret = generateSecureToken();
  const now = new Date();
  await db.insert(verification).values({
    id: randomUUID(),
    identifier: ticketIdentifier(prefix, secret),
    value: JSON.stringify(value),
    expiresAt: new Date(now.getTime() + seconds * 1000),
    createdAt: now,
    updatedAt: now,
  });
  return secret;
}

/** Deletes the row the secret names and returns its value, unless expired. */
async function consume<T>(
  prefix: string,
  secret: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  const [row] = await db
    .delete(verification)
    .where(eq(verification.identifier, ticketIdentifier(prefix, secret)))
    .returning({
      value: verification.value,
      expiresAt: verification.expiresAt,
    });
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  try {
    return parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isScopes = (value: unknown): value is AdminConsoleScope[] =>
  Array.isArray(value) && value.every(isString);

function parseCode(value: unknown): AdminConsoleCode | null {
  const v = value as Partial<AdminConsoleCode> | null;
  if (
    v &&
    isString(v.userId) &&
    isString(v.sessionId) &&
    isString(v.redirectUri) &&
    isString(v.codeChallenge) &&
    isScopes(v.scopes)
  ) {
    return {
      userId: v.userId,
      sessionId: v.sessionId,
      redirectUri: v.redirectUri,
      codeChallenge: v.codeChallenge,
      scopes: v.scopes,
    };
  }
  return null;
}

function parseGrant(value: unknown): AdminConsoleGrant | null {
  const v = value as Partial<AdminConsoleGrant> | null;
  if (v && isString(v.userId) && isString(v.sessionId) && isScopes(v.scopes)) {
    return { userId: v.userId, sessionId: v.sessionId, scopes: v.scopes };
  }
  return null;
}

/** A new code (plaintext, sent to the console once). */
export const issueAdminConsoleCode = (code: AdminConsoleCode) =>
  issue(CODE_IDENTIFIER_PREFIX, code, ADMIN_CONSOLE_CODE_SECONDS);

/** The code's details, once; null when unknown, used or expired. */
export const consumeAdminConsoleCode = (code: string) =>
  consume(CODE_IDENTIFIER_PREFIX, code, parseCode);

/** A new access token (plaintext), recognisable by its prefix. */
export async function issueAdminConsoleAccessToken(
  grant: AdminConsoleGrant,
): Promise<string> {
  const secret = await issue(
    TOKEN_IDENTIFIER_PREFIX,
    grant,
    ADMIN_CONSOLE_ACCESS_TOKEN_SECONDS,
  );
  return `${ADMIN_CONSOLE_TOKEN_PREFIX}${secret}`;
}

/** The token's grant, once; null when unknown, used or expired. */
export function consumeAdminConsoleAccessToken(
  token: string,
): Promise<AdminConsoleGrant | null> {
  return consume(
    TOKEN_IDENTIFIER_PREFIX,
    token.slice(ADMIN_CONSOLE_TOKEN_PREFIX.length),
    parseGrant,
  );
}
