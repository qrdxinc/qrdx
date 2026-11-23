import "server-only";

import { database as db, invite, inviteCode } from "@repo/database";
import { eq } from "drizzle-orm";
import { noteMissingInviteTables } from "./missing-table";

/**
 * For Settings → Download my data (lib/account/export): the person's invite
 * code, the invites it brought in and whether their own account came through
 * one. Never who: an invite record names the friend or the inviter only to
 * QRdx. Null before the tables exist or when there's nothing, so the export
 * never fails on them.
 */
export async function exportInviteData(userId: string) {
  try {
    const [code] = await db
      .select({ code: inviteCode.code, createdAt: inviteCode.createdAt })
      .from(inviteCode)
      .where(eq(inviteCode.userId, userId))
      .limit(1);
    const [sent, received] = await Promise.all([
      db
        .select({
          signedUpAt: invite.createdAt,
          status: invite.status,
          decidedAt: invite.decidedAt,
          rewardedYou: invite.inviterRewardSlot,
          revokedAt: invite.revokedAt,
        })
        .from(invite)
        .where(eq(invite.inviterUserId, userId)),
      db
        .select({
          signedUpAt: invite.createdAt,
          status: invite.status,
          decidedAt: invite.decidedAt,
          revokedAt: invite.revokedAt,
        })
        .from(invite)
        .where(eq(invite.inviteeUserId, userId))
        .limit(1),
    ]);
    if (!(code || sent.length > 0 || received.length > 0)) return null;
    return {
      inviteCode: code?.code ?? null,
      inviteCodeCreatedAt: code?.createdAt ?? null,
      // Friends who signed up through your link: when, and how it went.
      friendsInvited: sent.map((row) => ({
        signedUpAt: row.signedUpAt,
        status: row.status,
        decidedAt: row.decidedAt,
        rewardedYou: row.rewardedYou !== null,
        revokedAt: row.revokedAt,
      })),
      // That a friend's link brought your account in, never whose.
      invitedByAFriend: received[0] ?? null,
    };
  } catch (error) {
    if (noteMissingInviteTables(error)) return null;
    throw error;
  }
}
