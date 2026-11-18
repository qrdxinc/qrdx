"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  listMoveTargets,
  type MoveResult,
  type MoveTarget,
  moveCodeToWorkspace,
} from "@/app/(app)/dashboard/codes/_lib/move-workspace";
import { recordCodeMove } from "@/ee/audit-log/code-events";
import { HttpError } from "@/lib/error-response";
import {
  forbiddenText,
  type WorkspaceActionMessage,
  workspaceActionsText,
  workspaceActionText,
  workspaceErrorText,
} from "@/lib/i18n/workspace-actions";
import type { WorkspaceRole } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/permissions-server";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// "Move to workspace…" in the code row menu. The rules live in
// app/(app)/dashboard/codes/_lib/move-workspace.ts. Messages are in the
// person's language (workspaceActions.moveCode in messages/en.json,
// lib/i18n/workspace-actions.ts); `code` stays as it is.

export type MoveCodeResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const moveLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

const moveSchema = z.object({
  id: z.string().trim().min(1).max(64),
  organizationId: z.string().trim().min(1).max(128),
});

/** A refusal with `code`, saying `message` in the person's language. */
async function refuse(
  code: string,
  message: WorkspaceActionMessage,
): Promise<MoveCodeResult<never>> {
  return {
    success: false,
    error: { code, message: await workspaceActionText(message) },
  };
}

/** `role`: the open workspace's, which assertCan refused with. */
async function failure(
  error: unknown,
  action: string,
  role?: WorkspaceRole,
): Promise<MoveCodeResult<never>> {
  if (error instanceof UnauthorizedError) {
    return refuse("UNAUTHORIZED", (t) => t("moveCode.signIn"));
  }
  if (error instanceof HttpError) {
    const t = await workspaceActionsText();
    const message =
      error instanceof ForbiddenError &&
      role &&
      error.action === "content.write"
        ? forbiddenText(t, role, error.action)
        : (workspaceErrorText(t, error) ?? error.message);
    return { success: false, error: { code: error.code, message } };
  }
  logError(error as Error, { action });
  return refuse("UNKNOWN_ERROR", (t) => t("moveCode.somethingWrong"));
}

/** Where the open workspace's codes can go: workspaces you may add codes to. */
export async function listCodeMoveTargets(): Promise<
  MoveCodeResult<MoveTarget[]>
> {
  try {
    return {
      success: true,
      data: await listMoveTargets(await getActiveScope()),
    };
  } catch (error) {
    return failure(error, "listCodeMoveTargets");
  }
}

export async function moveQrCodeToWorkspace(input: {
  id: string;
  organizationId: string;
}): Promise<MoveCodeResult<MoveResult>> {
  let role: WorkspaceRole | undefined;
  try {
    const scope = await getActiveScope();
    role = scope.role;
    const parsed = moveSchema.safeParse(input);
    if (!parsed.success) {
      return refuse("VALIDATION_ERROR", (t) => t("moveCode.pickWorkspace"));
    }
    const { success } = await moveLimiter.limit(`move-code:${scope.userId}`);
    if (!success) {
      return refuse("RATE_LIMITED", (t) => t("moveCode.rateLimited"));
    }
    const result = await moveCodeToWorkspace(
      scope,
      parsed.data.id,
      parsed.data.organizationId,
    );
    recordCodeMove(scope, result.code, result.target);
    revalidatePath("/dashboard", "layout");
    return { success: true, data: result };
  } catch (error) {
    return failure(error, "moveQrCodeToWorkspace", role);
  }
}
