import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { EmailOTPOptions } from "better-auth/plugins";
import {
  EMAIL_CHANGE_UNAVAILABLE,
  REQUEST_EMAIL_CHANGE_PATH,
  SEND_SIGN_IN_CODE_PATH,
  SIGN_IN_CODES_UNAVAILABLE,
} from "./sign-in-code-rules";

/**
 * Email codes. This package has no email stack, so the app registers how a
 * code reaches the inbox:
 * - sign-in codes: apps/app registers the sender in its /api/auth route,
 *   with whether codes can be delivered on this deployment at all and its
 *   per-address limit;
 * - email-change codes (sent to the NEW address): registered by the server
 *   actions that request them (apps/app/app/settings/account/_lib), with
 *   whether codes can be delivered on this deployment at all, their
 *   per-address limit and how to run work after the answer (Next's after()).
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

/**
 * Whether another sign-in code may be sent to `email` (the app's
 * per-address limit). Reads the address and its own count only, never
 * whether an account exists. Each call counts as one request.
 */
export type SignInCodeLimit = (email: string) => Promise<boolean>;

/**
 * Runs `task` once the answer has gone (Next's after() in the app), so the
 * request doesn't wait for it. `task` never rejects.
 */
export type AfterAnswer = (task: () => Promise<void>) => void;

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
const SIGN_IN_CODE_LIMIT = Symbol.for("@repo/auth/sign-in-code-limit");
const EMAIL_CHANGE_CODES_DELIVERABLE = Symbol.for(
  "@repo/auth/email-change-codes-deliverable"
);
const EMAIL_CHANGE_CODE_LIMIT = Symbol.for(
  "@repo/auth/email-change-code-limit"
);
const EMAIL_CHANGE_AFTER_ANSWER = Symbol.for(
  "@repo/auth/email-change-after-answer"
);
type SenderSlots = Record<symbol, SignInCodeSender | undefined>;
type DeliverableSlot = Record<symbol, (() => boolean) | undefined>;
type LimitSlot = Record<symbol, SignInCodeLimit | undefined>;
type AfterAnswerSlot = Record<symbol, AfterAnswer | undefined>;

/**
 * `deliverable` says whether a sign-in code can reach anyone here (the app's
 * "emailSignIn" rule in @repo/availability). While it says no, asking for a
 * code fails with SIGN_IN_CODES_UNAVAILABLE before one is made
 * (signInCodeGate below). `mayRequest` is the per-address limit, checked
 * there too: Better Auth stores a new code (and so voids the last one)
 * before the sender runs, so a limit in the sender would leave someone who
 * resends too often with no working code.
 */
export function registerSignInCodeSender(
  sender: SignInCodeSender,
  deliverable: () => boolean,
  mayRequest: SignInCodeLimit
): void {
  (globalThis as unknown as SenderSlots)[SENDERS["sign-in"]] = sender;
  (globalThis as unknown as DeliverableSlot)[SIGN_IN_CODES_DELIVERABLE] =
    deliverable;
  (globalThis as unknown as LimitSlot)[SIGN_IN_CODE_LIMIT] = mayRequest;
}

/**
 * `deliverable` says whether a code can reach a new address here (the same
 * rule as sign-in codes). While it says no, asking to change the email fails
 * with EMAIL_CHANGE_UNAVAILABLE before a code is made (signInCodeGate below).
 * `mayRequest` is the new address's limit, checked there too, before Better
 * Auth looks the address up. `later` runs the send after the answer: Better
 * Auth sends nothing to an address that already has an account, so a send
 * the answer waited for would make a free address answer much later than a
 * taken one. That isn't all of the difference: Better Auth also deletes the
 * code it stored for a taken address before answering, which the app's
 * actions hide by answering on whole multiples of a fixed step
 * (EMAIL_CHANGE_ANSWER_MS in apps/app/lib/account/email-change.ts).
 * Registered on its own: the server actions that ask for these codes may run
 * where the /api/auth route, which registers the sign-in sender, never
 * loaded.
 */
export function registerEmailChangeCodeSender(
  sender: EmailChangeCodeSender,
  deliverable: () => boolean,
  mayRequest: SignInCodeLimit,
  later: AfterAnswer
): void {
  (globalThis as unknown as SenderSlots)[SENDERS["change-email"]] = sender;
  (globalThis as unknown as DeliverableSlot)[EMAIL_CHANGE_CODES_DELIVERABLE] =
    deliverable;
  (globalThis as unknown as LimitSlot)[EMAIL_CHANGE_CODE_LIMIT] = mayRequest;
  (globalThis as unknown as AfterAnswerSlot)[EMAIL_CHANGE_AFTER_ANSWER] = later;
}

const signInCodeLimit = () =>
  (globalThis as unknown as LimitSlot)[SIGN_IN_CODE_LIMIT];
const emailChangeCodeLimit = () =>
  (globalThis as unknown as LimitSlot)[EMAIL_CHANGE_CODE_LIMIT];
const emailChangeAfterAnswer = () =>
  (globalThis as unknown as AfterAnswerSlot)[EMAIL_CHANGE_AFTER_ANSWER];

/**
 * A sign-in sender is registered, with its per-address limit, and says
 * codes can be delivered here.
 */
export function signInCodesOffered(): boolean {
  const sender = (globalThis as unknown as SenderSlots)[SENDERS["sign-in"]];
  const deliverable = (globalThis as unknown as DeliverableSlot)[
    SIGN_IN_CODES_DELIVERABLE
  ];
  return Boolean(sender && signInCodeLimit() && deliverable?.());
}

/**
 * An email-change sender is registered, with its per-address limit and a
 * way to send after the answer, and says codes can be delivered here.
 */
export function emailChangeCodesOffered(): boolean {
  const sender = (globalThis as unknown as SenderSlots)[
    SENDERS["change-email"]
  ];
  const deliverable = (globalThis as unknown as DeliverableSlot)[
    EMAIL_CHANGE_CODES_DELIVERABLE
  ];
  return Boolean(
    sender &&
      emailChangeCodeLimit() &&
      emailChangeAfterAnswer() &&
      deliverable?.()
  );
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
 * Throw this from a sign-in sender when the address has asked for too many
 * codes: the request then fails with 429 ("too many requests") instead of
 * "couldn't send". The app's senders don't: both kinds of code are limited
 * in signInCodeGate, before one is made, by the limit registered with their
 * sender. Matched by name, so any copy of this module works.
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

function rateLimited(type: DeliveredType): APIError {
  return new APIError("TOO_MANY_REQUESTS", {
    code: ERRORS[type].rateLimited,
    message: "Too many codes requested. Try again in a few minutes.",
  });
}

/** The answer where no sign-in code can be delivered, for any address. */
export function signInCodesUnavailable(): APIError {
  return new APIError("BAD_REQUEST", {
    code: SIGN_IN_CODES_UNAVAILABLE,
    message: "Email sign-in isn't set up on this site.",
  });
}

/** The answer to a change of email where no code can be delivered. */
export function emailChangeUnavailable(): APIError {
  return new APIError("BAD_REQUEST", {
    code: EMAIL_CHANGE_UNAVAILABLE,
    message:
      "Email isn't set up on this site, so the address can't be changed here.",
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
  // Sign-in codes only. An email-change code goes out after the answer
  // (below): request-email-change sends nothing when the new address already
  // has an account, so a failed send there would tell the asker which
  // addresses have none.
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
    if (type === "change-email") {
      // Better Auth only gets here for an address with no account. Sending
      // after the answer keeps the email out of the time to answer, and a
      // failure out of the answer: it's logged, and nobody is told, as nobody
      // is told about a taken address.
      const later = emailChangeAfterAnswer();
      if (!later) {
        log("error", "auth.email_otp.no_after_answer", { type });
        throw notSent(type);
      }
      later(() => sendAfterAnswer(type, () => sender({ email, otp })));
      return;
    }
    try {
      await sender({ email, otp });
    } catch (error) {
      if (error instanceof Error && error.name === RATE_LIMITED) {
        log("warn", "auth.email_otp.rate_limited", { type });
        throw unsent(ctx, type, rateLimited(type));
      }
      log("error", "auth.email_otp.failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw unsent(ctx, type, notSent(type));
    }
  };

async function sendAfterAnswer(
  type: DeliveredType,
  send: () => Promise<void>
): Promise<void> {
  try {
    await send();
  } catch (error) {
    log("error", "auth.email_otp.failed", {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const onSendCodePath = (ctx: { path?: string }) =>
  ctx.path === SEND_SIGN_IN_CODE_PATH;
const onRequestEmailChangePath = (ctx: { path?: string }) =>
  ctx.path === REQUEST_EMAIL_CHANGE_PATH;

/**
 * The per-address limit for a code request, before the endpoint makes the
 * code (and, for a new address, before Better Auth looks it up). The body
 * isn't validated yet: an address that isn't a string is left to the
 * endpoint, which refuses it.
 */
async function checkCodeLimit(
  type: DeliveredType,
  email: unknown,
  mayRequest: SignInCodeLimit
): Promise<void> {
  if (typeof email !== "string") return;
  let allowed: boolean;
  try {
    allowed = await mayRequest(email);
  } catch (error) {
    log("error", "auth.email_otp.limit_failed", {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    throw notSent(type);
  }
  if (allowed) return;
  log("warn", "auth.email_otp.rate_limited", { type });
  throw rateLimited(type);
}

/**
 * Keeps the send-code endpoint honest (registered in ./server.ts):
 * - before: where no code can be delivered (signInCodesOffered), it answers
 *   SIGN_IN_CODES_UNAVAILABLE; over the per-address limit, 429. Both before
 *   a code is made, so the last code someone was sent keeps working;
 * - after: a code the sender couldn't send (noted above) is the answer,
 *   rather than Better Auth's "sent".
 * The plugin emails a sign-in code whether or not the address has an
 * account (sign-up is on), and the limit counts by address alone, so none
 * of these answers says anything about accounts.
 *
 * And the request-email-change endpoint (called by the app through auth.api,
 * which runs these hooks too), before the session is checked or Better Auth
 * looks the new address up: where no code can be delivered
 * (emailChangeCodesOffered), EMAIL_CHANGE_UNAVAILABLE; over the new
 * address's limit, 429. The limit counts the address alone, so a taken
 * address and a free one are counted and refused alike, and a refusal
 * leaves the last code working. Otherwise Better Auth's own "sent" stands:
 * it sends nothing to an address that already has an account, so the code
 * goes out after the answer (sendVerificationOTP) and a failed send never
 * reaches it. The answers are then the same for both; the database work
 * behind them isn't quite, which the app hides with a minimum answer time.
 */
export const signInCodeGate = () =>
  ({
    id: "qrdx-sign-in-code-gate",
    hooks: {
      before: [
        {
          matcher: onSendCodePath,
          handler: createAuthMiddleware(async (ctx) => {
            const mayRequest = signInCodeLimit();
            if (!(mayRequest && signInCodesOffered())) {
              log("warn", "auth.email_otp.unavailable");
              throw signInCodesUnavailable();
            }
            // Only sign-in codes are sent from here: the endpoint refuses
            // change-email and sends nothing for the other types.
            const { email, type } = (ctx.body ?? {}) as {
              email?: unknown;
              type?: unknown;
            };
            if (type === "sign-in") {
              await checkCodeLimit("sign-in", email, mayRequest);
            }
          }),
        },
        {
          matcher: onRequestEmailChangePath,
          handler: createAuthMiddleware(async (ctx) => {
            const mayRequest = emailChangeCodeLimit();
            if (!(mayRequest && emailChangeCodesOffered())) {
              log("warn", "auth.email_otp.unavailable", {
                type: "change-email",
              });
              throw emailChangeUnavailable();
            }
            const { newEmail } = (ctx.body ?? {}) as { newEmail?: unknown };
            await checkCodeLimit("change-email", newEmail, mayRequest);
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
