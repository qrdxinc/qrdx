import "server-only";

import { INVITE_HEADER } from "@repo/auth/referral-keys";
import { database as db, invite } from "@repo/database";
import cuid from "cuid";
import { isSelfReferral } from "@/lib/affiliates/self-referral";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { inviterOfCode } from "./codes";
import { noteMissingInviteTables } from "./missing-table";
import { parseInviteCode } from "./rules";

// Records that a NEW account signed up through a friend's invite link, once,
// at sign-up. packages/auth (referral.ts) hands over the new account and
// what its sign-up request carried; nothing here trusts the code:
//
// - only a code someone has counts;
// - same visit only: the code comes with the sign-up request itself (the
//   INVITE_HEADER an email-code sign-up sends, or the OAuth state of a
//   Google or GitHub one). No cookie or other stored value is ever read;
// - it's never self-referral (lib/affiliates/self-referral.ts: the same
//   account, the same address under another spelling, a shared workspace),
//   checked again when the friend's first code would reward it;
// - the first invite wins: an account that already has one keeps it
//   (invite.invitee_user_id is unique);
// - an existing account is never invited: this only runs from the user
//   create hook, never for a sign-in.
//
// An invite never stands in for an affiliate's referral or the other way
// round: they come in different fields, and a sign-up carrying both records
// both (the affiliate is credited with the account; ./qualify.ts rewards the
// invite the same as without one).
//
// Best effort: a failure, including the tables not existing yet, is logged
// and never reaches the sign-up.

export type InviteAttributionResult =
  | { status: "recorded"; inviterUserId: string }
  | {
      status: "skipped";
      reason:
        | "unavailable"
        | "no_code"
        | "unknown_code"
        | "self_referral"
        | "already_invited"
        | "missing_tables"
        | "error";
    };

/**
 * The invite codes a sign-up carried, in the order they're tried: the header
 * an email-code sign-up sends, then the OAuth state of a Google or GitHub
 * one. Malformed codes are dropped; repeats are tried once.
 */
export function inviteCandidatesFrom(source: {
  headers?: Pick<Headers, "get"> | null;
  oauthInviteCode?: unknown;
}): string[] {
  const found: string[] = [];
  for (const value of [
    source.headers?.get(INVITE_HEADER),
    source.oauthInviteCode,
  ]) {
    const code = parseInviteCode(value);
    if (code && !found.includes(code)) found.push(code);
  }
  return found;
}

/**
 * Tries each code in order and records the first valid one for the new
 * account. Never throws.
 */
export async function recordInvitedSignUp(input: {
  userId: string;
  email: string;
  codes: readonly string[];
  now?: Date;
}): Promise<InviteAttributionResult> {
  if (!isFeatureAvailable("inviteRewards")) {
    return { status: "skipped", reason: "unavailable" };
  }
  if (input.codes.length === 0) {
    return { status: "skipped", reason: "no_code" };
  }
  let reason: "unknown_code" | "self_referral" = "unknown_code";
  try {
    for (const code of input.codes) {
      const inviterUserId = await inviterOfCode(code);
      if (!inviterUserId) continue;
      if (
        await isSelfReferral({
          affiliateUserId: inviterUserId,
          customerUserId: input.userId,
          customerEmails: [input.email],
        })
      ) {
        reason = "self_referral";
        continue;
      }
      const inserted = await db
        .insert(invite)
        .values({
          id: cuid(),
          inviterUserId,
          inviteeUserId: input.userId,
          status: "pending",
          createdAt: input.now ?? new Date(),
        })
        .onConflictDoNothing({ target: invite.inviteeUserId })
        .returning({ id: invite.id });
      if (inserted.length === 0) {
        return { status: "skipped", reason: "already_invited" };
      }
      // No ids or codes in the log.
      console.info(JSON.stringify({ event: "invites.sign_up_recorded" }));
      return { status: "recorded", inviterUserId };
    }
    return { status: "skipped", reason };
  } catch (error) {
    if (noteMissingInviteTables(error)) {
      return { status: "skipped", reason: "missing_tables" };
    }
    logError(error as Error, { action: "invites.record_sign_up" });
    return { status: "skipped", reason: "error" };
  }
}

/**
 * Reads the sign-up's invite codes now (the request's headers don't outlive
 * it) and returns the task that records the invite, to run after the
 * response. Null where there's nothing to do: no code, or invites are off
 * here (a self-hosted copy), which then makes no lookup at all.
 */
export function signUpInviteTask(signUp: {
  userId: string;
  email: string;
  headers: Pick<Headers, "get"> | null;
  oauthInviteCode?: string | null;
}): (() => Promise<InviteAttributionResult>) | null {
  if (!isFeatureAvailable("inviteRewards")) return null;
  const codes = inviteCandidatesFrom(signUp);
  if (codes.length === 0) return null;
  return () =>
    recordInvitedSignUp({
      userId: signUp.userId,
      email: signUp.email,
      codes,
    });
}
