"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { CODE_ACTION_MESSAGES, ownMessage } from "@/lib/code-actions/messages";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import {
  disablePublicStats,
  enablePublicStats,
  getPublicStatsShare,
  type PublicStatsShare,
  resetPublicStats,
} from "@/lib/public-stats";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type PublicStatsResult =
  | { success: true; data: PublicStatsShare }
  | { success: false; error: { code: string; message: string } };

const KNOWN = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "VALIDATION_ERROR",
]);

const ENGLISH = CODE_ACTION_MESSAGES.publicStats;

const codeId = z.string().trim().min(1).max(64);
const writeLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

async function run<T = PublicStatsShare>(
  action: string,
  id: unknown,
  fn: (scope: ActiveScope, codeId: string) => Promise<T>,
  { write = false } = {},
): Promise<
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
> {
  let userId: string | undefined;
  try {
    const parsed = codeId.safeParse(id);
    if (!parsed.success) {
      throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
    }
    const scope = await getActiveScope();
    userId = scope.userId;
    if (write) {
      await enforceRateLimits([
        {
          limiter: writeLimiter,
          key: `public-stats:write:user:${scope.userId}`,
        },
      ]);
    }
    return { success: true, data: await fn(scope, parsed.data) };
  } catch (error) {
    const text = (await codeActionText({ userId })).publicStats;
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { code: "UNAUTHORIZED", message: text.signIn },
      };
    }
    if (error instanceof HttpError && KNOWN.has(error.code)) {
      return {
        success: false,
        error: {
          code: error.code,
          message: ownMessage(ENGLISH, text, error.message),
        },
      };
    }
    logError(error as Error, { action });
    return {
      success: false,
      error: { code: "UNKNOWN_ERROR", message: text.failed },
    };
  }
}

export async function getPublicStatsShareAction(input: {
  codeId: string;
}): Promise<PublicStatsResult> {
  return run("getPublicStatsShare", input.codeId, getPublicStatsShare);
}

export async function setPublicStatsShareAction(input: {
  codeId: string;
  on: boolean;
}): Promise<PublicStatsResult> {
  return run(
    input.on ? "enablePublicStats" : "disablePublicStats",
    input.codeId,
    input.on ? enablePublicStats : disablePublicStats,
    { write: true },
  );
}

export async function resetPublicStatsShareAction(input: {
  codeId: string;
}): Promise<PublicStatsResult> {
  return run("resetPublicStats", input.codeId, resetPublicStats, {
    write: true,
  });
}
