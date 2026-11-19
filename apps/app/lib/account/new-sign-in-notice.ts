/**
 * The alert emailed when a browser or device signs in to an account for the
 * first time (packages/auth/new-sign-in.ts decides when). Pure; the sender
 * is ./new-sign-in-notice-server.tsx.
 */
import type { SecondStep } from "@repo/auth/new-sign-in";
import { isReservedEmailAddress } from "@repo/email/reserved-address";
import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import type { NoticeDeliveryDeps } from "./email-change";

// Product names stay as they are in every language.
const PROVIDERS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

// The rest are translated (emails.newSignIn in messages/en.json).
const METHODS = {
  "email-otp": "emailOtp",
  passkey: "passkey",
  sso: "sso",
} as const;

const SECOND_STEPS = {
  totp: "totp",
  "backup-code": "backupCode",
  passkey: "passkey",
} as const satisfies Record<SecondStep, string>;

/** "Google", "Email code, then a passkey"; null when the way in is unknown. */
export function signInMethodLabel(
  method: string | null,
  secondStep: SecondStep | null,
  intl: EmailIntl = ENGLISH_EMAIL,
): string | null {
  if (!method) return null;
  const { t } = intl;
  let first: string | null = null;
  if (Object.hasOwn(PROVIDERS, method)) first = PROVIDERS[method];
  else if (Object.hasOwn(METHODS, method)) {
    first = t(`newSignIn.methods.${METHODS[method as keyof typeof METHODS]}`);
  }
  if (!first) return null;
  return secondStep
    ? t("newSignIn.withSecondStep", {
        method: first,
        secondStep: t(`newSignIn.secondSteps.${SECOND_STEPS[secondStep]}`),
      })
    : first;
}

// Test and e2e accounts use reserved addresses (@qrdx.test) and sign in
// from fresh browsers all the time; they're never emailed.
export { isReservedEmailAddress } from "@repo/email/reserved-address";

/**
 * Emails the alert where outbound delivery is on, writes it to the console in
 * local dev. Reserved test addresses are never emailed ("skipped"). Never
 * throws: the sign-in has happened, so a failed alert is reported (and
 * logged by the caller).
 */
export async function deliverNewSignInNotice(
  { email, summary }: { email: string; summary: string },
  deps: NoticeDeliveryDeps,
): Promise<"emailed" | "logged" | "skipped" | "not-sent"> {
  try {
    if (deps.deliveryAllowed && deps.nodeEnv !== "test") {
      if (isReservedEmailAddress(email)) return "skipped";
      const result = await deps.send();
      return result.sent ? "emailed" : "not-sent";
    }
    if (deps.nodeEnv === "production") return "not-sent";
    deps.log(
      `[dev only] QRdx new sign-in alert for ${email}: ${summary} (not emailed: delivery is off outside production)`,
    );
    return "logged";
  } catch {
    return "not-sent";
  }
}
