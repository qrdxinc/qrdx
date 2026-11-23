import "server-only";

import {
  database as db,
  INVITE_STATUSES,
  type InviteStatus,
  invite,
  inviteCode,
} from "@repo/database";
import { count, eq } from "drizzle-orm";
import { noteMissingInviteTables } from "./missing-table";

/**
 * For Settings → Download my data (lib/account/export): the person's invite
 * code, how many friends signed up through it by outcome (counts only, as
 * Invite friends shows them: nothing about any one friend), and their own
 * invite if a friend's link brought them in (its outcome and dates, not
 * whose link). Null before the tables exist or when there's nothing, so
 * the export never fails on them.
 */
export async function exportInviteData(userId: string) {
  try {
    const [[code], sent, [received]] = await Promise.all([
      db
        .select({ code: inviteCode.code, createdAt: inviteCode.createdAt })
        .from(inviteCode)
        .where(eq(inviteCode.userId, userId))
        .limit(1),
      db
        .select({ status: invite.status, total: count() })
        .from(invite)
        .where(eq(invite.inviterUserId, userId))
        .groupBy(invite.status),
      db
        .select({
          signedUpAt: invite.createdAt,
          status: invite.status,
          decidedAt: invite.decidedAt,
        })
        .from(invite)
        .where(eq(invite.inviteeUserId, userId))
        .limit(1),
    ]);
    if (!(code || sent.length > 0 || received)) return null;
    const byOutcome = Object.fromEntries(
      INVITE_STATUSES.map((status) => [status, 0]),
    ) as Record<InviteStatus, number>;
    for (const row of sent) {
      byOutcome[row.status as InviteStatus] = Number(row.total);
    }
    return {
      inviteCode: code?.code ?? null,
      inviteCodeCreatedAt: code?.createdAt ?? null,
      // Friends who signed up through your link, counted by outcome.
      friendsInvited: byOutcome,
      // Your own invite, if a friend's link brought your account in (not whose).
      invitedByAFriend: received ?? null,
    };
  } catch (error) {
    if (noteMissingInviteTables(error)) return null;
    throw error;
  }
}
