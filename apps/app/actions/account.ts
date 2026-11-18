"use server";

import { SUPPORT_EMAIL } from "@repo/config";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { confirmedSession } from "@/lib/account/confirmation-server";
import {
  DELETE_CONFIRMATION,
  type DeletionPlan,
  isDeleteConfirmed,
  planAccountDeletion,
} from "@/lib/account/deletion";
import {
  AccountDeletionError,
  type AccountDeletionProblem,
  executeAccountDeletion,
  loadDeletionFacts,
} from "@/lib/account/deletion-server";
import { describeDeletionPlan } from "@/lib/account/deletion-summary";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import type { Translator } from "@/lib/i18n/translator";
import { logError } from "@/lib/shared";

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

const deleteLimiter = createRateLimiter({
  prefix: "qrdx:account-delete",
  limiter: slidingWindow(5, "15 m"),
});

const inputSchema = z.object({ confirmation: z.string().max(64) });

const fail = (error: string): DeleteAccountResult => ({ ok: false, error });

/** The plan's blocker as the page says it (app.settings.account.deletion). */
async function blockerText(plan: DeletionPlan): Promise<string> {
  const t = await settingsActionText("app.settings.account.deletion")();
  return describeDeletionPlan(plan, t).blockers[0] ?? plan.blockers[0];
}

/** Why deletion stopped, in the person's language. */
async function problemText(
  problem: AccountDeletionProblem,
  plan: DeletionPlan | null,
  t: Translator<"settingsActions.deleteAccount">,
): Promise<string> {
  switch (problem.kind) {
    case "subscription":
      return t("subscriptionNotCancelled", { email: SUPPORT_EMAIL });
    case "owner":
      return t("ownerNotMade", { person: problem.person, team: problem.team });
    case "blocked":
      return plan ? await blockerText(plan) : t("failed");
  }
}

/**
 * Settings → Account → Delete account. Confirmed three ways: typing
 * "delete", the deletion plan the page showed (rebuilt here from current
 * data), and a recent "Confirm it's you" (lib/account/confirmation-server.ts:
 * a passkey, authenticator or backup code with two-step verification on,
 * else a code emailed to the account's address). Without the last it
 * answers CONFIRMATION_REQUIRED and the dialog asks, then tries again.
 * Refusals are in the person's language (settingsActions.deleteAccount);
 * the word to type stays "delete", as the dialog shows it.
 */
export async function deleteAccount(
  input: unknown,
): Promise<DeleteAccountResult> {
  const text = settingsActionText("settingsActions.deleteAccount");
  const parsed = inputSchema.safeParse(input);
  if (!(parsed.success && isDeleteConfirmed(parsed.data.confirmation))) {
    return fail((await text())("typeToConfirm", { word: DELETE_CONFIRMATION }));
  }

  let plan: DeletionPlan | null = null;
  try {
    const allowed = await confirmedSession(async () =>
      (await text())("signedOut"),
    );
    if (!allowed.ok) return allowed;
    const { userId, requestHeaders } = allowed.session;

    if (!(await deleteLimiter.limit(userId)).success) {
      return fail((await text())("rateLimited"));
    }

    plan = planAccountDeletion(await loadDeletionFacts(userId));
    if (plan.blockers.length > 0) return fail(await blockerText(plan));

    await executeAccountDeletion({ userId, plan, requestHeaders });
    return { ok: true };
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return fail(await problemText(error.problem, plan, await text()));
    }
    logError(error as Error, { action: "deleteAccount" });
    return fail((await text())("failed"));
  }
}
