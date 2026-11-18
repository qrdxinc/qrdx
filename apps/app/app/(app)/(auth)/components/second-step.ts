/**
 * The second step of signing in: which method to show, what to call it and
 * what to say when it fails. Pure and client-safe; two-factor-challenge.tsx
 * renders it, tests/auth/sign-in-challenge-ui.test.ts checks it. The copy is
 * auth.secondStep in messages/en.json: the headings (`titles`), the links
 * that switch to each method (`switchTo`) and the lines under them.
 */
import type { PasskeyStepResult } from "@repo/auth/passkey-client";
import {
  BACKUP_CODE_ALPHABET,
  LOCKOUT_MINUTES,
  type TwoFactorMethods,
} from "@repo/auth/sign-in-challenge-rules";
import type { Translator } from "@/lib/i18n/translator";

export type SecondStep = "passkey" | "totp" | "backup";

export type SecondStepTranslator = Translator<"auth.secondStep">;

/**
 * The methods to offer, best first: a passkey (when this browser can use
 * one), the authenticator app, backup codes. `methods` is null when the
 * server couldn't say; then everything this browser can do is offered, with
 * the passkey last so its prompt doesn't open for someone without one.
 */
export function offeredSteps(
  methods: TwoFactorMethods | null,
  passkeysHere: boolean,
): SecondStep[] {
  if (!methods) {
    return passkeysHere ? ["totp", "backup", "passkey"] : ["totp", "backup"];
  }
  const steps: SecondStep[] = [];
  if (passkeysHere && methods.passkey) steps.push("passkey");
  if (methods.totp) steps.push("totp");
  if (methods.backupCodes) steps.push("backup");
  return steps;
}

/** The method to start with: the one used last here, else the best. */
export function firstStep(
  steps: readonly SecondStep[],
  remembered: RememberedStep | null,
): SecondStep | null {
  if (remembered && steps.includes(remembered)) return remembered;
  return steps[0] ?? null;
}

// The method that last finished a sign-in in this browser: a passkey or the
// authenticator app. Only its name is kept, never a code. A backup code is a
// fallback, so it's never remembered: the next sign-in opens on whatever was
// remembered before, not on the backup field.
const REMEMBERED_KEY = "qrdx:second-step";

export type RememberedStep = Exclude<SecondStep, "backup">;

function isRememberedStep(value: unknown): value is RememberedStep {
  return value === "passkey" || value === "totp";
}

export function readRememberedStep(): RememberedStep | null {
  try {
    const value = window.localStorage.getItem(REMEMBERED_KEY);
    return isRememberedStep(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remembers a passkey or the authenticator app; a backup code changes nothing. */
export function rememberStep(step: SecondStep): void {
  if (!isRememberedStep(step)) return;
  try {
    window.localStorage.setItem(REMEMBERED_KEY, step);
  } catch {
    // Private windows and blocked storage: nothing to remember then.
  }
}

/**
 * A prompt that failed this quickly never showed: the browser refused to
 * open it without a click (some do when it opens on its own) or the page
 * wasn't focused. Then the button is offered without an error.
 */
export const PROMPT_REFUSED_MS = 1_000;

export interface PasskeyStepOutcome {
  /** The line under the button; null shows the hint instead. */
  message: string | null;
  /** This challenge can't be finished any more: only "Sign in again". */
  over: boolean;
  /** A wrong answer, counted against the challenge's attempts. */
  counted: boolean;
}

/** What a failed passkey step means for the page. */
export function passkeyStepOutcome(
  result: Extract<PasskeyStepResult, { ok: false }>,
  { automatic }: { automatic: boolean },
  t: SecondStepTranslator,
): PasskeyStepOutcome {
  const quiet = { over: false, counted: false };
  if (result.kind === "aborted") return { message: null, ...quiet };
  if (result.kind === "prompt") {
    if (automatic && result.promptMs < PROMPT_REFUSED_MS) {
      return { message: null, ...quiet };
    }
    return { message: t("passkey.closed"), ...quiet };
  }
  if (result.kind === "browser") {
    return { message: t("passkey.failed"), ...quiet };
  }
  switch (result.code) {
    case "INVALID_PASSKEY":
      return { message: t("passkey.failed"), over: false, counted: true };
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return {
        message: t("passkey.userVerification"),
        over: false,
        counted: true,
      };
    // The server no longer had the request the passkey answered (it expired,
    // or another tab asked for a newer one).
    case "PASSKEY_CHALLENGE_NOT_FOUND":
      return { message: t("passkey.expiredRequest"), ...quiet };
    case "PASSKEY_STEP_UNAVAILABLE":
      return { message: t("passkey.unavailable"), ...quiet };
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return { message: t("passkey.tooManyTries"), over: true, counted: false };
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return {
        message: t("passkey.locked", { minutes: LOCKOUT_MINUTES }),
        over: true,
        counted: false,
      };
    case "INVALID_TWO_FACTOR_COOKIE":
      return { message: t("passkey.expired"), over: true, counted: false };
    // The sign-in this finishes started with an email code just as the
    // workspace began requiring SSO for the address.
    case "sso_required":
      return { message: t("passkey.ssoRequired"), over: true, counted: false };
  }
  if (result.status === 429) {
    return { message: t("passkey.rateLimited"), ...quiet };
  }
  return { message: t("passkey.connection"), ...quiet };
}

/** `"0" or "1"`, each "or" from the catalog. */
const quoteList = (chars: readonly string[], t: SecondStepTranslator) =>
  chars
    .map((char) => `"${char}"`)
    .reduce((first, second) => t("backupCode.or", { first, second }));

/**
 * Why what someone typed can't be a backup code ("ABCDE-FGH23": 10 capital
 * letters and digits 2 to 9, any case, dash and spaces optional), or null
 * when it could be one.
 */
export function backupCodeProblem(
  input: string,
  t: SecondStepTranslator,
): string | null {
  const chars = input.replace(/[\s-]+/g, "").toUpperCase();
  if (!chars) return t("backupCode.empty");
  const strange = [...new Set(chars)].filter((char) => !/[A-Z0-9]/.test(char));
  if (strange.length) {
    return t("backupCode.strange", { chars: quoteList(strange, t) });
  }
  if (chars.length !== 10) {
    return t("backupCode.length", { count: chars.length });
  }
  const lookalikes = [...new Set(chars)].filter(
    (char) => !BACKUP_CODE_ALPHABET.includes(char),
  );
  if (lookalikes.length) {
    return t("backupCode.lookalikes", { chars: quoteList(lookalikes, t) });
  }
  return null;
}
