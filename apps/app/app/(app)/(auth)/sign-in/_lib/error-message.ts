// What /sign-in says when a sign-in comes back refused (`?error=<code>`).
// Google and GitHub come back with `?via=<provider>` as well
// (socialSignInErrorPath), so their failures name the provider; anything
// else is a workspace single sign-on and keeps SSO's own messages
// (ee/sso/messages.ts). Where this server can't send email codes, the
// messages that would suggest one point to another way in, or to whoever
// runs the site. Pure and client-safe; the copy is auth.signInErrors.

import { SSO_REQUIRED_ERROR } from "@repo/auth/sso-required-rules";
import { UNVERIFIED_SIGN_UP_ERROR } from "@repo/auth/verified-sign-up";
import {
  type SignInErrorTranslator,
  ssoSignInErrorMessage,
} from "@/ee/sso/messages";
import type { SignInOptions } from "@/lib/auth/sign-in-options";
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

/**
 * Whether this server offers a way in besides the one that failed (Google,
 * GitHub, or single sign-on for null). Passkeys need an account first, so
 * they don't count.
 */
function otherWayIn(
  ways: SignInOptions,
  failed: SocialSignIn | null,
): "yes" | "no" {
  const other =
    (failed !== "google" && ways.google) ||
    (failed !== "github" && ways.github) ||
    (failed !== null && ways.sso);
  return other ? "yes" : "no";
}

/**
 * `ways` is what this server offers for the request (/sign-in passes it);
 * without it, the messages are as if email codes work.
 */
export function signInErrorMessage(
  code: string,
  via: SocialSignIn | null,
  t: SignInErrorTranslator,
  ways?: SignInOptions,
): string {
  const noCodes = ways !== undefined && !ways.email;
  switch (code) {
    case UNVERIFIED_SIGN_UP_ERROR.github:
      return noCodes
        ? t("githubUnverifiedNoEmailCodes", {
            provider: LABELS.github,
            otherWay: otherWayIn(ways, "github"),
          })
        : t("githubUnverified", { provider: LABELS.github });
    case UNVERIFIED_SIGN_UP_ERROR.google:
      return noCodes
        ? t("googleUnverifiedNoEmailCodes", {
            provider: LABELS.google,
            otherWay: otherWayIn(ways, "google"),
          })
        : t("googleUnverified", { provider: LABELS.google });
    case UNVERIFIED_SIGN_UP_ERROR.other:
      return noCodes
        ? t("otherUnverifiedNoEmailCodes", {
            otherWay: otherWayIn(ways, via),
          })
        : t("otherUnverified");
    // Google or GitHub for an address whose company requires SSO.
    case SSO_REQUIRED_ERROR:
      return ssoSignInErrorMessage(code, t);
  }
  if (!via) {
    // Single sign-on's account_not_linked, as ee/sso/messages.ts spells it.
    if (
      noCodes &&
      (code === "account_not_linked" || code === "account not linked")
    ) {
      return t("sso.accountNotLinkedNoEmailCodes", {
        otherWay: otherWayIn(ways, null),
      });
    }
    return ssoSignInErrorMessage(code, t);
  }
  const provider = LABELS[via];
  switch (code) {
    case "access_denied":
      return t("cancelled");
    case "account_not_linked":
      return noCodes
        ? t("accountNotLinkedNoEmailCodes", {
            provider,
            otherWay: otherWayIn(ways, via),
          })
        : t("accountNotLinked", { provider });
    case "email_not_found":
      return noCodes
        ? t("emailNotSharedNoEmailCodes", {
            provider,
            otherWay: otherWayIn(ways, via),
          })
        : t("emailNotShared", { provider });
    case "state_mismatch":
    case "state_not_found":
    case "state_invalid":
    case "please_restart_the_process":
      return t("tookTooLong");
    default:
      return t("providerFailed", { provider });
  }
}
