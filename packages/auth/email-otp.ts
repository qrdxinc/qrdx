import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { EmailOTPOptions } from "better-auth/plugins";
import {
  SEND_SIGN_IN_CODE_PATH,
  SIGN_IN_CODES_UNAVAILABLE,
} from "./sign-in-code-rules";

/**
 * Email codes. This package has no email stack, so the app registers how a
 * code reaches the inbox:
 * - sign-in codes: apps/app registers the sender in its /api/auth route,
 *   with whether codes can be delivered on this deployment at all;
 * - email-change codes (sent to the NEW address): registered by the server
 *   actions that request them (apps/app/app/settings/account/_lib).
 * Email verification and password reset codes are not used; their endpoints
 * are disabled in ./server.ts.
 */

/** Delivers one code. Throw when it couldn't be sent. */
export type SignInCodeSender = (data: {
  email: string;
  otp: string;
}) => Promise<void>;

/** Delivers a code that confirms a new address, to that new address. */
export type EmailChangeCodeSender = SignInCodeSender;

type DeliveredType = "sign-in" | "change-email";

// Kept on globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the senders the app registered.
const SENDERS: Record<DeliveredType, symbol> = {
  "sign-in": Symbol.for("@repo/auth/sign-in-code-sender"),
  "change-email": Symbol.for("@repo/auth/email-change-code-sender"),
};
const SIGN_IN_CODES_DELIVERABLE = Symbol.for(
  "@repo/auth/sign-in-codes-deliverable"
);
type SenderSlots = Record<symbol, SignInCodeSender | undefined>;
type DeliverableSlot = Record<symbol, (() => boolean) | undefined>;

/**
 * `deliverable` says whether a sign-in code can reach anyone here (the app's
 * "emailSignIn" rule in @repo/availability). While it says no, asking for a
 * code fails with SIGN_IN_CODES_UNAVAILABLE before one is made
 * (signInCodeGate below).
 */
export function registerSignInCodeSender(
  sender: SignInCodeSender,
  deliverable: () => boolean
): void {
  (globalThis as unknown as SenderSlots)[SENDERS["sign-in"]] = sender;
  (globalThis as unknown as DeliverableSlot)[SIGN_IN_CODES_DELIVERABLE] =
    deliverable;
}

export function registerEmailChangeCodeSender(
  sender: EmailChangeCodeSender
): void {
  (globalThis as unknown as SenderSlots)[SENDERS["change-email"]] = sender;
}

/** A sign-in sender is registered and says codes can be delivered here. */
export function signInCodesOffered(): boolean {
  const sender = (globalThis as unknown as SenderSlots)[SENDERS["sign-in"]];
  const deliverable = (globalThis as unknown as DeliverableSlot)[
    SIGN_IN_CODES_DELIVERABLE
  ];
  return Boolean(sender && deliverable?.());
}

/** Error code the sign-in dialog shows as "couldn't send the code". */
export const SIGN_IN_CODE_NOT_SENT = "SIGN_IN_CODE_NOT_SENT";
/** Same, for the code that confirms a new email address. */
export const EMAIL_CHANGE_CODE_NOT_SENT = "EMAIL_CHANGE_CODE_NOT_SENT";

const ERRORS: Record<
  DeliveredType,
  { notSent: string; notSentMessage: string; rateLimited: string }
> = {
  "sign-in": {
    notSent: SIGN_IN_CODE_NOT_SENT,
    notSentMessage: "We couldn't send a sign-in code right now.",
    rateLimited: "SIGN_IN_CODE_RATE_LIMITED",
  },
  "change-email": {
    notSent: EMAIL_CHANGE_CODE_NOT_SENT,
    notSentMessage: "We couldn't send a confirmation code right now.",
    rateLimited: "EMAIL_CHANGE_CODE_RATE_LIMITED",
  },
};

const RATE_LIMITED = "SignInCodeRateLimited";

/**
 * Throw this from a sender (sign-in or email-change) when the address has
 * asked for too many codes: the request then fails with 429 ("too many
 * requests") instead of "couldn't send". Matched by name, so any copy of
 * this module works.
 */
export function signInCodeRateLimited(): Error {
  const error = new Error("Too many codes requested for this address");
  error.name = RATE_LIMITED;
  return error;
}

function notSent(type: DeliveredType): APIError {
  return new APIError("INTERNAL_SERVER_ERROR", {
    code: ERRORS[type].notSent,
    message: ERRORS[type].notSentMessage,
  });
}

/** The answer where no sign-in code can be delivered, for any address. */
export function signInCodesUnavailable(): APIError {
  return new APIError("BAD_REQUEST", {
    code: SIGN_IN_CODES_UNAVAILABLE,
    message: "Email sign-in isn't set up on this site.",
  });
}

// Codes and addresses never go into these logs.
function log(level: "warn" | "error", event: string, fields = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

type EndpointContext = Parameters<EmailOTPOptions["sendVerificationOTP"]>[1];

// Better Auth catches what sendVerificationOTP throws, logs it and answers
// the request as if the code went out (`runInBackgroundOrAwait` in
// better-auth's context/create-context.mjs, 1.7). So a sign-in code that
// wasn't sent is also noted against its request here, and signInCodeGate's
// after hook answers with that error instead. Keyed by the request's auth
// context, the one object the endpoint, this sender and the hooks all get;
// it goes when the request does.
const unsentSignInCodes = new WeakMap<object, APIError>();

function unsent(
  ctx: EndpointContext,
  type: DeliveredType,
  error: APIError
): APIError {
  // Sign-in codes only. request-email-change sends nothing when the new
  // address already has an account, so a failed send there would tell the
  // asker which addresses have none: it stays as Better Auth answers it.
  if (type === "sign-in" && ctx?.context) {
    unsentSignInCodes.set(ctx.context, error);
  }
  return error;
}

/** The emailOTP plugin's `sendVerificationOTP`. */
export const sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"] =
  async ({ email, otp, type }, ctx) => {
    if (type !== "sign-in" && type !== "change-email") {
      log("warn", "auth.email_otp.ignored", { type });
      return;
    }
    const sender = (globalThis as unknown as SenderSlots)[SENDERS[type]];
    if (!sender) {
      log("error", "auth.email_otp.no_sender", { type });
      throw unsent(ctx, type, notSent(type));
    }
    try {
      await sender({ email, otp });
    } catch (error) {
      if (error instanceof Error && error.name === RATE_LIMITED) {
        log("warn", "auth.email_otp.rate_limited", { type });
        throw unsent(
          ctx,
          type,
          new APIError("TOO_MANY_REQUESTS", {
            code: ERRORS[type].rateLimited,
            message: "Too many codes requested. Try again in a few minutes.",
          })
        );
      }
      log("error", "auth.email_otp.failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw unsent(ctx, type, notSent(type));
    }
  };

const onSendCodePath = (ctx: { path?: string }) =>
  ctx.path === SEND_SIGN_IN_CODE_PATH;

/**
 * Keeps the send-code endpoint honest (registered in ./server.ts):
 * - before: where no code can be delivered (signInCodesOffered), it answers
 *   SIGN_IN_CODES_UNAVAILABLE before a code is made;
 * - after: a code the sender couldn't send (noted above) is the answer,
 *   rather than Better Auth's "sent".
 * The plugin emails a sign-in code whether or not the address has an
 * account (sign-up is on), so neither answer says anything about accounts.
 */
export const signInCodeGate = () =>
  ({
    id: "qrdx-sign-in-code-gate",
    hooks: {
      before: [
        {
          matcher: onSendCodePath,
          handler: createAuthMiddleware(() => {
            if (signInCodesOffered()) return Promise.resolve();
            log("warn", "auth.email_otp.unavailable");
            return Promise.reject(signInCodesUnavailable());
          }),
        },
      ],
      after: [
        {
          matcher: onSendCodePath,
          handler: createAuthMiddleware((ctx) => {
            const error = unsentSignInCodes.get(ctx.context);
            return error ? Promise.reject(error) : Promise.resolve();
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
