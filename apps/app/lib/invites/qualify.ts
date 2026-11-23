import "server-only";

import { database as db, invite } from "@repo/database";
import { and, eq, max } from "drizzle-orm";
import { after } from "next/server";
import { isSelfReferral } from "@/lib/affiliates/self-referral";
import { trackServer } from "@/lib/analytics/server";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { isUniqueViolation } from "@/lib/slug-claims";
import { noteMissingInviteTables } from "./missing-table";
import { isWithinQualifyWindow } from "./rules";
import { INVITE_MAX_REWARDED_FRIENDS } from "./terms";

// An invite counts when the friend makes their first dynamic code within
// INVITE_QUALIFY_DAYS of signing up: then the friend's own workspace gets
// INVITE_BONUS_CODES more, and so does the inviter's while they've been
// rewarded for fewer than INVITE_MAX_REWARDED_FRIENDS friends. Every way of
// making a code goes through createCodesBatch
// (app/(app)/dashboard/codes/_lib/qr-codes.ts: the dashboard, the editor,
// hosted pages, imports, the REST API, the MCP server and the chat bots),
// which calls noteDynamicCodesCreated after the codes are saved.
//
// Decided once: the first code after sign-up settles the invite (rewarded,
// expired past the window, or refused as self-referral, checked again here
// because people can join a workspace after signing up). One UPDATE ... WHERE
// status = 'pending' decides it, so two codes made at once reward it once.
// The inviter's reward then takes the next of their numbered slots; the
// slots are unique per inviter, so two friends qualifying at once can't both
// take the last one (the loser's write fails, and the next try finds none
// left).
//
// A code deleted straight after doesn't undo the reward: the grant stands.
// A code held for a safety check (made switched off) doesn't count.

export type QualifyOutcome =
  | {
      outcome: "rewarded";
      inviterUserId: string | null;
      inviterSlot: number | null;
    }
  | {
      outcome:
        | "unavailable"
        | "no_invite"
        | "decided"
        | "expired"
        | "self_referral"
        | "missing_tables"
        | "error";
    };

/** Tries at the inviter's next slot when another friend took the same one. */
const SLOT_TRIES = 4;

/**
 * Gives invite `id` its inviter's next reward slot (1 to the cap) and returns
 * it, or null when they've been rewarded for the most friends. The slots are
 * unique per inviter: when another friend's invite takes the same number at
 * the same moment, the write fails and the next number is tried.
 */
async function takeInviterSlot(
  id: string,
  inviterUserId: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < SLOT_TRIES; attempt++) {
    const [taken] = await db
      .select({ last: max(invite.inviterRewardSlot) })
      .from(invite)
      .where(eq(invite.inviterUserId, inviterUserId));
    const next = Number(taken?.last ?? 0) + 1;
    if (next > INVITE_MAX_REWARDED_FRIENDS) return null;
    try {
      await db
        .update(invite)
        .set({ inviterRewardSlot: next })
        .where(eq(invite.id, id));
      return next;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  // Taken every time: log it rather than guess.
  console.error(JSON.stringify({ event: "invites.slot_contended" }));
  return null;
}

/**
 * Settles the person's invite, if they have an open one, now that they've
 * made a dynamic code. Never throws.
 */
export async function qualifyInvite(
  inviteeUserId: string,
  now: Date = new Date(),
): Promise<QualifyOutcome> {
  if (!isFeatureAvailable("inviteRewards")) return { outcome: "unavailable" };
  try {
    const [row] = await db
      .select({
        id: invite.id,
        inviterUserId: invite.inviterUserId,
        status: invite.status,
        createdAt: invite.createdAt,
      })
      .from(invite)
      .where(eq(invite.inviteeUserId, inviteeUserId))
      .limit(1);
    if (!row) return { outcome: "no_invite" };
    if (row.status !== "pending") return { outcome: "decided" };

    const open = and(eq(invite.id, row.id), eq(invite.status, "pending"));
    if (!isWithinQualifyWindow(row.createdAt, now)) {
      await db
        .update(invite)
        .set({ status: "expired", decidedAt: now })
        .where(open);
      return { outcome: "expired" };
    }
    if (
      row.inviterUserId &&
      (await isSelfReferral({
        affiliateUserId: row.inviterUserId,
        customerUserId: inviteeUserId,
      }))
    ) {
      await db
        .update(invite)
        .set({ status: "self_referral", decidedAt: now })
        .where(open);
      return { outcome: "self_referral" };
    }

    // The friend's reward: exactly one code made now gets past this.
    const [decided] = await db
      .update(invite)
      .set({ status: "rewarded", decidedAt: now })
      .where(open)
      .returning({ inviterUserId: invite.inviterUserId });
    // Another code made at the same moment decided it first.
    if (!decided) return { outcome: "decided" };
    // The inviter's, while they have slots left (and an account).
    const inviterSlot = decided.inviterUserId
      ? await takeInviterSlot(row.id, decided.inviterUserId)
      : null;
    console.info(
      JSON.stringify({
        event: "invites.rewarded",
        inviter_rewarded: inviterSlot !== null,
      }),
    );
    return {
      outcome: "rewarded",
      inviterUserId: decided.inviterUserId,
      inviterSlot,
    };
  } catch (error) {
    if (noteMissingInviteTables(error)) return { outcome: "missing_tables" };
    logError(error as Error, { action: "invites.qualify" });
    return { outcome: "error" };
  }
}

/** Runs `task` after the response, or now when there's no request. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): run now.
    void task();
  }
}

/**
 * After someone makes dynamic codes: settles their invite (if they have an
 * open one) after the response, rewards both sides and emails the inviter.
 * `counted`: at least one of the codes was saved switched on (a code held
 * for a safety check doesn't count). Returns at once; never throws.
 */
export function noteDynamicCodesCreated(
  userId: string,
  { counted }: { counted: boolean },
): void {
  try {
    if (!(counted && isFeatureAvailable("inviteRewards"))) return;
    afterResponse(async () => {
      const result = await qualifyInvite(userId);
      if (result.outcome !== "rewarded") return;
      const inviterRewarded =
        result.inviterSlot !== null && result.inviterUserId !== null;
      trackServer("invite_reward_granted", {
        inviter_rewarded: inviterRewarded,
      });
      if (inviterRewarded) {
        const { sendInviteRewardEmail } = await import("./notify");
        await sendInviteRewardEmail({
          inviterUserId: result.inviterUserId as string,
          rewardedFriends: result.inviterSlot as number,
        });
      }
    });
  } catch (error) {
    logError(error as Error, { action: "invites.note_codes" });
  }
}
