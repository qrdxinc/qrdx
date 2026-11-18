"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import {
  codeIdSchema,
  getCode,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  assertBindableDomains,
  type DomainRef,
} from "@/app/(app)/dashboard/domains/_lib/domains";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import { PATH_ALIASES_PER_CODE } from "@/lib/path-alias-limits";
import { claimAlias, listAliases, removeAlias } from "@/lib/path-alias-store";
import {
  PATH_ALIAS_MESSAGES,
  type PathAliasClaimProblem,
  parsePathAlias,
} from "@/lib/path-aliases";
import { assertCan } from "@/lib/permissions-server";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// A code's path aliases in its edit dialog (lib/path-aliases.ts): the old
// paths another provider printed on the code's custom domain.

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

/** The answer for a thrown `error`, in the person's language (codeActionText). */
async function failure(error: unknown, action: string) {
  const text = (await codeActionText()).pathAliases;
  if (error instanceof UnauthorizedError) {
    return fail("unauthorized", text.signIn);
  }
  if (error instanceof HttpError) return fail("failed", error.message);
  logError(error as Error, { action });
  return fail("failed", text.failed);
}

/** The code (in the caller's workspace) and its custom domain. */
async function codeOnDomain(
  scope: ActiveScope,
  codeId: string,
): Promise<DomainRef | null> {
  return (await getCode(scope, codeId)).domain;
}

const noDomain = async () =>
  fail("noDomain", (await codeActionText()).pathAliases.noDomain);
const problem = (code: PathAliasClaimProblem) =>
  fail(code, PATH_ALIAS_MESSAGES[code]);

export async function getPathAliases(
  codeId: string,
): Promise<PathAliasActionResult<PathAliasesData>> {
  try {
    const scope = await getActiveScope();
    const domain = await codeOnDomain(scope, codeIdSchema.parse(codeId));
    if (!domain) return noDomain();
    const aliases = await listAliases(codeId, domain.id);
    if (!aliases) return problem("unavailable");
    return {
      success: true,
      data: {
        domain,
        aliases: aliases.map(({ id, path }) => ({ id, path })),
        max: PATH_ALIASES_PER_CODE,
      },
    };
  } catch (error) {
    return failure(error, "getPathAliases");
  }
}

export async function addPathAlias(
  input: z.input<typeof addSchema>,
): Promise<PathAliasActionResult<PathAliasView>> {
  try {
    const { codeId, path } = addSchema.parse(input);
    const scope = await getActiveScope();
    assertCan(scope, "content.write");
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `path-aliases:user:${scope.userId}` },
    ]);
    const domain = await codeOnDomain(scope, codeId);
    if (!domain) return noDomain();
    try {
      // In the workspace, verified, and custom domains on the plan.
      await assertBindableDomains(scope, [domain.id]);
    } catch (error) {
      if (error instanceof HttpError) return fail("domain", error.message);
      throw error;
    }
    const parsed = parsePathAlias(path, domain.hostname);
    if (!parsed.ok) return problem(parsed.problem);
    const claim = await claimAlias({
      codeId,
      domainId: domain.id,
      path: parsed.path,
    });
    if (!claim.ok) return problem(claim.problem);
    return {
      success: true,
      data: { id: claim.alias.id, path: claim.alias.path },
    };
  } catch (error) {
    return failure(error, "addPathAlias");
  }
}

export async function removePathAlias(
  input: z.input<typeof removeSchema>,
): Promise<PathAliasActionResult<{ id: string }>> {
  try {
    const { codeId, aliasId } = removeSchema.parse(input);
    const scope = await getActiveScope();
    assertCan(scope, "content.write");
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `path-aliases:user:${scope.userId}` },
    ]);
    // Throws for codes outside the workspace, so their aliases stay put.
    await getCode(scope, codeId);
    if ((await removeAlias(codeId, aliasId)) === null) {
      return problem("unavailable");
    }
    return { success: true, data: { id: aliasId } };
  } catch (error) {
    return failure(error, "removePathAlias");
  }
}
