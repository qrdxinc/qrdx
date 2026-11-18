"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { revokeWorkspaceSlackLink } from "@/lib/slack-bot/admin";
import { SlackBotStoreUnavailableError } from "@/lib/slack-bot/store";
import { UnauthorizedError } from "@/types/errors";

// Settings → API keys & apps → Slack accounts: an owner or admin revokes a
// Slack account's link to the open workspace (lib/slack-bot/admin.ts, whose
// refusals are English). Its own are in the person's language
// (settingsActions.slackLinks).

const revokeLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:revoke",
  limiter: slidingWindow(30, "60 s"),
});

const idSchema = z.object({ id: z.string().trim().min(1).max(64) });

export async function revokeSlackLinkAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = settingsActionText("settingsActions.slackLinks");
  const parsed = idSchema.safeParse(input);
  // An id the list never shows (a tampered request): English, as it was.
  if (!parsed.success) return { ok: false, error: "Nothing to revoke." };
  try {
    // The open workspace, checked against the user's memberships.
    const scope = await getActiveScope();
    await enforceRateLimits([
      {
        limiter: revokeLimiter,
        key: `${scope.organizationId}:${scope.userId}`,
      },
    ]);
    await revokeWorkspaceSlackLink(scope, parsed.data.id);
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: (await text())("signedOut") };
    }
    if (error instanceof SlackBotStoreUnavailableError) {
      return { ok: false, error: (await text())("notAvailableYet") };
    }
    if (error instanceof HttpError) {
      return {
        ok: false,
        error:
          error.status === 429 ? (await text())("rateLimited") : error.message,
      };
    }
    logError(error as Error, { action: "slack-bot.revoke" });
    return { ok: false, error: (await text())("failed") };
  }
}
