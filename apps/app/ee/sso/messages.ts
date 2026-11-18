// Workspace SSO copy shared by the sign-in panel, the /sign-in page and the
// settings page. Pure and client-safe. The sign-in errors are
// auth.signInErrors in messages/en.json; callers pass its translator.

import type { EmailChangeSsoProblem } from "@repo/auth/sso-required-rules";
import type { Translator } from "@/lib/i18n/translator";

export type SignInErrorTranslator = Translator<"auth.signInErrors">;

/**
 * Codes the plugin and packages/auth/ee/sso.ts send back (?error= or JSON).
 * `domain`: the typed work email's (startSsoSignIn), never one from the URL.
 */
export function ssoSignInErrorMessage(
  code: string | null | undefined,
  t: SignInErrorTranslator,
  domain?: string | null,
): string {
  switch (code) {
    case "SSO_EMAIL_REQUIRED":
      return t("sso.emailRequired");
    case "SSO_NOT_FOUND":
      return domain ? t("sso.notSetUpFor", { domain }) : t("sso.notFound");
    case "SSO_NOT_AVAILABLE":
      return domain ? t("sso.notAvailableFor", { domain }) : t("sso.notFound");
    case "sso_required":
      return t("sso.required");
    case "sso_unavailable":
      return t("sso.unavailable");
    case "sso_email_outside_domain":
      return t("sso.emailOutsideDomain");
    case "sso_email_unverified":
      return t("sso.emailUnverified");
    case "sso_email_missing":
      return t("sso.emailMissing");
    case "sso_weak_signature":
      return t("sso.weakSignature");
    case "unsolicited_response":
      return t("sso.unsolicitedResponse");
    case "replay_detected":
      return t("sso.replayDetected");
    case "account_not_linked":
    case "account not linked":
      return t("sso.accountNotLinked");
    case "access_denied":
      return t("cancelled");
    case "invalid_state":
      return t("tookTooLong");
    default:
      return t("sso.failed");
  }
}

/** Why an email change was refused: a domain that requires single sign-on. */
export function ssoEmailChangeMessage(problem: EmailChangeSsoProblem): string {
  return problem.kind === "off"
    ? `Your company requires single sign-on for ${problem.domain}, so your account can't move to an address elsewhere. Ask your workspace admin.`
    : `Your company requires single sign-on for ${problem.domain}. To use an address there, sign in with SSO instead.`;
}
