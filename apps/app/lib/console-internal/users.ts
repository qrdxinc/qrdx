import "server-only";

import { ADMIN_ROLE, isAdmin } from "@repo/auth/admin";
import { auth } from "@repo/auth/server";
import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import type {
  AdminActionOutcome,
  AdminActor,
} from "@/app/(app)/admin/_lib/action-runner";
import { adminError } from "@/app/(app)/admin/_lib/action-runner";
import {
  findAdminTarget,
  refreshCommunity,
  type StrongCheck,
  userAudit,
} from "@/app/(app)/admin/_lib/operations";

// Ban, unban, role and sign-out for the back-office console. The admin pages
// call Better Auth's admin endpoints (auth.api.banUser and the rest), which
// need the admin's own session cookie; the console's calls carry none. So
// these run what those endpoints run, through Better Auth's internal adapter
// (better-auth/dist/plugins/admin/routes.mjs, 1.7.14): the same updates and
// session deletion, with the same database hooks, after the same checks the
// admin actions make (../../app/(app)/admin/actions.ts).

const DAY_SECONDS = 24 * 60 * 60;

const adapter = async () => (await auth.$context).internalAdapter;

/**
 * Whether the target is an admin now: the role, or ADMIN_EMAILS (verified
 * addresses) / ADMIN_USER_IDS. Banning, unbanning, signing out or demoting
 * one takes the acting admin's strong confirmation, as on the admin pages: a
 * stolen console cookie alone must not lock the other admins out, or let a
 * banned admin back in.
 */
async function targetIsAdmin(userId: string): Promise<boolean> {
  const [found] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return found ? isAdmin(found) : false;
}

/** As banUserAction: signs them out everywhere and blocks new sign-ins. */
export async function banUserForConsole(
  admin: AdminActor,
  {
    userId,
    reason,
    expiresInDays,
  }: { userId: string; reason: string; expiresInDays?: number },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  if (userId === admin.id) throw adminError("You cannot ban yourself");
  const target = await findAdminTarget(userId);
  if (await targetIsAdmin(userId)) await requireStrong();
  const internal = await adapter();
  await internal.updateUser(userId, {
    banned: true,
    banReason: reason,
    banExpires: expiresInDays
      ? new Date(Date.now() + expiresInDays * DAY_SECONDS * 1000)
      : null,
    updatedAt: new Date(),
  });
  await internal.deleteUserSessions(userId);
  // A banned account's community themes leave the gallery now, not when
  // the cache next expires.
  refreshCommunity();
  return userAudit(target, { expiresInDays: expiresInDays ?? null });
}

/**
 * As unbanUserAction. Unbanning an admin hands the console back to them, so
 * it takes the same strong confirmation as banning one.
 */
export async function unbanUserForConsole(
  _admin: AdminActor,
  { userId }: { userId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  const target = await findAdminTarget(userId);
  if (await targetIsAdmin(userId)) await requireStrong();
  await (await adapter()).updateUser(userId, {
    banned: false,
    banExpires: null,
    banReason: null,
    updatedAt: new Date(),
  });
  refreshCommunity();
  return userAudit(target);
}

/** As setUserRoleAction; nothing to record when the role is already so. */
export async function setUserRoleForConsole(
  admin: AdminActor,
  { userId, role }: { userId: string; role: "user" | typeof ADMIN_ROLE },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined> | null> {
  if (userId === admin.id && role !== ADMIN_ROLE) {
    throw adminError("You cannot remove your own admin role");
  }
  const target = await findAdminTarget(userId);
  if ((target.role ?? "user") === role) return null;
  // Granting the role hands over the console; removing it from another
  // admin locks them out. Both take a strong confirmation.
  await requireStrong();
  await (await adapter()).updateUser(userId, { role });
  return userAudit(target, { from: target.role, to: role });
}

/**
 * As revokeUserSessionsAction: every session on every device. For an admin
 * it takes the strong confirmation (it signs them out of the console too).
 */
export async function revokeUserSessionsForConsole(
  _admin: AdminActor,
  { userId }: { userId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  const target = await findAdminTarget(userId);
  if (await targetIsAdmin(userId)) await requireStrong();
  await (await adapter()).deleteUserSessions(userId);
  return userAudit(target);
}
