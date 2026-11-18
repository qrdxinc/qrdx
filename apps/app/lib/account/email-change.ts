/**
 * Settings → Account → Email: moving an account to a new address. Pure and
 * client-safe; the server actions are app/(app)/settings/account/_lib
 * email-change-actions.ts.
 *
 * 1. The user enters the new address and Better Auth's emailOTP plugin
 *    (`change-email` type) emails a 6-digit code to it.
 * 2. They enter the code and the change takes effect. The old address gets a
 *    notice, with no link that undoes it.
 *
 * Both steps need a recent "Confirm it's you" (./confirmation-server.tsx), so
 * an old stolen cookie can't move the account. An address that already
 * belongs to another account never gets a code: Better Auth answers as if it
 * sent one, so the form doesn't reveal which addresses have accounts, and
 * the confirming step checks again. A send that fails answers the same way
 * (anything else would mark the free addresses), so the dialog only says a
 * code should arrive if no other account uses the address. Codes typed for
 * either kind of address get the same answers too (confirmFailure), and both
 * steps answer on a whole multiple of EMAIL_CHANGE_ANSWER_MS, which hides the little
 * database work Better Auth does for one kind and not the other. Where this
 * deployment can't deliver codes at all, every request is refused alike
 * (EMAIL_CHANGE_UNAVAILABLE) and Settings doesn't offer the change.
 */

import { EMAIL_CHANGE_UNAVAILABLE } from "@repo/auth/sign-in-code-rules";
import type { Translator } from "@/lib/i18n/translator";

/** RFC 5321's limit on an address. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Both steps answer on a whole multiple of this after they start (at least
 * one), whatever the outcome (lib/no-sooner-than.ts): a slow run lands on
 * the next step rather than showing its own length. Better Auth does one more database write
 * for an address with an account when a code is asked for, and one more for
 * an address without one after a wrong code, so the time to answer would
 * otherwise tell them apart. Asking for a code makes seven to nine database
 * and Upstash round trips one after another (more where single sign-on is
 * on), and a wrong code six to eight. This is meant to be longer than those
 * usually take, and it's short next to finding the code in an inbox.
 */
export const EMAIL_CHANGE_ANSWER_MS = 750;

/** Addresses are compared (and stored by Better Auth) in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSameEmail(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

export const EMAIL_CHANGE_MESSAGES = {
  reauth:
    "For your security, sign out and sign in again, then change your email within a day.",
  sameEmail: "That's already your email.",
  invalidEmail: "Enter a valid email address.",
  invalidCode: "Enter the 6-digit code from the email.",
  rateLimited: "Too many tries. Wait a few minutes and try again.",
  // Also the answer for an address that has an account and so never got a
  // code: the limit counts requests, before the address is looked up.
  codeRateLimited:
    "Too many codes requested for that address. Wait a few minutes and try again.",
  notSent: "We couldn't send a code right now. Please try again.",
  codeDidntWork: "That code didn't work. Check it, or send a new code.",
  taken: "That email already belongs to another QRdx account.",
  signedOut: "Sign in to change your email.",
  unavailable:
    "Email isn't set up on this site, so the address can't be changed here.",
  failed: "Something went wrong. Please try again.",
} as const;

/** EMAIL_CHANGE_MESSAGES in any language. */
export type EmailChangeMessages = Record<
  keyof typeof EMAIL_CHANGE_MESSAGES,
  string
>;

/**
 * EMAIL_CHANGE_MESSAGES in the person's language
 * (settingsActions.emailChange in messages/en.json), for the actions'
 * answers.
 */
export function emailChangeMessages(
  t: Translator<"settingsActions.emailChange">,
): EmailChangeMessages {
  return {
    reauth: t("reauth"),
    sameEmail: t("sameEmail"),
    invalidEmail: t("invalidEmail"),
    invalidCode: t("invalidCode"),
    rateLimited: t("rateLimited"),
    codeRateLimited: t("codeRateLimited"),
    notSent: t("notSent"),
    codeDidntWork: t("codeDidntWork"),
    taken: t("taken"),
    signedOut: t("signedOut"),
    unavailable: t("unavailable"),
    failed: t("failed"),
  };
}

/** What a Better Auth APIError carries (auth.api throws these). */
interface AuthErrorLike {
  statusCode?: number;
  body?: { code?: string; message?: string };
}

const authError = (error: unknown): AuthErrorLike =>
  error && typeof error === "object" ? (error as AuthErrorLike) : {};

type EmailChangeMessageKey = keyof typeof EMAIL_CHANGE_MESSAGES;

/** Requesting the code: which message a known failure gets, else null. */
export function requestFailureKey(
  error: unknown,
): EmailChangeMessageKey | null {
  const { statusCode, body } = authError(error);
  if (statusCode === 429) return "codeRateLimited";
  switch (body?.code) {
    case "EMAIL_CHANGE_CODE_NOT_SENT":
      return "notSent";
    case EMAIL_CHANGE_UNAVAILABLE:
      return "unavailable";
    case "INVALID_EMAIL":
      return "invalidEmail";
    case "UNAUTHORIZED":
      return "signedOut";
  }
  if (body?.message === "Email is the same") return "sameEmail";
  return null;
}

/** Requesting the code: a message for a known failure, else null. */
export function requestFailureMessage(error: unknown): string | null {
  const key = requestFailureKey(error);
  return key ? EMAIL_CHANGE_MESSAGES[key] : null;
}

/**
 * Confirming with the code: which message a known failure gets, and whether
 * the code is used up (send a new one), else null.
 */
export function confirmFailureKey(
  error: unknown,
): { message: EmailChangeMessageKey; codeDead: boolean } | null {
  const { statusCode, body } = authError(error);
  if (statusCode === 429) return { message: "rateLimited", codeDead: false };
  switch (body?.code) {
    // Better Auth keeps no code for an address that already has an account,
    // so there every code is just wrong (INVALID_OTP), while a free address
    // runs out of tries or sees its code expire. One answer for all three,
    // and the code isn't marked used up (that would show too).
    case "INVALID_OTP":
    case "OTP_EXPIRED":
    case "TOO_MANY_ATTEMPTS":
      return { message: "codeDidntWork", codeDead: false };
    case "INVALID_EMAIL":
      return { message: "invalidEmail", codeDead: true };
    case "UNAUTHORIZED":
      return { message: "signedOut", codeDead: true };
  }
  // Only reachable with a valid code, so saying so leaks nothing.
  if (body?.message === "Email already in use") {
    return { message: "taken", codeDead: true };
  }
  if (body?.message === "Email is the same") {
    return { message: "sameEmail", codeDead: true };
  }
  return null;
}

/**
 * Confirming with the code: a message for a known failure, and whether the
 * code is used up (send a new one), else null.
 */
export function confirmFailure(
  error: unknown,
): { message: string; codeDead: boolean } | null {
  const found = confirmFailureKey(error);
  return found
    ? {
        message: EMAIL_CHANGE_MESSAGES[found.message],
        codeDead: found.codeDead,
      }
    : null;
}

export interface NoticeDeliveryDeps {
  nodeEnv: string | undefined;
  /** isOutboundDeliveryAllowed() */
  deliveryAllowed: boolean;
  /** Emails the notice; resolves `{ sent: false }` when it wasn't sent */
  send: () => Promise<{ sent: boolean; reason?: string }>;
  /** Server console */
  log: (line: string) => void;
}

/**
 * The "your email was changed" notice to the old address, after the change
 * (the same delivery rules as codes: emailed where outbound delivery is on,
 * written to the console in local dev). Never throws: the change has already
 * happened, so a failed notice is reported, not undone.
 */
export async function deliverEmailChangedNotice(
  { previousEmail, newEmail }: { previousEmail: string; newEmail: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx email-change notice for ${previousEmail}: "Your QRdx email was changed to ${newEmail}" (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
