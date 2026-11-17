"use server";

import { database as db, oauthApp } from "@repo/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import {
  cancelImport,
  cancelPendingTwoFactorReset,
  changeAccountEmail,
  deleteUserAccount,
  disconnectIntegration,
  markEmailVerified,
  requeueImport,
  resendTeamInvitation,
  retryWebhookDelivery,
  startTwoFactorReset,
  unlinkSignInMethod,
} from "../_lib/operations";
import { adminId, requiredReason } from "../_lib/rules";
import {
  changeEmailSchema,
  deleteSchema,
  deliverySchema,
  importSchema,
  integrationSchema,
  invitationSchema,
  unlinkSchema,
  userReasonSchema as userReason,
} from "../_lib/schemas";
import { requireStrongAdmin } from "../_lib/strong-admin";

// Support actions on the user 360 page (/admin/users/<id>). Each one goes
// through runAdminAction: admin re-check, rate limit, reason, audit entry.
// The work of most is in ../_lib/operations.ts, which the back-office
// console's endpoints (app/api/internal/console) run too.

// ─── Account ─────────────────────────────────────────────────────────────────

/** For people who can't receive the code but proved ownership another way. */
export async function markEmailVerifiedAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.mark_email_verified", schema: userReason },
    input,
    (admin, data) =>
      markEmailVerified(admin, data, {
        requireStrong: () => requireStrongAdmin(admin),
      }),
  );
}

/**
 * For someone who lost their authenticator app, passkeys and backup codes,
 * once they wrote to support from the account's address. Nothing changes
 * yet: the reset waits 7 days (lib/account/two-factor-reset-server.ts) and
 * the address is told the day, so an owner who didn't ask can cancel it
 * (in Settings, or by signing in with an authenticator code or a backup
 * code) or reply. On that day the daily cron turns two-step verification
 * off (secret, backup codes and trusted devices gone), signs out every
 * session of the account and emails the address.
 *
 * The notice is the point of the wait, so it goes out first, and nothing is
 * scheduled unless it did (resetNoticeDelivered: never from a server that
 * can't email, such as a preview or a local server, unless that local
 * server's database is a throwaway one started with QRDX_DISPOSABLE_DB=1).
 *
 * Whoever wrote in may not be the owner, so a stolen admin cookie must not be
 * enough to start it: requireStrongAdmin, as for changing the email. Never
 * for an admin's account (a role, or ADMIN_EMAILS / ADMIN_USER_IDS) or the
 * admin's own.
 */
export async function resetTwoFactorAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult<{ dueAt: string }>> {
  return runAdminAction(
    { action: "user.reset_two_factor", schema: userReason, limit: "sensitive" },
    input,
    (admin, data) =>
      startTwoFactorReset(admin, data, {
        requireStrong: () => requireStrongAdmin(admin),
      }),
  );
}

/**
 * Stops a pending reset (say the owner replied that it wasn't them). Two-step
 * verification stays as it is, and the address is told. Cancelling one the
 * owner really asked for leaves them locked out, so it takes the same
 * requireStrongAdmin as starting one: not a stolen admin cookie alone.
 */
export async function cancelTwoFactorResetAction(
  input: z.input<typeof userReason>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.reset_two_factor_cancel", schema: userReason },
    input,
    (admin, data) =>
      cancelPendingTwoFactorReset(admin, data, {
        requireStrong: () => requireStrongAdmin(admin),
      }),
  );
}

/**
 * For someone who lost their mailbox and has no other way to confirm it's
 * them, only after the checks in the lost-email policy (the help page
 * apps/docs/content/docs/help/account-and-billing/sign-in.mdx, "Lost access to your
 * email"). The account moves to the new address, marked verified (support
 * had a reply from it); every session is signed out, and the old address
 * gets the "email changed" notice, by QRdx support.
 *
 * This hands an account to whoever controls the new address, so a stolen
 * admin cookie must not be enough: the admin needs two-step verification
 * on their own account and a confirmation in the last 10 minutes with a
 * passkey, an authenticator code or a backup code (CONFIRMATION_REQUIRED
 * opens that dialog). Never for an admin's account or the admin's own.
 */
export async function changeEmailAction(
  input: z.input<typeof changeEmailSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "user.change_email",
      schema: changeEmailSchema,
      limit: "sensitive",
    },
    input,
    (admin, data) =>
      changeAccountEmail(admin, data, {
        requireStrong: () => requireStrongAdmin(admin),
      }),
  );
}

/** Removes a linked GitHub / Google sign-in; never the user's last one. */
export async function unlinkSignInMethodAction(
  input: z.input<typeof unlinkSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.unlink_sign_in", schema: unlinkSchema },
    input,
    (admin, data) => unlinkSignInMethod(admin, data),
  );
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Sends a failed (or stuck pending) delivery once more through the normal
 * worker, which still applies the endpoint's state and plan checks. Outside
 * production nothing leaves the server (lib/delivery-guard).
 */
export async function retryWebhookDeliveryAction(
  input: z.input<typeof deliverySchema>,
): Promise<AdminActionResult<{ status: string; error: string | null }>> {
  return runAdminAction(
    { action: "webhook_delivery.retry", schema: deliverySchema },
    input,
    (admin, data) => retryWebhookDelivery(admin, data),
  );
}

// ─── Imports ─────────────────────────────────────────────────────────────────

/** Puts the failed links of an import back in the queue (../_lib/operations.ts). */
export async function requeueImportAction(
  input: z.input<typeof importSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "import_job.requeue", schema: importSchema },
    input,
    (admin, data) => requeueImport(admin, data),
  );
}

/** Stops a stuck import; links already created stay. */
export async function cancelImportAction(
  input: z.input<typeof importSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "import_job.cancel", schema: importSchema },
    input,
    (admin, data) => cancelImport(admin, data),
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

/**
 * Same as the user's own Disconnect: revoke the token where the provider
 * allows it (best effort), clean up what the connection added, delete it.
 */
export async function disconnectIntegrationAction(
  input: z.input<typeof integrationSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "integration.disconnect", schema: integrationSchema },
    input,
    (admin, data) => disconnectIntegration(admin, data),
  );
}

// ─── OAuth apps ──────────────────────────────────────────────────────────────

async function findApp(appId: string) {
  const [app] = await db
    .select({
      id: oauthApp.id,
      name: oauthApp.name,
      clientId: oauthApp.clientId,
      verified: oauthApp.verified,
      isActive: oauthApp.isActive,
      ownerUserId: oauthApp.ownerUserId,
    })
    .from(oauthApp)
    .where(eq(oauthApp.id, appId))
    .limit(1);
  if (!app) throw adminError("App not found", 404);
  return app;
}

const appAudit = (
  app: Awaited<ReturnType<typeof findApp>>,
  action: string,
) => ({
  audit: {
    action,
    targetType: "oauth_app",
    targetId: app.id,
    subjectUserId: app.ownerUserId,
    metadata: { name: app.name, clientId: app.clientId },
  },
});

const verifySchema = z.object({
  appId: adminId,
  verified: z.boolean(),
  reason: requiredReason,
});

/** The consent screen stops (or starts) showing the "unverified" note. */
export async function setOAuthAppVerifiedAction(
  input: z.input<typeof verifySchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "oauth_app.set_verified", schema: verifySchema },
    input,
    async (_admin, { appId, verified }) => {
      const app = await findApp(appId);
      if (!app.ownerUserId) {
        throw adminError("First-party apps are always trusted.");
      }
      if (app.verified === verified) return null;
      await db
        .update(oauthApp)
        .set({ verified, updatedAt: new Date() })
        .where(eq(oauthApp.id, appId));
      return appAudit(
        app,
        verified ? "oauth_app.verify" : "oauth_app.unverify",
      );
    },
  );
}

const suspendSchema = z.object({
  appId: adminId,
  suspended: z.boolean(),
  reason: requiredReason,
});

/**
 * Suspending turns the app off (no new authorizations; its tokens stop
 * working) and the owner can't turn it back on: setOAuthAppActive checks the
 * latest suspend / unsuspend entry in the audit log.
 */
export async function setOAuthAppSuspendedAction(
  input: z.input<typeof suspendSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "oauth_app.set_suspended", schema: suspendSchema },
    input,
    async (_admin, { appId, suspended }) => {
      const app = await findApp(appId);
      await db
        .update(oauthApp)
        .set({ isActive: !suspended, updatedAt: new Date() })
        .where(eq(oauthApp.id, appId));
      return appAudit(
        app,
        suspended ? "oauth_app.suspend" : "oauth_app.unsuspend",
      );
    },
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/**
 * Sends a pending invitation's email again, with a fresh 48 hours when it
 * has expired or is about to. Outside production no email is sent; the
 * invite link (/invite/<id>) works either way.
 */
export async function resendInvitationAction(
  input: z.input<typeof invitationSchema>,
): Promise<AdminActionResult<{ emailed: boolean; expiresAt: string }>> {
  return runAdminAction(
    { action: "invitation.resend", schema: invitationSchema },
    input,
    (admin, data) => resendTeamInvitation(admin, data),
  );
}

// ─── Delete account ──────────────────────────────────────────────────────────

/**
 * Deletes the account with the same plan as the user's own deletion
 * (lib/account): team content goes to a remaining member, teams with nobody
 * else go, files and domains are cleaned up. Support-specific rules: never
 * yourself or another admin, the email must be typed back, and a paying
 * user's subscription must be cancelled in Polar first (billing is changed
 * there, never here).
 */
export async function deleteUserAccountAction(
  input: z.input<typeof deleteSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.delete", schema: deleteSchema, limit: "sensitive" },
    input,
    async (admin, data) =>
      deleteUserAccount(admin, data, { requestHeaders: await headers() }),
  );
}
