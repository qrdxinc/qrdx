import "server-only";

import { hasAdminRole, isAdmin } from "@repo/auth/admin";
import { twoFactorResetDueAt } from "@repo/auth/two-factor-reset";
import {
  abuseReport,
  account,
  database as db,
  integration,
  invitation,
  member,
  organization,
  session,
  user,
  webhookDelivery,
  webhookEndpoint,
} from "@repo/database";
import { and, count, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { scheduleWorkspaceAuditCleanup } from "@/ee/audit-log/retention";
import { isSameEmail } from "@/lib/account/email-change";
import { afterEmailChanged } from "@/lib/account/email-change-server";
import {
  resetNoticeDelivered,
  resetNoticeRefusal,
} from "@/lib/account/two-factor-notice";
import {
  cancelTwoFactorReset,
  loadPendingTwoFactorReset,
  notifyTwoFactorResetScheduled,
  scheduleTwoFactorReset,
} from "@/lib/account/two-factor-reset-server";
import { COMMUNITY_TAG } from "@/lib/community/tables";
import { revokeStoredToken } from "@/lib/connected-accounts/server";
import { cleanupDataConnection } from "@/lib/data-connections/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { isEmailConfigured } from "@/lib/email/send";
import { claimDueDeliveries, processClaimed } from "@/lib/events/deliveries";
import { setFileBlocked } from "@/lib/files/admin";
import { importJobSchema, jobStoreSchema } from "@/lib/migrate/jobs";
import { JOB_STORE_PROVIDER } from "@/lib/migrate/server/repo";
import type { ImportJob } from "@/lib/migrate/types";
import {
  type AdminActionOutcome,
  type AdminActor,
  adminError,
} from "./action-runner";
import {
  cancelImportJob,
  canUnlinkSignInMethod,
  confirmsEmail,
  isStuckImport,
  requeueImportJob,
  resentInvitationExpiry,
  signInMethodLabel,
} from "./rules";

// The work behind the admin actions that the back-office console also runs,
// through this app (app/api/internal/console): the same checks in the same
// order, the same side effects, and the same audit record for the runner to
// write. The admin pages' server actions (../actions.ts,
// ../users/support-actions.ts, ../abuse/actions.ts) wrap these in
// runAdminAction; the console's endpoints wrap them in consoleInternalRoute
// (lib/console-internal/route.ts). Neither writes the audit entry here.

/** The caller's check for an admin's own second factor (strong-admin). */
export interface StrongCheck {
  requireStrong: () => Promise<void>;
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** The target of a ban, unban, role change or sign-out. */
export async function findAdminTarget(userId: string) {
  const [found] = await db
    .select({
      id: user.id,
      email: user.email,
      // isAdmin counts ADMIN_EMAILS for verified addresses only.
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!found) throw adminError("User not found", 404);
  return found;
}

export const userAudit = (
  target: { id: string; email: string },
  metadata: Record<string, unknown> = {},
) => ({
  audit: {
    targetType: "user",
    targetId: target.id,
    subjectUserId: target.id,
    metadata: { targetEmail: target.email, ...metadata },
  },
});

/** Community lists are cached; a ban or unban shows at once. */
export function refreshCommunity() {
  revalidateTag("community-themes", "max");
  revalidateTag("community-tag-counts", "max");
}

/** Every community cache: after a theme or item is taken down. */
export function refreshCommunityAll() {
  revalidateTag("community-themes", "max");
  revalidateTag("community-tag-counts", "max");
  revalidateTag(COMMUNITY_TAG, "max");
}

async function findSupportTarget(userId: string) {
  const [found] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!found) throw adminError("User not found", 404);
  return found;
}

/**
 * For people who can't receive the code but proved ownership another way.
 * A verified address on ADMIN_EMAILS (or an account with the admin role or
 * on ADMIN_USER_IDS) is an admin, so when verifying would make this account
 * one, it takes the admin's strong confirmation, as granting the role does.
 */
export async function markEmailVerified(
  _admin: AdminActor,
  { userId }: { userId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined> | null> {
  const target = await findSupportTarget(userId);
  if (target.emailVerified) return null;
  if (isAdmin({ ...target, emailVerified: true })) await requireStrong();
  await db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: { targetEmail: target.email },
    },
  };
}

/**
 * Starts support's 7-day turn-off of two-step verification (see
 * ../users/support-actions.ts resetTwoFactorAction for the whole policy):
 * never an admin's account or the admin's own; the notice goes out first and
 * nothing is scheduled unless it did; strong confirmation required.
 */
export async function startTwoFactorReset(
  admin: AdminActor,
  { userId }: { userId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<{ dueAt: string }>> {
  if (userId === admin.id) {
    throw adminError(
      "You can't do this for your own account. Use Settings → Profile & security.",
    );
  }
  const [target] = await db
    .select({
      id: user.id,
      email: user.email,
      // isAdmin also counts ADMIN_EMAILS, for verified addresses only.
      emailVerified: user.emailVerified,
      on: user.twoFactorEnabled,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) throw adminError("User not found", 404);
  if (isAdmin(target)) {
    throw adminError(
      "An admin's two-step verification can't be turned off here.",
    );
  }
  if (!target.on) throw adminError("Two-step verification is already off.");
  if (await loadPendingTwoFactorReset(userId)) {
    throw adminError("A reset is already waiting for this account.");
  }
  await requireStrong();
  // The notice first, with the day the reset will have; the reset only
  // if it went out. (Should saving it then fail, the address was told
  // about a reset that isn't waiting: the admin sees the error, and the
  // day passes with nothing changed.)
  const now = new Date();
  const notice = await notifyTwoFactorResetScheduled(target.email, {
    dueAt: twoFactorResetDueAt(now),
  });
  if (
    !resetNoticeDelivered(notice, {
      nodeEnv: process.env.NODE_ENV,
      disposableDb: process.env.QRDX_DISPOSABLE_DB,
    })
  ) {
    throw adminError(
      resetNoticeRefusal(notice, {
        canSendEmail: isOutboundDeliveryAllowed() && isEmailConfigured,
      }),
    );
  }
  const pending = await scheduleTwoFactorReset({ userId, admin, now });
  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: {
        targetEmail: target.email,
        dueAt: pending.dueAt.toISOString(),
      },
    },
    data: { dueAt: pending.dueAt.toISOString() },
  };
}

/** Stops a pending reset; the address is told. Strong confirmation required. */
export async function cancelPendingTwoFactorReset(
  _admin: AdminActor,
  { userId }: { userId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  const target = await findSupportTarget(userId);
  if (!(await loadPendingTwoFactorReset(userId))) {
    throw adminError("No reset is waiting for this account.");
  }
  await requireStrong();
  const cancelled = await cancelTwoFactorReset(
    { id: userId, email: target.email },
    "support",
  );
  if (!cancelled) throw adminError("No reset is waiting for this account.");
  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: { targetEmail: target.email, by: "support" },
    },
  };
}

/**
 * Moves an account to a new address (the lost-email policy, see
 * ../users/support-actions.ts changeEmailAction): marked verified, every
 * session signed out, the old address told. Never an admin's account, the
 * admin's own, or onto an address that would make the account an admin;
 * strong confirmation required.
 */
export async function changeAccountEmail(
  admin: AdminActor,
  { userId, newEmail }: { userId: string; newEmail: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  if (userId === admin.id) {
    throw adminError(
      "You can't move your own account here. Use Settings → Profile & security.",
    );
  }
  const [target] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) throw adminError("User not found", 404);
  if (isAdmin(target)) {
    throw adminError("An admin's account can't be moved here.");
  }
  // The new address is marked verified, so one on ADMIN_EMAILS would make
  // the account an admin with only a change_email entry to show for it.
  // That takes the admin role, granted on its own.
  if (isAdmin({ ...target, email: newEmail, emailVerified: true })) {
    throw adminError(
      "That address is on the admin list, so the account would become an admin. Grant the admin role instead.",
    );
  }
  await requireStrong();
  if (isSameEmail(target.email, newEmail)) {
    throw adminError("That's already this account's email.");
  }
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${newEmail}`)
    .limit(1);
  if (taken) {
    throw adminError("That email already belongs to another QRdx account.");
  }
  await db.batch([
    db
      .update(user)
      .set({ email: newEmail, emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, userId)),
    db.delete(session).where(eq(session.userId, userId)),
  ]);
  after(() =>
    afterEmailChanged({
      userId,
      previousEmail: target.email,
      newEmail,
      bySupport: true,
    }),
  );
  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: { targetEmail: target.email, newEmail },
    },
  };
}

/**
 * Removes a linked GitHub / Google sign-in; never the user's last one. For
 * an admin it takes the acting admin's strong confirmation: a stolen admin
 * cookie alone mustn't take away another admin's way in.
 */
export async function unlinkSignInMethod(
  _admin: AdminActor,
  { userId, accountId }: { userId: string; accountId: string },
  { requireStrong }: StrongCheck,
): Promise<AdminActionOutcome<undefined>> {
  const target = await findSupportTarget(userId);
  const accounts = await db
    .select({ id: account.id, providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  const check = canUnlinkSignInMethod(accounts, accountId);
  if (!check.ok) throw adminError(check.error);
  if (isAdmin(target)) await requireStrong();
  const removed = accounts.find((row) => row.id === accountId);

  await db
    .delete(account)
    .where(and(eq(account.id, accountId), eq(account.userId, userId)));
  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: {
        targetEmail: target.email,
        provider: removed?.providerId ?? null,
        providerLabel: removed ? signInMethodLabel(removed.providerId) : null,
      },
    },
  };
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Sends a failed (or stuck pending) delivery once more through the normal
 * worker, which still applies the endpoint's state and plan checks. Outside
 * production nothing leaves the server (lib/delivery-guard).
 */
export async function retryWebhookDelivery(
  _admin: AdminActor,
  { deliveryId }: { deliveryId: string },
): Promise<AdminActionOutcome<{ status: string; error: string | null }>> {
  const [row] = await db
    .select({
      status: webhookDelivery.status,
      event: webhookDelivery.event,
      endpointId: webhookDelivery.endpointId,
      ownerId: webhookEndpoint.userId,
      url: webhookEndpoint.url,
    })
    .from(webhookDelivery)
    .innerJoin(
      webhookEndpoint,
      eq(webhookEndpoint.id, webhookDelivery.endpointId),
    )
    .where(eq(webhookDelivery.id, deliveryId))
    .limit(1);
  if (!row) throw adminError("Delivery not found", 404);
  if (row.status === "succeeded") {
    throw adminError("This delivery already succeeded");
  }

  // Due now (database clock), then claimed and sent like any retry.
  await db
    .update(webhookDelivery)
    .set({ status: "pending", nextAttemptAt: sql`now()` })
    .where(eq(webhookDelivery.id, deliveryId));
  const claimed = await claimDueDeliveries({ limit: 1, ids: [deliveryId] });
  await processClaimed(claimed);
  const [after] = await db
    .select({
      status: webhookDelivery.status,
      lastError: webhookDelivery.lastError,
    })
    .from(webhookDelivery)
    .where(eq(webhookDelivery.id, deliveryId))
    .limit(1);

  return {
    audit: {
      targetType: "webhook_delivery",
      targetId: deliveryId,
      subjectUserId: row.ownerId,
      metadata: {
        event: row.event,
        endpointId: row.endpointId,
        from: row.status,
        to: after?.status ?? null,
      },
    },
    data: {
      status: after?.status ?? "pending",
      error: after?.lastError ?? null,
    },
  };
}

// ─── Integrations ────────────────────────────────────────────────────────────

/**
 * Same as the user's own Disconnect: revoke the token where the provider
 * allows it (best effort), clean up what the connection added, delete it.
 */
export async function disconnectIntegration(
  _admin: AdminActor,
  { integrationId }: { integrationId: string },
): Promise<AdminActionOutcome<undefined>> {
  const [row] = await db
    .select({
      id: integration.id,
      userId: integration.userId,
      provider: integration.provider,
      status: integration.status,
    })
    .from(integration)
    .where(eq(integration.id, integrationId))
    .limit(1);
  if (!row) throw adminError("Integration not found", 404);
  if (row.provider === JOB_STORE_PROVIDER) {
    throw adminError("That row holds the user's import history.");
  }

  const revoked = await revokeStoredToken(row.userId, row.provider);
  await cleanupDataConnection(row.userId, row.provider).catch(
    (error: unknown) => {
      console.error(
        JSON.stringify({
          event: "admin.integration_cleanup_failed",
          provider: row.provider,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    },
  );
  await db.delete(integration).where(eq(integration.id, row.id));
  return {
    audit: {
      targetType: "integration",
      targetId: row.id,
      subjectUserId: row.userId,
      metadata: {
        provider: row.provider,
        status: row.status,
        tokenRevoked: revoked,
      },
    },
  };
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/**
 * Sends a pending invitation's email again, with a fresh 48 hours when it
 * has expired or is about to. Outside production no email is sent; the
 * invite link (/invite/<id>) works either way.
 */
export async function resendTeamInvitation(
  _admin: AdminActor,
  { invitationId }: { invitationId: string },
): Promise<AdminActionOutcome<{ emailed: boolean; expiresAt: string }>> {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      inviterId: invitation.inviterId,
      teamName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row) throw adminError("Invitation not found", 404);
  if (row.status !== "pending") {
    throw adminError(`This invitation is ${row.status}.`);
  }

  const expiresAt = resentInvitationExpiry(row.expiresAt, new Date());
  if (expiresAt.getTime() !== row.expiresAt.getTime()) {
    await db
      .update(invitation)
      .set({ expiresAt })
      .where(eq(invitation.id, invitationId));
  }
  const { sendTeamInviteEmail } = await import("@/lib/events/emails");
  const emailed = await sendTeamInviteEmail({
    id: row.id,
    email: row.email,
    role: row.role ?? "member",
    expiresAt,
    organizationId: row.organizationId,
    inviterId: row.inviterId,
  });
  return {
    audit: {
      targetType: "invitation",
      targetId: row.id,
      subjectUserId: row.inviterId,
      metadata: {
        targetEmail: row.email,
        organizationId: row.organizationId,
        teamName: row.teamName,
        emailed,
        expiresAt: expiresAt.toISOString(),
      },
    },
    data: { emailed, expiresAt: expiresAt.toISOString() },
  };
}

// ─── Delete account ──────────────────────────────────────────────────────────

/**
 * Deletes the account with the same plan as the user's own deletion
 * (lib/account): see ../users/support-actions.ts deleteUserAccountAction.
 * Never yourself or another admin, the email typed back, and a paying user's
 * subscription cancelled in Polar first. `requestHeaders` go to the
 * organization plugin's calls, which need a member's session: an admin's
 * (or none, from the console) isn't one, so empty teams are deleted here
 * afterwards.
 */
export async function deleteUserAccount(
  admin: AdminActor,
  { userId, confirmation }: { userId: string; confirmation: string },
  { requestHeaders }: { requestHeaders: Headers },
): Promise<AdminActionOutcome<undefined>> {
  if (userId === admin.id) {
    throw adminError("Delete your own account from Settings → Account.");
  }
  const [target] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) throw adminError("User not found", 404);
  if (!confirmsEmail(confirmation, target.email)) {
    throw adminError("Type the user's email exactly to confirm.");
  }
  // The role, or ADMIN_EMAILS / ADMIN_USER_IDS: never an admin's account.
  if (hasAdminRole(target.role)) {
    throw adminError("Remove their admin role first.");
  }
  if (isAdmin(target)) {
    throw adminError(
      "They're an admin through ADMIN_EMAILS or ADMIN_USER_IDS. Take them off the list first.",
    );
  }

  const { AccountDeletionError, executeAccountDeletion, loadDeletionFacts } =
    await import("@/lib/account/deletion-server");
  const { planAccountDeletion } = await import("@/lib/account/deletion");

  let plan = planAccountDeletion(await loadDeletionFacts(userId));
  if (plan.subscription) {
    throw adminError(
      `They have an active ${plan.subscription.planName} subscription. Cancel it in Polar first, then delete the account.`,
    );
  }
  if (plan.blockers.length > 0) throw adminError(plan.blockers[0]);

  // The plan promotes through the organization plugin as the account
  // owner; an admin isn't a member, so promote directly, then re-plan.
  const promoted = plan.teams.flatMap((team) =>
    team.action === "hand-over" && team.promote
      ? [{ organizationId: team.organizationId, ...team.successor }]
      : [],
  );
  for (const team of promoted) {
    await db
      .update(member)
      .set({ role: "owner" })
      .where(eq(member.id, team.memberId));
  }
  if (promoted.length > 0) {
    plan = planAccountDeletion(await loadDeletionFacts(userId));
  }
  const emptyTeams = plan.teams.flatMap((team) =>
    team.action === "delete-team" ? [team.organizationId] : [],
  );

  try {
    await executeAccountDeletion({ userId, plan, requestHeaders });
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      throw adminError(`Deletion stopped: ${error.message}`);
    }
    throw error;
  }

  // Teams only they were in (the plugin call above needs a member's
  // session): delete those left without members.
  for (const organizationId of emptyTeams) {
    const [left] = await db
      .select({ total: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId));
    if ((left?.total ?? 0) === 0) {
      await db.delete(organization).where(eq(organization.id, organizationId));
      scheduleWorkspaceAuditCleanup(organizationId);
    }
  }

  return {
    audit: {
      targetType: "user",
      targetId: userId,
      subjectUserId: userId,
      metadata: {
        targetEmail: target.email,
        handedOver: plan.teams
          .filter((team) => team.action === "hand-over")
          .map((team) => team.organizationId),
        promoted: promoted.map((team) => ({
          organizationId: team.organizationId,
          userId: team.userId,
        })),
        deletedTeams: emptyTeams,
        personal: plan.personal,
      },
    },
  };
}

// ─── Abuse ───────────────────────────────────────────────────────────────────

export async function findAbuseReport(reportId: string) {
  const [report] = await db
    .select()
    .from(abuseReport)
    .where(eq(abuseReport.id, reportId))
    .limit(1);
  if (!report) throw adminError("Report not found", 404);
  return report;
}

/**
 * Blocks a file named by the report (takedown); the report is actioned.
 * setFileBlocked writes its own "file.block" audit entry; this one records
 * the report it came from.
 */
export async function blockReportedFile(
  admin: AdminActor,
  {
    reportId,
    fileId,
    reason,
  }: { reportId: string; fileId: string; reason?: string },
): Promise<AdminActionOutcome<undefined>> {
  await findAbuseReport(reportId);
  await setFileBlocked(admin, fileId, true, {
    reason: reason || `Abuse report ${reportId}`,
  });
  await db
    .update(abuseReport)
    .set({ status: "actioned" })
    .where(eq(abuseReport.id, reportId));
  return {
    audit: {
      targetType: "abuse_report",
      targetId: reportId,
      metadata: { fileId },
    },
  };
}

// ─── Imports ─────────────────────────────────────────────────────────────────

/**
 * Rewrites one job in the user's import store, keeping every other entry
 * exactly as stored (even ones this version can't read).
 */
async function updateImportJob(
  userId: string,
  jobId: string,
  change: (job: ImportJob) => ImportJob,
): Promise<{ before: ImportJob; after: ImportJob }> {
  const [row] = await db
    .select({ id: integration.id, metadata: integration.metadata })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .limit(1);
  const store = jobStoreSchema.safeParse(row?.metadata);
  if (!(row && store.success)) throw adminError("Import not found", 404);

  const index = store.data.jobs.findIndex(
    (entry) => (entry as { id?: unknown })?.id === jobId,
  );
  const parsed = importJobSchema.safeParse(store.data.jobs[index]);
  if (index === -1 || !parsed.success) {
    throw adminError("Import not found", 404);
  }
  const before = parsed.data;
  const after = change(before);
  const jobs = [...store.data.jobs];
  jobs[index] = after;
  await db
    .update(integration)
    .set({ metadata: { ...store.data, jobs }, updatedAt: new Date() })
    .where(eq(integration.id, row.id));
  return { before, after };
}

const importAudit = (
  userId: string,
  jobId: string,
  before: ImportJob,
  after: ImportJob,
) => ({
  audit: {
    targetType: "import_job",
    targetId: jobId,
    subjectUserId: userId,
    metadata: {
      provider: before.provider,
      fromStatus: before.status,
      toStatus: after.status,
      failedBefore: before.items.filter((item) => item.status === "failed")
        .length,
      pendingAfter: after.items.filter((item) => item.status === "pending")
        .length,
    },
  },
});

/**
 * Puts the failed links of an import back in the queue. The import itself
 * runs from the user's browser (it needs their provider connection), so the
 * user's import dialog resumes it next time they open it.
 */
export async function requeueImport(
  _admin: AdminActor,
  { userId, jobId }: { userId: string; jobId: string },
): Promise<AdminActionOutcome<undefined>> {
  const now = new Date();
  const { before, after } = await updateImportJob(userId, jobId, (job) => {
    const failed = job.items.some((item) => item.status === "failed");
    if (job.status === "running" && !isStuckImport(job, now)) {
      throw adminError("This import is still running. Wait for it.");
    }
    if (!(failed || job.status === "running")) {
      throw adminError("Nothing to re-run: no links failed.");
    }
    return requeueImportJob(job, now);
  });
  return importAudit(userId, jobId, before, after);
}

/** Stops a stuck import; links already created stay. */
export async function cancelImport(
  _admin: AdminActor,
  { userId, jobId }: { userId: string; jobId: string },
): Promise<AdminActionOutcome<undefined>> {
  const { before, after } = await updateImportJob(userId, jobId, (job) => {
    if (job.status !== "running") {
      throw adminError("This import already finished.");
    }
    return cancelImportJob(job, new Date());
  });
  return importAudit(userId, jobId, before, after);
}
