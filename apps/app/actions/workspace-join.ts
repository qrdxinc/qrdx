"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auditJoinLink, auditJoinLinkRole } from "@/ee/audit-log/team-events";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { HttpError } from "@/lib/error-response";
import {
  forbiddenText,
  type WorkspaceActionMessage,
  workspaceActionsText,
  workspaceActionText,
  workspaceErrorText,
} from "@/lib/i18n/workspace-actions";
import {
  canAssignRole,
  JOINABLE_ROLES,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/permissions";
import { getClientIp } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { getCurrentUser, logError } from "@/lib/shared";
import {
  deleteJoinLink,
  getJoinLink,
  issueJoinLink,
  type JoinOutcome,
  joinLinkPath,
  joinWithLink,
  setJoinLinkRole,
} from "@/lib/workspace-join";
import { UnauthorizedError } from "@/types/errors";

// Join links: owners and admins turn the open workspace's link on, reset it,
// change its role or turn it off (Settings → Team); anyone signed in joins
// with one at /join/<token>. lib/workspace-join.ts holds the rules.
//
// A link that adds people as admins is an admin invitation anyone holding it
// can use, so making one (or giving an existing link that role) needs a
// recent "Confirm it's you", like inviting an admin by email
// (actions/organizations.ts). Turning a link off never asks.
//
// Errors are in the person's language (workspaceActions.joinLinks in
// messages/en.json, lib/i18n/workspace-actions.ts); `code` stays as it is.

export type JoinActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

const manageLimiter = createRateLimiter({
  limiter: slidingWindow(20, "10 m"),
});
// Joining is per person and per address: a token can't be guessed (32
// random bytes), and this keeps anyone from hammering the lookup.
const joinUserLimiter = createRateLimiter({
  limiter: slidingWindow(10, "10 m"),
});
const joinIpLimiter = createRateLimiter({
  limiter: slidingWindow(30, "10 m"),
});

const RATE_LIMITED: WorkspaceActionMessage = (t) => t("joinLinks.rateLimited");
const PICK_ROLE: WorkspaceActionMessage = (t) => t("joinLinks.pickRole");

const roleSchema = z.enum(
  JOINABLE_ROLES as [WorkspaceRole, ...WorkspaceRole[]],
);
const tokenSchema = z.string().trim().min(1).max(64);

function fail(code: string, error: string): JoinActionResult<never> {
  return { ok: false, code, error };
}

/** A refusal with `code`, saying `message` in the person's language. */
async function refuse(
  code: string,
  message: WorkspaceActionMessage,
): Promise<JoinActionResult<never>> {
  return fail(code, await workspaceActionText(message));
}

async function failure(
  error: unknown,
  action: string,
): Promise<JoinActionResult<never>> {
  if (error instanceof UnauthorizedError) {
    return refuse("UNAUTHORIZED", (t) => t("joinLinks.signIn"));
  }
  if (error instanceof HttpError) {
    const text = workspaceErrorText(await workspaceActionsText(), error);
    return fail(error.code, text ?? error.message);
  }
  logError(error as Error, { action });
  return refuse("UNKNOWN_ERROR", (t) => t("joinLinks.somethingWrong"));
}

/**
 * The open workspace, when the caller may give `role` through a link, else
 * the refusal to answer with.
 */
async function managedScope(
  role: WorkspaceRole | null,
): Promise<ActiveScope | JoinActionResult<never>> {
  const scope = await getActiveScope();
  const allowed = role
    ? canAssignRole(scope.role, null, role)
    : canAssignRole(scope.role, null, "member");
  if (!allowed) {
    return refuse("FORBIDDEN", (t) =>
      role === "billing"
        ? t("joinLinks.billingLinkOwnersOnly", {
            billing: WORKSPACE_ROLE_LABELS.billing,
          })
        : forbiddenText(t, scope.role, "members.manage"),
    );
  }
  const { success } = await manageLimiter.limit(`join-link:${scope.userId}`);
  if (!success) return refuse("RATE_LIMITED", RATE_LIMITED);
  return scope;
}

/** True when managedScope refused. */
const refused = (
  scope: ActiveScope | JoinActionResult<never>,
): scope is JoinActionResult<never> => "ok" in scope;

function revalidateTeam() {
  revalidatePath("/dashboard", "layout");
}

/**
 * Null when a link with `role` may be made now, else the CONFIRMATION_REQUIRED
 * result (the client opens "Confirm it's you" and tries again).
 */
async function confirmationForRole(
  scope: { userId: string },
  role: WorkspaceRole,
): Promise<JoinActionResult<never> | null> {
  if (role !== "admin" && role !== "owner") return null;
  return (await confirmationNeededFor(scope))
    ? fail(CONFIRMATION_REQUIRED, CONFIRMATION_REQUIRED)
    : null;
}

/**
 * Turns the link on, or resets it (a new token: the old link stops
 * working). Returns the path, shown once; only its hash is kept.
 */
export async function issueWorkspaceJoinLink(input: {
  role?: WorkspaceRole;
}): Promise<JoinActionResult<{ path: string; role: WorkspaceRole }>> {
  try {
    const requested = roleSchema.safeParse(input?.role ?? "member");
    if (!requested.success) return refuse("VALIDATION_ERROR", PICK_ROLE);
    const scope = await managedScope(requested.data);
    if (refused(scope)) return scope;
    // A reset keeps the role it had unless another is asked for.
    const current = input?.role
      ? null
      : await getJoinLink(scope.organizationId);
    const role = input?.role ?? current?.role ?? "member";
    if (!canAssignRole(scope.role, null, role)) {
      return refuse("FORBIDDEN", (t) =>
        t("joinLinks.resetOwnersOnly", { role: WORKSPACE_ROLE_LABELS[role] }),
      );
    }
    const needed = await confirmationForRole(scope, role);
    if (needed) return needed;
    const { token } = await issueJoinLink({
      organizationId: scope.organizationId,
      role,
      createdBy: scope.userId,
    });
    auditJoinLink(scope, "join_link.created", role);
    revalidateTeam();
    return { ok: true, data: { path: joinLinkPath(token), role } };
  } catch (error) {
    return failure(error, "issueWorkspaceJoinLink");
  }
}

export async function setWorkspaceJoinLinkRole(input: {
  role: WorkspaceRole;
}): Promise<JoinActionResult> {
  try {
    const parsed = roleSchema.safeParse(input?.role);
    if (!parsed.success) return refuse("VALIDATION_ERROR", PICK_ROLE);
    const scope = await managedScope(parsed.data);
    if (refused(scope)) return scope;
    const current = await getJoinLink(scope.organizationId);
    if (!current) return refuse("NOT_FOUND", (t) => t("joinLinks.linkOff"));
    if (!canAssignRole(scope.role, null, current.role)) {
      return refuse("FORBIDDEN", (t) =>
        t("joinLinks.changeOwnersOnly", {
          role: WORKSPACE_ROLE_LABELS[current.role],
        }),
      );
    }
    const needed = await confirmationForRole(scope, parsed.data);
    if (needed) return needed;
    await setJoinLinkRole(scope.organizationId, parsed.data);
    auditJoinLinkRole(scope, current.role, parsed.data);
    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "setWorkspaceJoinLinkRole");
  }
}

/** Turns the link off: it stops working at once and can't come back. */
export async function disableWorkspaceJoinLink(): Promise<JoinActionResult> {
  try {
    const scope = await managedScope(null);
    if (refused(scope)) return scope;
    await deleteJoinLink(scope.organizationId);
    auditJoinLink(scope, "join_link.disabled");
    revalidateTeam();
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "disableWorkspaceJoinLink");
  }
}

/** /join/<token>: the signed-in person joins with the link's role. */
export async function joinWorkspaceWithLink(input: {
  token: string;
}): Promise<JoinActionResult<JoinOutcome>> {
  try {
    const parsed = tokenSchema.safeParse(input?.token);
    if (!parsed.success) {
      return refuse("JOIN_LINK_INVALID", (t) => t("joinLinks.incomplete"));
    }
    const user = await getCurrentUser();
    const ip = getClientIp({ headers: await headers() });
    const [byUser, byIp] = await Promise.all([
      joinUserLimiter.limit(`join:user:${user.id}`),
      joinIpLimiter.limit(`join:ip:${ip}`),
    ]);
    if (!(byUser.success && byIp.success)) {
      return refuse("RATE_LIMITED", RATE_LIMITED);
    }
    const outcome = await joinWithLink(
      { id: user.id, email: user.email },
      parsed.data,
    );
    if (outcome.status === "joined") revalidateTeam();
    return { ok: true, data: outcome };
  } catch (error) {
    return failure(error, "joinWorkspaceWithLink");
  }
}
