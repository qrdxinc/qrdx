// What /sign-in says when a sign-in comes back refused (`?error=<code>`).
// Google and GitHub come back with `?via=<provider>` as well
// (socialSignInErrorPath), so their failures name the provider; anything
// else is a workspace single sign-on and keeps SSO's own messages
// (ee/sso/messages.ts). Pure and client-safe; the copy is auth.signInErrors.

import { SSO_REQUIRED_ERROR } from "@repo/auth/sso-required-rules";
import { UNVERIFIED_SIGN_UP_ERROR } from "@repo/auth/verified-sign-up";
import {
  type SignInErrorTranslator,
  ssoSignInErrorMessage,
} from "@/ee/sso/messages";
import { signInPath } from "@/lib/safe-redirect";

export const SOCIAL_SIGN_INS = ["google", "github"] as const;
export type SocialSignIn = (typeof SOCIAL_SIGN_INS)[number];

const LABELS: Record<SocialSignIn, string> = {
  google: "Google",
  github: "GitHub",
};

export function isSocialSignIn(value: unknown): value is SocialSignIn {
  return (SOCIAL_SIGN_INS as readonly unknown[]).includes(value);
}

/** Where a Google or GitHub sign-in that fails comes back to: this page. */
export function socialSignInErrorPath(next: string, via: SocialSignIn): string {
  const path = signInPath(next);
  return `${path}${path.includes("?") ? "&" : "?"}via=${via}`;
}

export function signInErrorMessage(
  code: string,
  via: SocialSignIn | null,
  t: SignInErrorTranslator,
): string {
  switch (code) {
    case UNVERIFIED_SIGN_UP_ERROR.github:
      return t("githubUnverified", { provider: LABELS.github });
    case UNVERIFIED_SIGN_UP_ERROR.google:
      return t("googleUnverified", { provider: LABELS.google });
    case UNVERIFIED_SIGN_UP_ERROR.other:
      return t("otherUnverified");
    // Google or GitHub for an address whose company requires SSO.
    case SSO_REQUIRED_ERROR:
      return ssoSignInErrorMessage(code, t);
  }
  if (!via) return ssoSignInErrorMessage(code, t);
  const provider = LABELS[via];
  switch (code) {
    case "access_denied":
      return t("cancelled");
    case "account_not_linked":
      return t("accountNotLinked", { provider });
    case "email_not_found":
      return t("emailNotShared", { provider });
    case "state_mismatch":
    case "state_not_found":
    case "state_invalid":
    case "please_restart_the_process":
      return t("tookTooLong");
    default:
      return t("providerFailed", { provider });
  }
}
