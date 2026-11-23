import "server-only";

import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  confirmedIdentifier,
  strongConfirmedIdentifier as strongIdentifier,
} from "@repo/auth/confirm-sign-in-rules";
import { cookiesToSet } from "@repo/auth/passkey";
import { checkPasskeyWithoutSignIn } from "@repo/auth/passkey-check";
import { auth } from "@repo/auth/server";
import { LOCKOUT_FAILURES } from "@repo/auth/sign-in-challenge-rules";
import {
  database as db,
  session as sessionTable,
  verification,
} from "@repo/database";
import {
  ConfirmationCodeEmail,
  confirmationCodeSubject,
} from "@repo/email/templates/confirmation-code";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
} from "@/lib/auth/sign-in-code-delivery";
import {
  isTotpCode,
  normalizeBackupCode,
  TWO_FACTOR_MESSAGES,
  type TwoFactorMessages,
  twoFactorMessages,
} from "@/lib/auth/two-factor";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { emailIntlForAddress } from "@/lib/i18n/email-locale";
import { currentRequestDetails } from "@/lib/security/request-details";
import { logError } from "@/lib/shared";
import {
  CONFIRMATION_CODE_ATTEMPTS,
  CONFIRMATION_CODE_MINUTES,
  CONFIRMATION_MESSAGES,
  CONFIRMATION_MINUTES,
  type ConfirmationMessages,
  type ConfirmationOptions,
  type ConfirmationRequired,
  confirmationMessages,
  confirmationMethodsFor,
  confirmationRequired,
  mailProviderFor,
  maskEmail,
} from "./confirmation";
import { isRecentSignIn } from "./deletion";
import { linkedSignInsFor } from "./linked-sign-ins-server";
import {
  PASSKEY_MESSAGES,
  type PasskeyMessages,
  passkeyMessages,
} from "./passkeys";
import { signInCodesAvailable } from "./reauth";
import {
  getSessionAllowingHold,
  isSessionHeld,
  moveSessionOrigin,
} from "./session-origin-server";
import { hasAuthenticatorApp } from "./two-factor-methods";
import { sendBackupCodeUsedNotice } from "./two-factor-notice-server";
import { cancelTwoFactorResetQuietly } from "./two-factor-reset-server";
import {
  clearCodeFailures,
  loadTwoFactorFacts,
  passkeysWorkHere,
  releaseCodeAttempt,
  reserveCodeAttempt,
} from "./two-factor-server";

// "Confirm it's you" on the server (./confirmation.ts has the rules). A
// confirmation is a `verification` row keyed by the session's id, holding the
// user's id, for 10 minutes; no schema change. With two-step verification on,
// wrong answers count toward the same lockout as sign-in codes
// (reserveCodeAttempt): 10 in a row lock the account's codes and passkey
// checks for 15 minutes. Emailed codes, for accounts without it, are HMAC'd
// with the auth secret and allow 3 tries each. Signing in again with Google,
// GitHub or SSO is ./confirmation-sign-in-server.ts.
//
// A held session (used from a new country and browser: ./session-origin.ts)
// is seen here, unlike everywhere else, so it can confirm: until it does,
// every gated action answers CONFIRMATION_REQUIRED, even with a confirmation
// recorded before it was held. Every confirmation moves the session's
// origin to where it is now.
//
// Refusals answer in the person's language (refuse(), below): the dialog
// and Settings show a result's `error` as it is.

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** The signed-in session a confirmation belongs to. */
export interface ConfirmableSession {
  userId: string;
  email: string;
  sessionId: string;
  sessionCreatedAt: Date;
  requestHeaders: Headers;
  /**
   * Used from a different country and browser than where it started: it
   * must confirm before anything else.
   */
  held?: boolean;
}

const CODE_PREFIX = "qrdx-confirm-code-";
const codeIdentifier = (sessionId: string) => `${CODE_PREFIX}${sessionId}`;

// Per user, on top of the account lockout (auth.api calls skip Better Auth's
// own HTTP rate limiter). Without Redis these allow everything; the lockout
// and the per-code tries still apply.
const answerLimiter = createRateLimiter({
  prefix: "qrdx:confirm-answer",
  limiter: slidingWindow(10, "15 m"),
});
const passkeyOptionsLimiter = createRateLimiter({
  prefix: "qrdx:confirm-passkey-options",
  limiter: slidingWindow(20, "15 m"),
});
const sendLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code-send",
  limiter: slidingWindow(5, "15 m"),
});
// Per address, like sign-in codes: a burst window and a daily cap.
const perAddressLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code",
  limiter: slidingWindow(5, "15 m"),
});
const perAddressDailyLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code-day",
  limiter: slidingWindow(30, "1 d"),
});

const fail = (error: string): ConfirmResult => ({ ok: false, error });

/** What a refusal can say, in one language. */
export interface ConfirmationText {
  confirm: ConfirmationMessages;
  twoFactor: TwoFactorMessages;
  passkey: PasskeyMessages;
}

const ENGLISH: ConfirmationText = {
  confirm: CONFIRMATION_MESSAGES,
  twoFactor: TWO_FACTOR_MESSAGES,
  passkey: PASSKEY_MESSAGES,
};

/**
 * CONFIRMATION_MESSAGES, TWO_FACTOR_MESSAGES and PASSKEY_MESSAGES in the
 * person's language (lib/i18n/app-locale.ts: their saved one, else the
 * language menu's cookie, else English). English, logged, when that can't
 * be read: the answer still goes out.
 */
export async function confirmationText(): Promise<ConfirmationText> {
  try {
    const [confirm, twoFactor, passkey] = await Promise.all([
      getAppTranslations("auth.confirmationMessages"),
      getAppTranslations("auth.twoFactorMessages"),
      getAppTranslations("auth.passkeyMessages"),
    ]);
    return {
      confirm: confirmationMessages(confirm),
      twoFactor: twoFactorMessages(twoFactor),
      passkey: passkeyMessages(passkey),
    };
  } catch (error) {
    logError(error as Error, { action: "account.confirmationText" });
    return ENGLISH;
  }
}

/** A refusal saying `message` of confirmationText(), read only to refuse. */
export async function refuse(
  message: (text: ConfirmationText) => string,
): Promise<{ ok: false; error: string }> {
  return { ok: false, error: message(await confirmationText()) };
}

/** What a Better Auth APIError carries (auth.api throws these). */
const authErrorCode = (error: unknown): string | undefined =>
  (error as { body?: { code?: string } } | null)?.body?.code;

/** The signed-in session, read from the request, held or not. */
export async function currentSession(): Promise<ConfirmableSession | null> {
  const requestHeaders = await headers();
  const found = await getSessionAllowingHold(requestHeaders);
  if (!found?.session?.id) return null;
  return {
    userId: found.user.id,
    email: found.user.email,
    sessionId: found.session.id,
    sessionCreatedAt: new Date(found.session.createdAt),
    requestHeaders,
    held: await isSessionHeld(found.session, requestHeaders),
  };
}

// ─── The confirmation record ─────────────────────────────────────────────────

async function hasRow(identifier: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: verification.id })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        eq(verification.value, userId),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** This session confirmed within the last 10 minutes (and isn't held). */
export async function hasRecentConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId" | "held">,
): Promise<boolean> {
  if (session.held) return false;
  return hasRow(confirmedIdentifier(session.sessionId), session.userId);
}

/**
 * This session confirmed within the last 10 minutes with a passkey, an
 * authenticator code or a backup code: never an emailed code or signing in
 * again, which getting into a mailbox or a Google account is enough for.
 * Never while the session is held.
 */
export async function hasRecentStrongConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId" | "held">,
): Promise<boolean> {
  if (session.held) return false;
  return hasRow(strongIdentifier(session.sessionId), session.userId);
}

/**
 * For gated actions: null when this session confirmed in the last 10 minutes
 * (or, without two-step verification on a deployment that can't send codes,
 * signed in within them), else the result the action returns so the client
 * asks. A held session always asks.
 */
export async function requireRecentConfirmation(
  session: Pick<
    ConfirmableSession,
    "userId" | "sessionId" | "sessionCreatedAt" | "held"
  >,
): Promise<ConfirmationRequired | null> {
  if (session.held) return confirmationRequired();
  if (await hasRecentConfirmation(session)) return null;
  if (!signInCodesAvailable()) {
    const { on } = await loadTwoFactorFacts(session.userId);
    if (!on && isRecentSignIn(session.sessionCreatedAt, new Date())) {
      return null;
    }
  }
  return confirmationRequired();
}

/**
 * For gated actions: the signed-in session when it confirmed recently, else
 * the result to return (signed out, or CONFIRMATION_REQUIRED). The signed-out
 * message can be a function, read only when it's needed (the caller's own
 * copy, translated: lib/i18n/settings-action-text.ts).
 */
export async function confirmedSession(
  signedOutMessage: string | (() => Promise<string>),
): Promise<
  { ok: true; session: ConfirmableSession } | { ok: false; error: string }
> {
  const session = await currentSession();
  if (!session) {
    return fail(
      typeof signedOutMessage === "string"
        ? signedOutMessage
        : await signedOutMessage(),
    ) as { ok: false; error: string };
  }
  const needed = await requireRecentConfirmation(session);
  if (needed) return needed;
  return { ok: true, session };
}

/**
 * Starts (or restarts) this session's 10 minutes; `strong` when it used a
 * passkey, or a "code" (an authenticator code or a backup code). With the
 * request's headers, where the session is now also becomes its origin (a
 * held session is let go).
 */
export async function recordConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId"> &
    Partial<Pick<ConfirmableSession, "requestHeaders">>,
  { strong }: { strong?: "code" | "passkey" } = {},
): Promise<void> {
  await writeConfirmationRow(
    confirmedIdentifier(session.sessionId),
    session.userId,
  );
  if (strong) {
    await writeConfirmationRow(
      strongIdentifier(session.sessionId),
      session.userId,
    );
  }
  if (strong === "code") {
    // They still have their authenticator app or backup codes, so support's
    // pending turn-off (if any) is cancelled (./two-factor-reset-server.ts).
    // Never on a passkey alone: the reset is for a lost device, and a
    // passkey on it mustn't block recovery. Cancel in Settings still works.
    await cancelTwoFactorResetQuietly({ id: session.userId });
  }
  if (session.requestHeaders) {
    await moveSessionOrigin(session, session.requestHeaders);
  }
}

async function writeConfirmationRow(
  identifier: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  await db.batch([
    db.delete(verification).where(eq(verification.identifier, identifier)),
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: userId,
      expiresAt: new Date(now.getTime() + CONFIRMATION_MINUTES * 60_000),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}

/**
 * Better Auth swaps the session for a new one when an authenticator app turns
 * two-step verification on; the confirmation moves with it, so the person
 * isn't asked again straight away. `setCookie` is the swap's Set-Cookie.
 */
export async function carryConfirmation(
  from: Pick<ConfirmableSession, "userId" | "sessionId">,
  setCookie: string | null | undefined,
): Promise<void> {
  const token = sessionTokenFromSetCookie(setCookie);
  if (!token) return;
  const [next] = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(
      and(eq(sessionTable.token, token), eq(sessionTable.userId, from.userId)),
    )
    .limit(1);
  if (!next) return;
  for (const identifier of [confirmedIdentifier, strongIdentifier]) {
    await db
      .update(verification)
      .set({ identifier: identifier(next.id), updatedAt: new Date() })
      .where(
        and(
          eq(verification.identifier, identifier(from.sessionId)),
          eq(verification.value, from.userId),
          gt(verification.expiresAt, new Date()),
        ),
      );
  }
}

/**
 * The session token in Better Auth's Set-Cookie (`<token>.<signature>`,
 * URL-encoded), or null. Only used to find the new session's id. The last
 * one wins, as in the browser: a response can set the old session's cookie
 * first (Better Auth refreshing it while reading it) and the new one after.
 */
export function sessionTokenFromSetCookie(
  setCookie: string | null | undefined,
): string | null {
  const match = [
    ...(setCookie ?? "").matchAll(
      /(?:^|[\s,])(?:__Secure-)?[\w.-]*session_token=([^;,\s]+)/g,
    ),
  ].at(-1);
  if (!match?.[1]) return null;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const dot = value.lastIndexOf(".");
  return dot > 0 ? value.slice(0, dot) : null;
}

// ─── What the dialog offers ──────────────────────────────────────────────────

export async function loadConfirmationOptions(
  session: ConfirmableSession,
): Promise<ConfirmationOptions> {
  const [facts, t] = await Promise.all([
    loadTwoFactorFacts(session.userId),
    getAppTranslations("auth.mailProvider"),
  ]);
  return {
    methods: confirmationMethodsFor({
      twoFactorOn: facts.on,
      authenticatorApp: facts.on && hasAuthenticatorApp(facts.row),
      passkeys: passkeysWorkHere(session.requestHeaders) ? facts.passkeys : 0,
      emailCodes: signInCodesAvailable(),
      signIns: facts.on ? [] : await linkedSignInsFor(session),
    }),
    maskedEmail: maskEmail(session.email),
    mailProvider: mailProviderFor(session.email, (provider) =>
      t("open", { provider }),
    ),
  };
}

// ─── Authenticator and backup codes ──────────────────────────────────────────

/**
 * Checks an authenticator or backup code (a backup code is used up) against
 * the shared lockout. An account without an authenticator app (passkeys
 * only, or a setup that was never confirmed) never gets as far as the
 * plugin's TOTP check. A backup code that worked is emailed to the
 * account's address, without waiting for it: that never holds up or fails
 * the check.
 */
export async function checkSecondFactorCode(
  session: Pick<ConfirmableSession, "userId" | "email" | "requestHeaders">,
  rawCode: string,
): Promise<ConfirmResult> {
  const totpCode = isTotpCode(rawCode.trim()) ? rawCode.trim() : null;
  const backupCode = totpCode ? null : normalizeBackupCode(rawCode);
  if (!(totpCode || backupCode)) {
    return refuse((text) =>
      /^[\d\s]+$/.test(rawCode.trim())
        ? text.twoFactor.invalidCode
        : text.twoFactor.invalidBackupCode,
    );
  }

  const facts = await loadTwoFactorFacts(session.userId);
  if (!(facts.on && facts.row)) return refuse((text) => text.confirm.failed);
  if (totpCode && !hasAuthenticatorApp(facts.row)) {
    return refuse((text) => text.confirm.noAuthenticatorApp);
  }
  if (!(await answerLimiter.limit(session.userId)).success) {
    return refuse((text) => text.confirm.rateLimited);
  }
  const attempt = await reserveCodeAttempt(session.userId);
  if (!attempt.ok) {
    return refuse((text) =>
      attempt.reason === "locked" ? text.twoFactor.locked : text.confirm.failed,
    );
  }

  try {
    if (totpCode) {
      await auth.api.verifyTOTP({
        headers: session.requestHeaders,
        body: { code: totpCode },
      });
    } else {
      await auth.api.verifyBackupCode({
        headers: session.requestHeaders,
        body: { code: backupCode as string, disableSession: true },
      });
    }
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== "INVALID_CODE" && code !== "INVALID_BACKUP_CODE") throw error;
    // Already counted; the attempt that reached the limit set the lock.
    if (attempt.attempts >= LOCKOUT_FAILURES) {
      return refuse((text) => text.twoFactor.locked);
    }
    return refuse((text) =>
      totpCode ? text.twoFactor.wrongCode : text.twoFactor.wrongBackupCode,
    );
  }
  await clearCodeFailures(attempt.id);
  if (backupCode) {
    try {
      // Started now (the count of codes left is read before the action
      // this confirms can make new ones), never awaited.
      const sending = sendBackupCodeUsedNotice({
        userId: session.userId,
        email: session.email,
        usedFor: "confirm",
        headers: session.requestHeaders,
      });
      after(() => sending);
    } catch (error) {
      logError(error as Error, { action: "account.backupCodeNotice" });
    }
  }
  return { ok: true };
}

export async function confirmWithCode(input: unknown): Promise<ConfirmResult> {
  const parsed = z.object({ code: z.string().max(64) }).safeParse(input);
  if (!parsed.success) return refuse((text) => text.twoFactor.invalidCode);
  try {
    const session = await currentSession();
    if (!session) return refuse((text) => text.confirm.signedOut);
    const check = await checkSecondFactorCode(session, parsed.data.code);
    if (!check.ok) return check;
    await recordConfirmation(session, { strong: "code" });
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithCode" });
    return refuse((text) => text.confirm.failed);
  }
}

// ─── Passkeys ────────────────────────────────────────────────────────────────

/**
 * Options for the browser's passkey prompt, limited to this person's
 * passkeys, with user verification required. The plugin keeps the challenge
 * (single use, minutes long) behind a signed cookie, passed on here.
 */
export async function passkeyAssertionOptions(
  session: ConfirmableSession,
): Promise<{ ok: true; options: Record<string, unknown> } | ConfirmResult> {
  if (!passkeysWorkHere(session.requestHeaders)) {
    return refuse((text) => text.confirm.passkeyUnavailable);
  }
  if (!(await passkeyOptionsLimiter.limit(session.userId)).success) {
    return refuse((text) => text.confirm.rateLimited);
  }
  const { headers: responseHeaders, response } =
    await auth.api.generatePasskeyAuthenticationOptions({
      headers: session.requestHeaders,
      returnHeaders: true,
    });
  const jar = await cookies();
  for (const cookie of cookiesToSet(responseHeaders)) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }
  const options = response as Record<string, unknown>;
  const allowed = options.allowCredentials;
  // Without passkeys of its own the plugin would allow any, as for sign-in.
  if (!(Array.isArray(allowed) && allowed.length > 0)) {
    return refuse((text) => text.confirm.passkeyFailed);
  }
  return { ok: true, options: { ...options, userVerification: "required" } };
}

// The plugin's answers for an assertion that doesn't check out.
const PASSKEY_REFUSALS = new Set([
  "CHALLENGE_NOT_FOUND",
  "PASSKEY_NOT_FOUND",
  "AUTHENTICATION_FAILED",
  "PASSKEY_USER_VERIFICATION_REQUIRED",
]);

/**
 * Checks a passkey assertion from this person's own passkey, through the
 * passkey plugin: the signature, the challenge (once), the origin, user
 * verification (packages/auth/passkey.ts refuses without it) and the
 * counter. The plugin then signs in as the passkey's owner; that session
 * is deleted straight away and its token never leaves the server. The call
 * is marked as no sign-in (packages/auth/passkey-check.ts), so a rule about
 * how someone may sign in (their domain requires single sign-on) doesn't
 * refuse it. An unexpected refusal is thrown: not an answer that didn't
 * check out.
 */
export async function verifyOwnPasskey(
  session: Pick<ConfirmableSession, "userId" | "requestHeaders">,
  response: Record<string, unknown>,
): Promise<ConfirmResult> {
  let created: { session?: { token?: string }; user?: { id?: string } } | null =
    null;
  try {
    created = await checkPasskeyWithoutSignIn(() =>
      auth.api.verifyPasskeyAuthentication({
        headers: session.requestHeaders,
        body: { response },
      }),
    );
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "PASSKEY_USER_VERIFICATION_REQUIRED") {
      return refuse((text) => text.passkey.noUserVerification);
    }
    if (code && PASSKEY_REFUSALS.has(code)) {
      return refuse((text) => text.confirm.passkeyFailed);
    }
    throw error;
  } finally {
    const token = created?.session?.token;
    if (token) {
      try {
        await db.delete(sessionTable).where(eq(sessionTable.token, token));
      } catch (error) {
        logError(error as Error, { action: "account.verifyOwnPasskey" });
      }
    }
  }
  return created?.user?.id === session.userId
    ? { ok: true }
    : refuse((text) => text.confirm.passkeyFailed);
}

export async function startPasskeyConfirmation(): Promise<
  { ok: true; options: Record<string, unknown> } | ConfirmResult
> {
  try {
    const session = await currentSession();
    if (!session) return refuse((text) => text.confirm.signedOut);
    const facts = await loadTwoFactorFacts(session.userId);
    // Any passkey of the person's own confirms, two-step verification on or
    // off: it checks the person on their device, which a stolen session
    // cookie can't.
    if (facts.passkeys === 0) {
      return refuse((text) => text.confirm.passkeyUnavailable);
    }
    return await passkeyAssertionOptions(session);
  } catch (error) {
    logError(error as Error, { action: "account.startPasskeyConfirmation" });
    return refuse((text) => text.confirm.failed);
  }
}

const assertionInput = z.object({
  response: z.record(z.string(), z.unknown()),
});

export async function confirmWithPasskey(
  input: unknown,
): Promise<ConfirmResult> {
  const parsed = assertionInput.safeParse(input);
  if (!parsed.success) return refuse((text) => text.confirm.passkeyFailed);
  try {
    const session = await currentSession();
    if (!session) return refuse((text) => text.confirm.signedOut);
    const facts = await loadTwoFactorFacts(session.userId);
    if (facts.passkeys === 0) {
      return refuse((text) => text.confirm.passkeyUnavailable);
    }
    if (!(await answerLimiter.limit(session.userId)).success) {
      return refuse((text) => text.confirm.rateLimited);
    }
    // With two-step verification on, a passkey shares the account's lockout
    // with codes. Without it there's no `two_factor` row to count on, and
    // none is needed: an assertion is a signature from the person's own
    // device over a single-use challenge, so it can't be guessed.
    const attempt = facts.on ? await reserveCodeAttempt(session.userId) : null;
    if (attempt && !attempt.ok) {
      return refuse((text) =>
        attempt.reason === "locked"
          ? text.twoFactor.locked
          : text.confirm.failed,
      );
    }
    let check: ConfirmResult;
    try {
      check = await verifyOwnPasskey(session, parsed.data.response);
    } catch (error) {
      // Something other than the answer failed (the database, or a rule
      // refusing the plugin's throwaway session): not the person's wrong
      // answer, so it doesn't count toward the lockout. A plain failure.
      if (attempt?.ok) await releaseCodeAttempt(attempt.id);
      throw error;
    }
    if (!check.ok) {
      return attempt?.ok && attempt.attempts >= LOCKOUT_FAILURES
        ? refuse((text) => text.twoFactor.locked)
        : check;
    }
    if (attempt?.ok) await clearCodeFailures(attempt.id);
    await recordConfirmation(session, { strong: "passkey" });
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithPasskey" });
    return refuse((text) => text.confirm.passkeyFailed);
  }
}

// ─── Emailed codes (accounts without two-step verification) ─────────────────

interface StoredCode {
  userId: string;
  attempts: number;
  hash: string;
}

function codeKey(): string {
  return env.BETTER_AUTH_SECRET;
}

/** HMAC of the code, bound to the session it was sent for. */
export function confirmationCodeHash(
  key: string,
  sessionId: string,
  code: string,
): string {
  return createHmac("sha256", key)
    .update(`${sessionId}:${code}`)
    .digest("base64url");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseStoredCode(value: string): StoredCode | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCode>;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.attempts === "number" &&
      typeof parsed.hash === "string"
    ) {
      return parsed as StoredCode;
    }
  } catch {
    // Not one of ours: treated as expired.
  }
  return null;
}

async function storeCode(
  sessionId: string,
  code: StoredCode,
  expiresAt: Date,
): Promise<void> {
  const identifier = codeIdentifier(sessionId);
  const now = new Date();
  await db.batch([
    db.delete(verification).where(eq(verification.identifier, identifier)),
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(code),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}

/** Emails a new code to the account's address; the last one stops working. */
export async function sendConfirmationCode(): Promise<ConfirmResult> {
  try {
    const session = await currentSession();
    if (!session) return refuse((text) => text.confirm.signedOut);
    const { on } = await loadTwoFactorFacts(session.userId);
    if (on) return refuse((text) => text.confirm.twoFactorOn);
    if (!signInCodesAvailable()) {
      return refuse((text) => text.confirm.signInAgain);
    }
    if (!(await sendLimiter.limit(session.userId)).success) {
      return refuse((text) => text.confirm.rateLimited);
    }
    const allowed = await addressMayRequestCode(addressKey(session.email), [
      perAddressLimiter,
      perAddressDailyLimiter,
    ]);
    if (!allowed) return refuse((text) => text.confirm.rateLimited);

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await storeCode(
      session.sessionId,
      {
        userId: session.userId,
        attempts: 0,
        hash: confirmationCodeHash(codeKey(), session.sessionId, code),
      },
      new Date(Date.now() + CONFIRMATION_CODE_MINUTES * 60_000),
    );
    // The person asked for it: their language, else the site's (the cookie).
    const intl = await emailIntlForAddress(session.email);
    const details = await currentRequestDetails(new Date(), intl);
    try {
      await deliverSignInCode(
        { email: session.email, otp: code },
        {
          nodeEnv: process.env.NODE_ENV,
          deliveryAllowed: isOutboundDeliveryAllowed(),
          log: (line) => console.info(line),
          send: () =>
            sendEmail({
              to: session.email,
              subject: confirmationCodeSubject(intl),
              react: (
                <ConfirmationCodeEmail
                  code={code}
                  details={details}
                  expiresInMinutes={CONFIRMATION_CODE_MINUTES}
                  intl={intl}
                  recipient={session.email}
                />
              ),
              tags: [{ name: "category", value: "confirmation_code" }],
            }),
        },
        "confirmation code",
      );
    } catch (error) {
      // Undelivered: the stored code can't be used by anyone.
      await db
        .delete(verification)
        .where(eq(verification.identifier, codeIdentifier(session.sessionId)));
      logError(error as Error, { action: "account.sendConfirmationCode" });
      return refuse((text) => text.confirm.codeNotSent);
    }
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.sendConfirmationCode" });
    return refuse((text) => text.confirm.codeNotSent);
  }
}

export type EmailCodeResult =
  | { ok: true }
  | { ok: false; error: string /** Send a new code */; codeDead?: boolean };

/**
 * Checks the emailed code. The stored code is taken out first (so parallel
 * guesses can't share tries) and put back with one more try counted when
 * it's wrong and tries are left.
 */
export async function confirmWithEmailCode(
  input: unknown,
): Promise<EmailCodeResult> {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    })
    .safeParse(input);
  if (!parsed.success) return refuse((text) => text.confirm.invalidCode);
  try {
    const session = await currentSession();
    if (!session) return refuse((text) => text.confirm.signedOut);
    const { on } = await loadTwoFactorFacts(session.userId);
    if (on) return refuse((text) => text.confirm.twoFactorOn);
    if (!(await answerLimiter.limit(session.userId)).success) {
      return refuse((text) => text.confirm.rateLimited);
    }
    const [row] = await db
      .delete(verification)
      .where(eq(verification.identifier, codeIdentifier(session.sessionId)))
      .returning({
        value: verification.value,
        expiresAt: verification.expiresAt,
      });
    const stored = row ? parseStoredCode(row.value) : null;
    if (
      !(row && stored) ||
      stored.userId !== session.userId ||
      new Date(row.expiresAt).getTime() <= Date.now()
    ) {
      return {
        ...(await refuse((text) => text.confirm.codeExpired)),
        codeDead: true,
      };
    }
    const hash = confirmationCodeHash(
      codeKey(),
      session.sessionId,
      parsed.data.code,
    );
    if (sameHash(hash, stored.hash)) {
      await recordConfirmation(session);
      return { ok: true };
    }
    const attempts = stored.attempts + 1;
    if (attempts >= CONFIRMATION_CODE_ATTEMPTS) {
      return {
        ...(await refuse((text) => text.confirm.tooManyCodeAttempts)),
        codeDead: true,
      };
    }
    await storeCode(session.sessionId, { ...stored, attempts }, row.expiresAt);
    return refuse((text) => text.confirm.wrongCode);
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithEmailCode" });
    return refuse((text) => text.confirm.failed);
  }
}
