import "server-only";

import { isAdmin } from "@repo/auth/admin";
import { database as db, session, user } from "@repo/database";
import { and, eq, gt } from "drizzle-orm";
import type { AdminUser } from "@/app/(app)/admin/_lib/guard";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import { hasRecentStrongConfirmation } from "@/lib/account/confirmation-server";
import { HttpError } from "@/lib/http-error";
import { isBanActive } from "@/lib/oauth";

// Who a console call runs as. The console names its admin and the qrdx.dev
// session its own session was made from; this app checks both again on every
// call, against its own database and admin lists, instead of trusting the
// console's word: the admin rule (role, ADMIN_EMAILS, ADMIN_USER_IDS), a
// verified email, no ban in force, and that session alive and theirs.

export interface ConsoleActorClaim {
  userId: string;
  sessionId: string;
}

export interface ConsoleActor extends AdminUser {
  sessionId: string;
  twoFactorEnabled: boolean;
}

/** The admin the console acts for, or null when the claim doesn't hold. */
export async function loadConsoleActor(
  claim: ConsoleActorClaim,
  now: Date = new Date(),
): Promise<ConsoleActor | null> {
  const [[found], [alive]] = await Promise.all([
    db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        banned: user.banned,
        banExpires: user.banExpires,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .where(eq(user.id, claim.userId))
      .limit(1),
    db
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.id, claim.sessionId),
          eq(session.userId, claim.userId),
          gt(session.expiresAt, now),
        ),
      )
      .limit(1),
  ]);
  if (!(found && alive)) return null;
  if (found.emailVerified !== true || isBanActive(found, now)) return null;
  if (!isAdmin(found)) return null;
  return {
    id: found.id,
    email: found.email,
    name: found.name,
    role: found.role ?? null,
    sessionId: claim.sessionId,
    twoFactorEnabled: found.twoFactorEnabled === true,
  };
}

/**
 * The core's strong-admin rule (app/(app)/admin/_lib/strong-admin.ts) for
 * the console's session: two-step verification on the admin's account, and
 * a confirmation with a passkey, an authenticator code or a backup code in
 * the last 10 minutes by the qrdx.dev session the console signed in with.
 * This app can't see whether that session is held (no visitor headers
 * reach it), so the confirmation alone decides, as in the console.
 */
export async function requireStrongConsoleActor(
  actor: Pick<ConsoleActor, "id" | "sessionId" | "twoFactorEnabled">,
): Promise<void> {
  if (!actor.twoFactorEnabled) {
    throw new HttpError(
      400,
      "ADMIN_ACTION",
      "Turn on two-step verification for your own account first.",
    );
  }
  const confirmed = await hasRecentStrongConfirmation({
    userId: actor.id,
    sessionId: actor.sessionId,
    held: false,
  });
  if (!confirmed) {
    throw new HttpError(403, "ADMIN_ACTION", CONFIRMATION_REQUIRED);
  }
}
