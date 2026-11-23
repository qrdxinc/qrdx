import "server-only";

import { database as db, invite } from "@repo/database";
import { and, count, eq, gte, isNotNull, type SQL } from "drizzle-orm";
import { countingInvites } from "./bonus";
import { ensureInviteCode } from "./codes";
import { InvitesNotReadyError, isMissingTableError } from "./missing-table";
import { bonusCodesFor } from "./rules";
import { INVITE_QUALIFY_DAYS } from "./terms";

// Settings → Invite friends: the person's link and how it's going, in counts
// only. It never says who signed up: an invite link can be shared publicly,
// so the people behind it stay private (the inviter sees how many, the
// friend never sees who invited them).

export interface InviteDashboard {
  code: string;
  /** Friends who signed up through the link */
  joined: number;
  /** Of those, the ones whose first code is still to come (within the window) */
  waiting: number;
  /** Friends the person has been rewarded for (at most the cap) */
  rewardedFriends: number;
  /** Extra dynamic codes the person's own workspace has from invites now */
  bonusCodes: number;
  /** They signed up through a friend's link and got the friend's reward */
  rewardedAsFriend: boolean;
}

/** The page's numbers; throws InvitesNotReadyError while the tables are missing. */
export async function loadInviteDashboard(
  userId: string,
  now: Date = new Date(),
): Promise<InviteDashboard> {
  // Friends who signed up since then still have time for their first code.
  const openSince = new Date(
    now.getTime() - INVITE_QUALIFY_DAYS * 24 * 60 * 60 * 1000,
  );
  const countOf = async (where: SQL | undefined) => {
    const [row] = await db.select({ total: count() }).from(invite).where(where);
    return Number(row?.total ?? 0);
  };
  const sent = eq(invite.inviterUserId, userId);
  try {
    const code = await ensureInviteCode(userId);
    const [joined, waiting, rewardedFriends, counting] = await Promise.all([
      countOf(sent),
      countOf(
        and(
          sent,
          eq(invite.status, "pending"),
          gte(invite.createdAt, openSince),
        ),
      ),
      countOf(and(sent, isNotNull(invite.inviterRewardSlot))),
      countingInvites(userId),
    ]);
    return {
      code,
      joined,
      waiting,
      rewardedFriends,
      bonusCodes: bonusCodesFor(counting),
      rewardedAsFriend: counting.asFriend > 0,
    };
  } catch (error) {
    if (isMissingTableError(error)) throw new InvitesNotReadyError();
    throw error;
  }
}
