import { registerSignInCodeSender } from "@repo/auth/email-otp";
import { registerNewSignInNotifier } from "@repo/auth/new-sign-in";
import { registerBackupCodeNotifier } from "@repo/auth/sign-in-challenge";
import { registerTwoFactorResetCancelledNotifier } from "@repo/auth/two-factor-reset";
// Hands packages/auth the audit log's recorder for team changes.
import "@/ee/audit-log/auth-changes";
// And the recorder for new accounts: an affiliate referral and how the
// sign-up's visit started.
import "@/lib/analytics/sign-up-hook";
// And the plan limits for seats, more workspaces, workspace SSO and required
// two-step verification (lib/plans.ts hands them over when it loads).
import "@/lib/plans";
import { notifyNewSignIn } from "@/lib/account/new-sign-in-notice-server";
import { registerAppSessionOriginReader } from "@/lib/account/session-origin";
import { notifyBackupCodeUsed } from "@/lib/account/two-factor-notice-server";
import { notifyTwoFactorResetCancelled } from "@/lib/account/two-factor-reset-server";
import { sendSignInCode, signInCodeAllowed } from "@/lib/auth/sign-in-code";
import { isFeatureAvailable } from "@/lib/feature-availability";

// @repo/auth has no email stack: this is the endpoint that issues sign-in
// codes and finishes sign-ins, so it hands the plugins the app's senders
// before serving requests. Where codes can't reach anyone (the "emailSignIn"
// rule: no Resend, or a production build on a localhost URL), asking for one
// answers that email sign-in isn't set up, the same rule the sign-in panel
// follows. Over the per-address limit it answers 429, before a new code
// replaces the one already sent.
registerSignInCodeSender(
  sendSignInCode,
  () => isFeatureAvailable("emailSignIn"),
  signInCodeAllowed,
);
registerNewSignInNotifier(notifyNewSignIn);
registerBackupCodeNotifier(notifyBackupCodeUsed);
// Where each new session starts, and the check on the ones it holds
// (lib/account/session-origin.ts). instrumentation.ts does this at start-up.
registerAppSessionOriginReader();
registerTwoFactorResetCancelledNotifier(notifyTwoFactorResetCancelled);

export { GET, POST } from "@repo/auth/handlers";
