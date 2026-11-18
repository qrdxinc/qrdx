"use server";

import { auth } from "@repo/auth/server";
import { twoFactorOnFor } from "@repo/auth/workspace-two-factor";
import {
  twoFactorRequiredIn,
  withTwoFactorRequired,
} from "@repo/auth/workspace-two-factor-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auditTwoFactorRequirement } from "@/ee/audit-log/security-events";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { HttpError } from "@/lib/error-response";
import {
  forbiddenText,
  type WorkspaceActionMessage,
  workspaceActionsText,
  workspaceActionText,
  workspaceErrorText,
} from "@/lib/i18n/workspace-actions";
import { can } from "@/lib/permissions";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import {
  requirementPlanName,
  workspaceMetadataOf,
} from "./two-factor-requirement";

// Settings → Team → "Require two-step verification" for the open workspace.
// Owners and admins only, on Business, and turning it on needs two-step
// verification on yourself (you'd shut yourself out otherwise). Either way it
// asks "Confirm it's you" once every other check has passed. Nobody is
// emailed: members are told when they next open the workspace.
//
// The setting lives in the workspace's metadata, written through Better
// Auth's API (which checks the role again). The same endpoint over HTTP
// can't change metadata (packages/auth/workspace-two-factor.ts).
//
// Errors are in the person's language (workspaceActions.twoFactorRequirement
// in messages/en.json, lib/i18n/workspace-actions.ts).

export type TwoFactorRequirementResult =
  | { ok: true; data: { required: boolean } }
  | { ok: false; error: string; upgrade?: boolean };

const limiter = createRateLimiter({
  prefix: "qrdx:require-two-factor",
  limiter: slidingWindow(20, "60 s"),
});

const inputSchema = z.object({ required: z.boolean() });

const fail = (error: string, upgrade?: boolean): TwoFactorRequirementResult =>
  upgrade ? { ok: false, error, upgrade } : { ok: false, error };

/** A refusal saying `message` in the person's language. */
const refuse = async (
  message: WorkspaceActionMessage,
  upgrade?: boolean,
): Promise<TwoFactorRequirementResult> =>
  fail(await workspaceActionText(message), upgrade);

export async function setTwoFactorRequirement(
  input: unknown,
): Promise<TwoFactorRequirementResult> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return refuse((t) => t("twoFactorRequirement.invalidRequest"));
    }
    const { required } = parsed.data;

    // The workspace in the page's URL; refused for someone it shuts out.
    const scope = await getActiveScope();
    if (!can(scope.role, "workspace.update")) {
      return refuse((t) => forbiddenText(t, scope.role, "workspace.update"));
    }
    const { success } = await limiter.limit(scope.userId);
    if (!success) {
      return refuse((t) => t("twoFactorRequirement.rateLimited"));
    }
    if (required) {
      const plan = await getOwnerPlanForOrganization(scope.organizationId);
      if (!getPlanLimits(plan).requireTwoFactor) {
        return refuse(
          (t) =>
            t("twoFactorRequirement.planRequired", {
              plan: requirementPlanName(),
            }),
          true,
        );
      }
      if (!(await twoFactorOnFor(scope.userId))) {
        return refuse((t) => t("twoFactorRequirement.ownFirst"));
      }
    }
    const needed = await confirmationNeededFor(scope);
    if (needed) return needed;

    const metadata = await workspaceMetadataOf(scope.organizationId);
    await auth.api.updateOrganization({
      headers: await headers(),
      body: {
        organizationId: scope.organizationId,
        data: { metadata: withTwoFactorRequired(metadata, required) },
      },
    });
    auditTwoFactorRequirement(scope, twoFactorRequiredIn(metadata), required);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { required } };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return refuse((t) => t("twoFactorRequirement.signIn"));
    }
    if (error instanceof HttpError) {
      const t = await workspaceActionsText();
      return fail(workspaceErrorText(t, error) ?? error.message);
    }
    logError(error as Error, { action: "setTwoFactorRequirement" });
    return refuse((t) => t("twoFactorRequirement.somethingWrong"));
  }
}
