import "server-only";

import { database as db, invite, qrCode } from "@repo/database";
import { and, asc, eq, exists, isNotNull, isNull, lte, max } from "drizzle-orm";
import { after } from "next/server";
import { isSelfReferral } from "@/lib/affiliates/self-referral";
import { trackServer } from "@/lib/analytics/server";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { isUniqueViolation } from "@/lib/slug-claims";
import { noteMissingInviteTables } from "./missing-table";
import { qualifyDeadline } from "./rules";
import { INVITE_MAX_REWARDED_FRIENDS } from "./terms";

// An invite counts when the friend has a dynamic code made within
// INVITE_QUALIFY_DAYS of signing up that passed its safety checks: then the
// friend's own workspace gets INVITE_BONUS_CODES more, and so does the
// inviter's while they've been rewarded for fewer than
// INVITE_MAX_REWARDED_FRIENDS friends.
//
// It's settled from what the database holds, not from the event that asked,
// so the order things happen in never matters. Three moments ask
// (settleInvite):
// - a code is made (every way of making one goes through createCodesBatch,
//   app/(app)/dashboard/codes/_lib/qr-codes.ts, which calls
//   noteDynamicCodesCreated after the response);
// - the invite is recorded at sign-up (./attribution.ts), which happens
//   after the sign-up's response, so the friend's first code (the editor's
//   Dynamic toggle resumes right after signing in) can already be there;
// - a code's safety checks clear: the Web Risk look-up that was still
//   pending when it was made (lib/safety/recheck.ts), or an admin switching
//   a held code back on.
//
// What counts: a code of the friend's that is switched on (a code held for a
// safety check is saved switched off) and not waiting for its Web Risk
// look-up, made before the deadline. A code trashed or deleted after that
// keeps the grant: it's decided once and stands.
//
// Decided once. One UPDATE ... WHERE status = 'pending' AND revoked_at IS
// NULL sets the reward and the inviter's numbered slot together, so two
// moments at once reward it once, and the friend is never rewarded without
// the inviter's slot being settled in the same statement. The slots are
// unique per inviter: when another friend's invite takes the same number at
// the same moment the statement fails, nothing is written, and the next
// number is tried; past the cap the slot is null (the friend still gets
// theirs). If every try is taken, or the task is cut off, the invite stays
// pending and the next moment settles it.
//
// An invite QRdx revoked (for abuse) before it was decided never pays out:
// it's decided as expired, and revoked_at says why.

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
        /** No qualifying code yet, still inside the window */
        | "waiting"
        | "expired"
        | "revoked"
        | "self_referral"
        /** Every try at the inviter's slot was taken: still pending */
        | "contended"
        | "missing_tables"
        | "error";
    };

/** Tries at the inviter's next slot when another friend took the same one. */
const SLOT_TRIES = 4;

/** The inviter's next reward slot, or null once they've had the most. */
async function nextInviterSlot(inviterUserId: string): Promise<number | null> {
  const [taken] = await db
    .select({ last: max(invite.inviterRewardSlot) })
    .from(invite)
    .where(eq(invite.inviterUserId, inviterUserId));
  const next = Number(taken?.last ?? 0) + 1;
  return next > INVITE_MAX_REWARDED_FRIENDS ? null : next;
}

/**
 * Whether the person has a dynamic code made by `deadline` that passed its
 * safety checks: switched on, and not waiting for a Web Risk look-up.
 */
async function hasQualifyingCode(
  userId: string,
  deadline: Date,
): Promise<boolean> {
  const [code] = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(
      and(
        eq(qrCode.userId, userId),
        eq(qrCode.isActive, true),
        isNull(qrCode.webRiskRecheckAt),
        lte(qrCode.createdAt, deadline),
      ),
    )
    .limit(1);
  return Boolean(code);
}

/**
 * Settles the person's invite, if they have an open one, from the codes
 * they have now. Never throws.
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
        revokedAt: invite.revokedAt,
      })
      .from(invite)
      .where(eq(invite.inviteeUserId, inviteeUserId))
      .limit(1);
    if (!row) return { outcome: "no_invite" };
    if (row.status !== "pending") return { outcome: "decided" };

    const open = and(
      eq(invite.id, row.id),
      eq(invite.status, "pending"),
      isNull(invite.revokedAt),
    );
    const decide = (status: "expired" | "self_referral") =>
      db
        .update(invite)
        .set({ status, decidedAt: now })
        .where(and(eq(invite.id, row.id), eq(invite.status, "pending")));

    if (row.revokedAt) {
      await decide("expired");
      return { outcome: "revoked" };
    }
    const deadline = qualifyDeadline(row.createdAt);
    if (!(await hasQualifyingCode(inviteeUserId, deadline))) {
      if (now.getTime() > deadline.getTime()) {
        await decide("expired");
        return { outcome: "expired" };
      }
      return { outcome: "waiting" };
    }
    if (
      row.inviterUserId &&
      (await isSelfReferral({
        affiliateUserId: row.inviterUserId,
        customerUserId: inviteeUserId,
      }))
    ) {
      await decide("self_referral");
      return { outcome: "self_referral" };
    }

    for (let attempt = 0; attempt < SLOT_TRIES; attempt++) {
      const slot = row.inviterUserId
        ? await nextInviterSlot(row.inviterUserId)
        : null;
      try {
        // Both rewards in one statement.
        const [decided] = await db
          .update(invite)
          .set({ status: "rewarded", decidedAt: now, inviterRewardSlot: slot })
          .where(open)
          .returning({
            inviterUserId: invite.inviterUserId,
            inviterSlot: invite.inviterRewardSlot,
          });
        // Decided (or revoked) by someone else in between.
        if (!decided) return { outcome: "decided" };
        console.info(
          JSON.stringify({
            event: "invites.rewarded",
            inviter_rewarded: decided.inviterSlot !== null,
          }),
        );
        return {
          outcome: "rewarded",
          inviterUserId: decided.inviterUserId,
          inviterSlot: decided.inviterSlot,
        };
      } catch (error) {
        // Another friend of the same inviter took this slot: nothing was
        // written; try the next one.
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    console.error(JSON.stringify({ event: "invites.slot_contended" }));
    return { outcome: "contended" };
  } catch (error) {
    if (noteMissingInviteTables(error)) return { outcome: "missing_tables" };
    logError(error as Error, { action: "invites.qualify" });
    return { outcome: "error" };
  }
}

/**
 * Settles the person's invite now (qualifyInvite) and, when it's rewarded,
 * counts it and emails the inviter if they got codes. Never throws.
 */
export async function settleInvite(
  userId: string,
  now: Date = new Date(),
): Promise<QualifyOutcome> {
  const result = await qualifyInvite(userId, now);
  if (result.outcome !== "rewarded") return result;
  try {
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
  } catch (error) {
    logError(error as Error, { action: "invites.settle" });
  }
  return result;
}

/**
 * settleInvite for each person, one after the other, for code that already
 * runs after a response (the safety recheck), until `deadline`: whoever is
 * left is settled by settleWaitingInvites on the worker's next run (or by
 * their next code). Never throws.
 */
export async function settleInvites(
  userIds: readonly string[],
  { deadline = Number.POSITIVE_INFINITY }: { deadline?: number } = {},
): Promise<{ checked: number; left: number }> {
  if (!isFeatureAvailable("inviteRewards")) return { checked: 0, left: 0 };
  const people = [...new Set(userIds)];
  let checked = 0;
  for (const userId of people) {
    if (Date.now() >= deadline) break;
    await settleInvite(userId);
    checked++;
  }
  return { checked, left: people.length - checked };
}

/** Invites the worker's pass looks at, at most. */
const WAITING_PASS_LIMIT = 100;

export interface WaitingInvitesSummary {
  /** Invites settled (rewarded, expired or refused) */
  settled: number;
  /** More are waiting: out of time, or past the pass's limit */
  left: boolean;
}

/**
 * The webhook worker's pass (app/api/cron/webhooks): pending invites whose
 * friend already has a code that passed its safety checks, which no moment
 * settled (the safety recheck ran out of time, or an after-response task was
 * cut off). Oldest first, until `deadline`. Never throws.
 */
export async function settleWaitingInvites({
  deadline,
  limit = WAITING_PASS_LIMIT,
}: {
  deadline: number;
  limit?: number;
}): Promise<WaitingInvitesSummary> {
  if (!isFeatureAvailable("inviteRewards")) return { settled: 0, left: false };
  try {
    const rows = await db
      .select({ userId: invite.inviteeUserId })
      .from(invite)
      .where(
        and(
          eq(invite.status, "pending"),
          isNull(invite.revokedAt),
          isNotNull(invite.inviteeUserId),
          exists(
            db
              .select({ id: qrCode.id })
              .from(qrCode)
              .where(
                and(
                  eq(qrCode.userId, invite.inviteeUserId),
                  eq(qrCode.isActive, true),
                  isNull(qrCode.webRiskRecheckAt),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(invite.createdAt))
      .limit(limit + 1);
    const due = rows.slice(0, limit);
    let settled = 0;
    let checked = 0;
    for (const { userId } of due) {
      if (Date.now() >= deadline) break;
      checked++;
      const result = await settleInvite(userId as string);
      if (result.outcome !== "waiting" && result.outcome !== "error") {
        settled++;
      }
    }
    return { settled, left: rows.length > checked };
  } catch (error) {
    if (!noteMissingInviteTables(error)) {
      logError(error as Error, { action: "invites.settle_waiting" });
    }
    return { settled: 0, left: false };
  }
}

/** Runs `task` after the response, or now when there's no request. */
function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): run now.
    void task();
  }
}

/**
 * After someone's codes are made, or their safety checks clear: settles
 * the invites of those people after the response (settleInvite). Returns
 * at once; never throws.
 */
export function noteDynamicCodesCreated(...userIds: string[]): void {
  try {
    const people = [...new Set(userIds)];
    if (people.length === 0 || !isFeatureAvailable("inviteRewards")) return;
    afterResponse(async () => {
      for (const userId of people) await settleInvite(userId);
    });
  } catch (error) {
    logError(error as Error, { action: "invites.note_codes" });
  }
}
