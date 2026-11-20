import "server-only";

import { getCode } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  assertBindableDomains,
  type DomainRef,
} from "@/app/(app)/dashboard/domains/_lib/domains";
import { HttpError } from "./http-error";
import {
  claimAlias,
  listAliases,
  type PathAliasRow,
  removeAlias,
} from "./path-alias-store";
import { type PathAliasClaimProblem, parsePathAlias } from "./path-aliases";
import { assertCan } from "./permissions-server";
import type { ActiveScope } from "./scope";

// A code's path aliases (lib/path-aliases.ts) as the people who manage it
// see them: the checks the edit dialog (actions/path-aliases.ts) and the
// REST API (/v1/codes/{id}/aliases) share. A code outside the workspace
// throws getCode's 404 and a write without edit rights the 403; every other
// refusal is returned, so each caller words it its own way.

/** Why a code's aliases can't be read or changed. */
export type PathAliasRefusal =
  | {
      ok: false;
      problem:
        | PathAliasClaimProblem
        /** The code isn't on a custom domain */
        | "noDomain";
    }
  /** The domain can't take aliases now (not verified, plan): `error` says why */
  | { ok: false; problem: "domain"; error: HttpError };

export type PathAliasOutcome<T> = { ok: true; value: T } | PathAliasRefusal;

const refuse = (problem: PathAliasClaimProblem | "noDomain") =>
  ({ ok: false, problem }) as const;

/** The code's aliases on its custom domain, oldest first. */
export async function readCodeAliases(
  scope: ActiveScope,
  codeId: string,
): Promise<PathAliasOutcome<{ domain: DomainRef; aliases: PathAliasRow[] }>> {
  const { domain } = await getCode(scope, codeId);
  if (!domain) return refuse("noDomain");
  const aliases = await listAliases(codeId, domain.id);
  if (!aliases) return refuse("unavailable");
  return { ok: true, value: { domain, aliases } };
}

/**
 * Gives the code the alias `path` ("/r/abc", "r/abc/", or the whole old link
 * on the code's own domain). Needs edit rights, the code on a verified
 * custom domain of the workspace, and custom domains on the plan. `created`
 * is false when the code already had that path.
 */
export async function addCodeAlias(
  scope: ActiveScope,
  codeId: string,
  path: string,
): Promise<
  PathAliasOutcome<{ domain: DomainRef; alias: PathAliasRow; created: boolean }>
> {
  assertCan(scope, "content.write");
  const { domain } = await getCode(scope, codeId);
  if (!domain) return refuse("noDomain");
  try {
    // In the workspace, verified, and custom domains on the plan.
    await assertBindableDomains(scope, [domain.id]);
  } catch (error) {
    if (error instanceof HttpError) {
      return { ok: false, problem: "domain", error };
    }
    throw error;
  }
  const parsed = parsePathAlias(path, domain.hostname);
  if (!parsed.ok) return refuse(parsed.problem);
  const claim = await claimAlias({
    codeId,
    domainId: domain.id,
    path: parsed.path,
  });
  if (!claim.ok) return refuse(claim.problem);
  return {
    ok: true,
    value: { domain, alias: claim.alias, created: claim.created },
  };
}

/**
 * Removes one of the code's aliases. `removed` is false when the code has no
 * alias with that id (on any domain).
 */
export async function removeCodeAlias(
  scope: ActiveScope,
  codeId: string,
  aliasId: string,
): Promise<PathAliasOutcome<{ removed: boolean }>> {
  assertCan(scope, "content.write");
  // Throws for codes outside the workspace, so their aliases stay put.
  await getCode(scope, codeId);
  const removed = await removeAlias(codeId, aliasId);
  if (removed === null) return refuse("unavailable");
  return { ok: true, value: { removed } };
}
