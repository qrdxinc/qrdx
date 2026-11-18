"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import {
  type CompareOption,
  toCompareOption,
} from "@/app/(app)/dashboard/analytics/_lib/code-label";
import { searchCodeOptions } from "@/app/(app)/dashboard/analytics/_lib/queries";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Analytics → Compare codes → typing in the picker. The workspace comes from
// the page's URL (lib/scope.ts), never from the client.

export type CompareSearchResult =
  | { ok: true; data: { options: CompareOption[]; more: boolean } }
  | { ok: false; error: string };

/** Typing pauses ~250 ms between requests, so this leaves plenty of room. */
const searchLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
});

const searchSchema = z.object({ q: z.string().max(200) });

export async function searchCompareCodes(input: {
  q: string;
}): Promise<CompareSearchResult> {
  let userId: string | undefined;
  try {
    const scope = await getActiveScope();
    userId = scope.userId;
    await enforceRateLimits([
      { limiter: searchLimiter, key: `analytics:compare:user:${scope.userId}` },
    ]);
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: (await codeActionText({ userId })).analytics.searchTooLong,
      };
    }
    const { options, more } = await searchCodeOptions(scope, {
      q: parsed.data.q,
    });
    return { ok: true, data: { options: options.map(toCompareOption), more } };
  } catch (error) {
    const text = (await codeActionText({ userId })).analytics;
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: text.signIn };
    }
    if (error instanceof HttpError) return { ok: false, error: error.message };
    logError(error as Error, { action: "analytics.compare-search" });
    return { ok: false, error: text.failed };
  }
}
