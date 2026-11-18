import "server-only";

import { createHash } from "node:crypto";
import { adminConsoleGrant, database as db } from "@repo/database";
import { and, eq, lte } from "drizzle-orm";
import { isMissingSchemaError } from "@/lib/community/tables";
import { generateSecureToken } from "@/lib/oauth";
import { ADMIN_CONSOLE_GRANT_SECONDS } from "./client";

// The console's grants: proof of which admin is at the console. At each
// console sign-in (./token.ts) this app mints a random grant for that admin
// and the qrdx.dev session they signed in with, and hands it to the console
// with the code exchange. The console keeps it only in the admin's sealed
// session cookie and sends it in every signed call's actor
// (lib/console-internal/actor.ts), where it must name that same admin and
// session. Only its SHA-256 is stored (admin_console_grant), so neither the
// database nor the console's server holds a usable grant for an admin who
// isn't using the console. A row goes with its session and its user.
//
// Before manual-sql/2026-11-18-console-grants.sql is applied, sign-in mints
// none (logged once per process) and no presented grant can hold.

/** The row's key for a grant: never the grant itself. */
export const grantHash = (grant: string): string =>
  createHash("sha256").update(grant).digest("base64url");

let warnedMissing = false;

function warnMissing(): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    JSON.stringify({
      event: "admin_console.grants_missing",
      detail: "manual-sql/2026-11-18-console-grants.sql isn't applied",
    }),
  );
}

/**
 * A new grant (plaintext, sent to the console once) for this admin's console
 * sign-in, or null when the table isn't there yet. Their expired grants go.
 */
export async function mintAdminConsoleGrant(
  { userId, sessionId }: { userId: string; sessionId: string },
  now: Date = new Date(),
): Promise<string | null> {
  const grant = generateSecureToken();
  try {
    await db
      .delete(adminConsoleGrant)
      .where(
        and(
          eq(adminConsoleGrant.userId, userId),
          lte(adminConsoleGrant.expiresAt, now),
        ),
      );
    await db.insert(adminConsoleGrant).values({
      tokenHash: grantHash(grant),
      userId,
      sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ADMIN_CONSOLE_GRANT_SECONDS * 1000),
    });
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    warnMissing();
    return null;
  }
  return grant;
}

/**
 * Whether `grant` is one this app minted for this admin and this qrdx.dev
 * session, and still good. False before the table exists: none was minted.
 */
export async function isAdminConsoleGrant(
  grant: string,
  { userId, sessionId }: { userId: string; sessionId: string },
  now: Date = new Date(),
): Promise<boolean> {
  let row: { userId: string; sessionId: string; expiresAt: Date } | undefined;
  try {
    [row] = await db
      .select({
        userId: adminConsoleGrant.userId,
        sessionId: adminConsoleGrant.sessionId,
        expiresAt: adminConsoleGrant.expiresAt,
      })
      .from(adminConsoleGrant)
      .where(eq(adminConsoleGrant.tokenHash, grantHash(grant)))
      .limit(1);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    warnMissing();
    return false;
  }
  return Boolean(
    row &&
      row.userId === userId &&
      row.sessionId === sessionId &&
      new Date(row.expiresAt).getTime() > now.getTime(),
  );
}
