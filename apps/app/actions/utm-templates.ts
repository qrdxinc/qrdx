"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  createUtmTemplate,
  deleteUtmTemplate,
  listUtmTemplates,
  renameUtmTemplate,
  type UtmTemplateList,
  type UtmTemplateView,
} from "@/lib/utm-templates";
import { UnauthorizedError } from "@/types/errors";

export type UtmTemplateResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const KNOWN = new Set([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "PLAN_REQUIRED",
  "NAME_TAKEN",
  "TOO_MANY_TEMPLATES",
  "RATE_LIMITED",
  "UNAVAILABLE",
]);

const writeLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  {
    write = false,
    pageLocale,
  }: {
    write?: boolean;
    /** The calling page's useLocale(): the language its messages are in */
    pageLocale?: string;
  } = {},
): Promise<UtmTemplateResult<T>> {
  let userId: string | undefined;
  try {
    const scope = await getActiveScope();
    userId = scope.userId;
    if (write) {
      await enforceRateLimits([
        {
          limiter: writeLimiter,
          key: `utm-templates:write:user:${scope.userId}`,
        },
      ]);
    }
    return { success: true, data: await fn(scope) };
  } catch (error) {
    const text = (await codeActionText({ pageLocale, userId })).utmTemplates;
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { code: "UNAUTHORIZED", message: text.signIn },
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
      error: { code: "UNKNOWN_ERROR", message: text.failed },
    };
  }
}

/** The open workspace's templates (`available: false` before the table exists). */
export async function getUtmTemplates(
  pageLocale?: string,
): Promise<UtmTemplateResult<UtmTemplateList>> {
  return run("getUtmTemplates", (scope) => listUtmTemplates(scope), {
    pageLocale,
  });
}

export async function saveUtmTemplate(
  input: {
    name: string;
    utm: unknown;
  },
  pageLocale?: string,
): Promise<UtmTemplateResult<UtmTemplateView>> {
  return run("saveUtmTemplate", (scope) => createUtmTemplate(scope, input), {
    write: true,
    pageLocale,
  });
}

export async function renameUtmTemplateAction(
  input: {
    id: string;
    name: string;
  },
  pageLocale?: string,
): Promise<UtmTemplateResult<UtmTemplateView>> {
  return run("renameUtmTemplate", (scope) => renameUtmTemplate(scope, input), {
    write: true,
    pageLocale,
  });
}

export async function deleteUtmTemplateAction(
  input: {
    id: string;
  },
  pageLocale?: string,
): Promise<UtmTemplateResult<{ id: string }>> {
  return run("deleteUtmTemplate", (scope) => deleteUtmTemplate(scope, input), {
    write: true,
    pageLocale,
  });
}
