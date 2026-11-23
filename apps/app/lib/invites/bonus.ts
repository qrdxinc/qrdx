import "server-only";

import { database as db, invite } from "@repo/database";
import { and, count, eq, isNotNull, isNull, or } from "drizzle-orm";
import { cache } from "react";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { noteMissingInviteTables } from "./missing-table";
import { bonusCodesFor, rewardsLeft } from "./rules";

// What a person's invites add to their own workspace's dynamic codes, worked
// out from the invite rows each time rather than kept as a number: at most
// eleven rows count (their own invite and ten friends'), both found through
// an index, and only a workspace with a capped plan asks (lib/code-limit.ts).
// A revoked row stops counting for new codes; codes already made stay.
//
// Fail safe: invites off here (a self-hosted copy), the tables not there
// yet, or a database error all count as no bonus, so the limit is never
// raised by mistake and creating codes never fails because of it.

/**
 * The invites that count for the person now: their own (rewarded, as the
 * friend) and the friends they were rewarded for, none revoked. At most
 * eleven rows. Throws like any query (callers decide what a failure means).
 */
export async function countingInvites(
  userId: string,
): Promise<{ asFriend: number; asInviter: number }> {
  const rows = await db
    .select({
      inviteeUserId: invite.inviteeUserId,
      inviterUserId: invite.inviterUserId,
      slot: invite.inviterRewardSlot,
    })
    .from(invite)
    .where(
      and(
        eq(invite.status, "rewarded"),
        isNull(invite.revokedAt),
        or(
          eq(invite.inviteeUserId, userId),
          and(
            eq(invite.inviterUserId, userId),
            isNotNull(invite.inviterRewardSlot),
          ),
        ),
      ),
    );
  return {
    asFriend: rows.filter((row) => row.inviteeUserId === userId).length,
    asInviter: rows.filter(
      (row) => row.inviterUserId === userId && row.slot !== null,
    ).length,
  };
}

/** Extra dynamic codes for the person's own workspace. Cached per request. */
export const inviteBonusCodes = cache(async (userId: string) => {
  if (!isFeatureAvailable("inviteRewards")) return 0;
  try {
    return bonusCodesFor(await countingInvites(userId));
  } catch (error) {
    if (!noteMissingInviteTables(error)) {
      logError(error as Error, { action: "invites.bonus" });
    }
    return 0;
  }
});

/**
 * Friends the person has been rewarded for, revoked ones included: each
 * took one of the slots an inviter has.
 */
export async function rewardedFriendCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(invite)
    .where(
      and(
        eq(invite.inviterUserId, userId),
        isNotNull(invite.inviterRewardSlot),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Whether inviting a friend would still earn the person more codes: invites
 * work here and they haven't been rewarded for the most friends yet. The
 * limit gate and the limit email only offer it then. Never throws.
 */
export const canStillEarnFromInvites = cache(async (userId: string) => {
  if (!isFeatureAvailable("inviteRewards")) return false;
  try {
    return rewardsLeft(await rewardedFriendCount(userId)) > 0;
  } catch (error) {
    if (!noteMissingInviteTables(error)) {
      logError(error as Error, { action: "invites.can_still_earn" });
    }
    return false;
  }
});
