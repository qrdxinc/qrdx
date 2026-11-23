// The invite reward's rules as pure functions (no database, no request), so
// they're tested on their own: the code's shape, the 30-day window and the
// bonus a person's invites add up to. Client-safe.

import { cleanInviteCode, INVITE_PARAM } from "@repo/analytics/landing";
import {
  INVITE_BONUS_CODES,
  INVITE_CODE_LENGTH,
  INVITE_LANDING_PATH,
  INVITE_MAX_REWARDED_FRIENDS,
  INVITE_QUALIFY_DAYS,
} from "./terms";

export { INVITE_PARAM } from "@repo/analytics/landing";

/** An invite code as a link carries it, or null when it can't be one. */
export function parseInviteCode(value: unknown): string | null {
  return cleanInviteCode(value);
}

/** Letters and digits that can't be mistaken for each other (no i, l, o, 0 or 1). */
export const INVITE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A new random code, never made from a name or an email address. Ten
 * characters, so it can't pass for an affiliate's random eight, and it
 * travels in its own parameter (INVITE_PARAM), never as a `ref`.
 */
export function randomInviteCode(
  random: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string {
  return Array.from(
    random(INVITE_CODE_LENGTH),
    (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length],
  ).join("");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last moment a friend's first dynamic code counts. */
export function qualifyDeadline(signedUpAt: Date): Date {
  return new Date(signedUpAt.getTime() + INVITE_QUALIFY_DAYS * DAY_MS);
}

/** Whether a first code made at `now` counts for a friend who signed up at `signedUpAt`. */
export function isWithinQualifyWindow(signedUpAt: Date, now: Date): boolean {
  return now.getTime() <= qualifyDeadline(signedUpAt).getTime();
}

/** What a person's rewarded invites add to their own workspace's dynamic codes. */
export function bonusCodesFor(counts: {
  /** 1 when they joined through an invite that was rewarded, else 0 */
  asFriend: number;
  /** Friends they were rewarded for (at most INVITE_MAX_REWARDED_FRIENDS) */
  asInviter: number;
}): number {
  const friend = Math.min(Math.max(counts.asFriend, 0), 1);
  const inviter = Math.min(
    Math.max(counts.asInviter, 0),
    INVITE_MAX_REWARDED_FRIENDS,
  );
  return (friend + inviter) * INVITE_BONUS_CODES;
}

/** Friends an inviter can still be rewarded for. */
export function rewardsLeft(rewardedFriends: number): number {
  return Math.max(0, INVITE_MAX_REWARDED_FRIENDS - rewardedFriends);
}

/** Where /i/<code> sends a visitor: the editor, with the code when it's someone's. */
export function inviteLandingHref(code: string | null): string {
  return code
    ? `${INVITE_LANDING_PATH}?${INVITE_PARAM}=${encodeURIComponent(code)}`
    : INVITE_LANDING_PATH;
}
