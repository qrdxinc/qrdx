"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { codeIdSchema } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { DomainRef } from "@/app/(app)/dashboard/domains/_lib/domains";
import { codeActionText } from "@/lib/code-actions/messages-server";
import {
  addCodeAlias,
  type PathAliasRefusal,
  readCodeAliases,
  removeCodeAlias,
} from "@/lib/code-path-aliases";
import { HttpError } from "@/lib/error-response";
import { PATH_ALIASES_PER_CODE } from "@/lib/path-alias-limits";
import {
  PATH_ALIAS_MESSAGES,
  type PathAliasClaimProblem,
} from "@/lib/path-aliases";
import { assertCan } from "@/lib/permissions-server";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// A code's path aliases in its edit dialog (lib/path-aliases.ts): the old
// paths another provider printed on the code's custom domain. The checks are
// lib/code-path-aliases.ts, shared with the REST API.

export type PathAliasErrorCode =
  | PathAliasClaimProblem
  /** The code isn't on a custom domain */
  | "noDomain"
  /** The domain can't take aliases now (not verified, plan); see message */
  | "domain"
  | "unauthorized"
  | "failed";

export type PathAliasActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: PathAliasErrorCode; message: string } };

export interface PathAliasView {
  id: string;
  path: string;
}

export interface PathAliasesData {
  domain: DomainRef;
  aliases: PathAliasView[];
  /** Aliases one code can have */
  max: number;
}

const addSchema = z.object({
  codeId: codeIdSchema,
  path: z.string().max(2048),
});
const removeSchema = z.object({
  codeId: codeIdSchema,
  aliasId: z.string().trim().min(1).max(64),
});

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const fail = (
  code: PathAliasErrorCode,
  message: string,
): PathAliasActionResult<never> => ({
  success: false,
  error: { code, message },
});

/** Who's asking: the calling page's useLocale(), and the user once known. */
interface Asker {
  pageLocale?: string;
  userId?: string;
}

/** The answer for a thrown `error`, in the page's language (codeActionText). */
async function failure(error: unknown, action: string, who: Asker) {
  const text = (await codeActionText(who)).pathAliases;
  if (error instanceof UnauthorizedError) {
    return fail("unauthorized", text.signIn);
  }
  if (error instanceof HttpError) return fail("failed", error.message);
  logError(error as Error, { action });
  return fail("failed", text.failed);
}

const noDomain = async (who: Asker) =>
  fail("noDomain", (await codeActionText(who)).pathAliases.noDomain);
const problem = (code: PathAliasClaimProblem) =>
  fail(code, PATH_ALIAS_MESSAGES[code]);

/** The answer for a refusal of lib/code-path-aliases.ts. */
function refused(refusal: PathAliasRefusal, who: Asker) {
  if (refusal.problem === "noDomain") return noDomain(who);
  if (refusal.problem === "domain") {
    return fail("domain", refusal.error.message);
  }
  return problem(refusal.problem);
}

export async function getPathAliases(
  codeId: string,
  pageLocale?: string,
): Promise<PathAliasActionResult<PathAliasesData>> {
  const who: Asker = { pageLocale };
  try {
    const scope = await getActiveScope();
    who.userId = scope.userId;
    const result = await readCodeAliases(scope, codeIdSchema.parse(codeId));
    if (!result.ok) return refused(result, who);
    return {
      success: true,
      data: {
        domain: result.value.domain,
        aliases: result.value.aliases.map(({ id, path }) => ({ id, path })),
        max: PATH_ALIASES_PER_CODE,
      },
    };
  } catch (error) {
    return failure(error, "getPathAliases", who);
  }
}

export async function addPathAlias(
  input: z.input<typeof addSchema>,
  pageLocale?: string,
): Promise<PathAliasActionResult<PathAliasView>> {
  const who: Asker = { pageLocale };
  try {
    const { codeId, path } = addSchema.parse(input);
    const scope = await getActiveScope();
    who.userId = scope.userId;
    assertCan(scope, "content.write");
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `path-aliases:user:${scope.userId}` },
    ]);
    const result = await addCodeAlias(scope, codeId, path);
    if (!result.ok) return refused(result, who);
    const { alias } = result.value;
    return { success: true, data: { id: alias.id, path: alias.path } };
  } catch (error) {
    return failure(error, "addPathAlias", who);
  }
}

export async function removePathAlias(
  input: z.input<typeof removeSchema>,
  pageLocale?: string,
): Promise<PathAliasActionResult<{ id: string }>> {
  const who: Asker = { pageLocale };
  try {
    const { codeId, aliasId } = removeSchema.parse(input);
    const scope = await getActiveScope();
    who.userId = scope.userId;
    assertCan(scope, "content.write");
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `path-aliases:user:${scope.userId}` },
    ]);
    const result = await removeCodeAlias(scope, codeId, aliasId);
    if (!result.ok) return refused(result, who);
    return { success: true, data: { id: aliasId } };
  } catch (error) {
    return failure(error, "removePathAlias", who);
  }
}
