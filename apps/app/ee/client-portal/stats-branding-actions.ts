"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { requireClientBranding } from "@/ee/client-portal/access";
import type { StatsBranding } from "@/ee/client-portal/brands-shared";
import {
  getStatsBranding,
  setStatsBranding,
} from "@/ee/client-portal/stats-branding";
import { HttpError } from "@/lib/error-response";
import type { PublicStatsShare } from "@/lib/public-stats";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// The share dialog's client branding (agency tools): the brand and custom
// domain of a code's shared stats page (./stats-branding.ts). On a server
// without the licence key both answer NOT_FOUND (./access.ts).

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type StatsBrandingResult = Result<StatsBranding>;

const KNOWN = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "VALIDATION_ERROR",
  "PLAN_REQUIRED",
  "CONFLICT",
]);

const codeId = z.string().trim().min(1).max(64);
const optionalId = z.string().trim().min(1).max(64).nullable();
// The same budget as the share dialog's other writes (actions/public-stats.ts).
const writeLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

async function run<T>(
  action: string,
  id: unknown,
  fn: (scope: ActiveScope, codeId: string) => Promise<T>,
  { write = false } = {},
): Promise<Result<T>> {
  try {
    requireClientBranding();
    const parsed = codeId.safeParse(id);
    if (!parsed.success) {
      throw new HttpError(404, "NOT_FOUND", "QR code not found");
    }
    const scope = await getActiveScope();
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
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Sign in to share analytics." },
      };
    }
    if (error instanceof HttpError && KNOWN.has(error.code)) {
      return {
        success: false,
        error: { code: error.code, message: error.message },
      };
    }
    logError(error as Error, { action });
    return {
      success: false,
      error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
    };
  }
}

export async function getStatsBrandingAction(input: {
  codeId: string;
}): Promise<StatsBrandingResult> {
  return run("getStatsBranding", input.codeId, getStatsBranding);
}

/** Sets the page's client brand and custom domain (null clears each). */
export async function setStatsBrandingAction(input: {
  codeId: string;
  brandId: string | null;
  domainId: string | null;
}): Promise<Result<{ share: PublicStatsShare; branding: StatsBranding }>> {
  const brandId = optionalId.safeParse(input.brandId ?? null);
  const domainId = optionalId.safeParse(input.domainId ?? null);
  if (!(brandId.success && domainId.success)) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose a brand and a link.",
      },
    };
  }
  return run(
    "setStatsBranding",
    input.codeId,
    (scope, codeId) =>
      setStatsBranding(scope, codeId, {
        brandId: brandId.data,
        domainId: domainId.data,
      }),
    { write: true },
  );
}
