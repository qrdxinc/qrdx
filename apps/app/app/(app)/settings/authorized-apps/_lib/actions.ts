"use server";

import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import { revokeAuthorizedApp } from "@/lib/oauth-apps/authorized";
import { enforceRateLimits } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

export type RevokeAppResult =
  | { ok: true; revoked: number }
  | { ok: false; error: string };

const revokeLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const inputSchema = z.object({ appId: z.string().trim().min(1).max(64) });

/**
 * Settings → Authorized apps → Revoke access, for the signed-in user only.
 * Refusals are in the person's language (settingsActions.authorizedApps).
 */
export async function revokeAuthorizedAppAction(
  input: unknown,
): Promise<RevokeAppResult> {
  const text = settingsActionText("settingsActions.authorizedApps");
  const parsed = inputSchema.safeParse(input);
  // An id the list never shows (a tampered request): English, as it was.
  if (!parsed.success) return { ok: false, error: "Invalid app." };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: (await text())("signedOut") };

    await enforceRateLimits([
      { limiter: revokeLimiter, key: `authorized-apps:revoke:${userId}` },
    ]);
    const revoked = await revokeAuthorizedApp(userId, parsed.data.appId);
    revalidatePath("/settings/authorized-apps");
    return { ok: true, revoked };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        error:
          error.code === "RATE_LIMITED"
            ? (await text())("rateLimited")
            : error.message,
      };
    }
    logError(error as Error, { action: "authorized-apps.revoke" });
    return { ok: false, error: (await text())("failed") };
  }
}
