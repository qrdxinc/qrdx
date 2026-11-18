"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import {
  ApiKeysUnavailableError,
  type ApiKeyView,
  createApiKey,
  revokeApiKey,
} from "@/lib/api-keys/service";
import { apiKeyInputSchema } from "@/lib/api-keys/shared";
import { HttpError } from "@/lib/error-response";
import { settingsActionText } from "@/lib/i18n/settings-action-text";
import { can } from "@/lib/permissions";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Refusals of its own are in the person's language (settingsActions.apiKeys).
// The service's (lib/api-keys/service.ts: the key limit) and the form's
// checks (lib/api-keys/shared.ts, which the form runs first) are still
// English: both modules also serve the REST API.

export type ApiKeyActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});
// Keys are made rarely; a burst of them looks like abuse.
const createLimiter = createRateLimiter({ limiter: slidingWindow(10, "1 h") });

const idSchema = z.object({ id: z.string().trim().min(1).max(64) });

async function failure(
  error: unknown,
  action: string,
): Promise<ApiKeyActionResult<never>> {
  const text = settingsActionText("settingsActions.apiKeys");
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: (await text())("signedOut") };
  }
  if (error instanceof ApiKeysUnavailableError) {
    return { ok: false, error: (await text())("unavailable") };
  }
  if (error instanceof HttpError) {
    return {
      ok: false,
      error:
        error.code === "RATE_LIMITED"
          ? (await text())("rateLimited")
          : error.message,
    };
  }
  logError(error as Error, { action });
  return { ok: false, error: (await text())("failed") };
}

async function run<T>(
  action: string,
  limiters: (typeof mutationLimiter)[],
  body: (scope: ActiveScope) => Promise<T>,
  {
    confirmIf,
  }: {
    /** Asks "Confirm it's you" first when this says the person may do it */
    confirmIf?: (scope: ActiveScope) => boolean;
  } = {},
): Promise<ApiKeyActionResult<T>> {
  try {
    // The open workspace, checked against the user's memberships.
    const scope = await getActiveScope();
    // Before the limits, so the round trip that asks doesn't use one up.
    // Someone the action refuses anyway gets that refusal instead.
    if (confirmIf?.(scope)) {
      const needed = await confirmationNeededFor(scope);
      if (needed) return needed;
    }
    await enforceRateLimits(
      limiters.map((limiter, index) => ({
        limiter,
        key: `api-keys:${action}:${index}:${scope.userId}`,
      })),
    );
    return { ok: true, data: await body(scope) };
  } catch (error) {
    return await failure(error, `api-keys.${action}`);
  }
}

/**
 * Creates a key in the open workspace and returns it, the only time it is
 * ever shown. A key works without the person, so it needs a recent "Confirm
 * it's you" (CONFIRMATION_REQUIRED otherwise). No revalidation here: the page
 * refreshes once the person has closed the dialog that shows the key.
 */
export async function createApiKeyAction(
  input: unknown,
): Promise<ApiKeyActionResult<{ key: string; apiKey: ApiKeyView }>> {
  const parsed = apiKeyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  return run(
    "create",
    [mutationLimiter, createLimiter],
    (scope) => createApiKey(scope, parsed.data),
    { confirmIf: (scope) => can(scope.role, "apiKeys.create") },
  );
}

/** Requests with the key fail from now on. */
export async function revokeApiKeyAction(input: {
  id: string;
}): Promise<ApiKeyActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(input);
  // An id the list never shows (a tampered request): English, as it was.
  if (!parsed.success) return { ok: false, error: "Invalid key." };
  const result = await run("revoke", [mutationLimiter], (scope) =>
    revokeApiKey(scope, parsed.data.id),
  );
  if (result.ok) revalidatePath("/dashboard", "layout");
  return result;
}
