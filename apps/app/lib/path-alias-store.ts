import "server-only";

import { database as db, linkPathAlias, qrCode } from "@repo/database";
import cuid from "cuid";
import { and, asc, count, eq, inArray, type SQL } from "drizzle-orm";
import { PATH_ALIASES_PER_CODE } from "./path-alias-limits";
import { noteMissingAliases } from "./path-alias-missing";
import {
  hostedPageSlugOf,
  type PathAliasClaimProblem,
  pathAliasProblem,
} from "./path-aliases";
import { type RedirectCode, redirectCodeColumns } from "./redirect/code";
import { findTakenSlugs, isUniqueViolation } from "./slug-claims";

// Reads and writes of link_path_alias (lib/path-aliases.ts has the rules).
// The table comes from manual-sql/2026-11-18-path-aliases.sql: until it's
// applied, every lookup here answers "no alias" (and logs that once), so
// custom domains keep answering as before.

/** An alias answers only while its code is on the alias's domain. */
const liveJoin = and(
  eq(qrCode.id, linkPathAlias.qrCodeId),
  eq(qrCode.domainId, linkPathAlias.domainId),
) as SQL;

/**
 * The code an alias opens on `domainId` (the redirect pipeline, app/q/[slug]
 * resolve.ts), in one indexed lookup; null when there's none, and while the
 * table is missing.
 */
export async function aliasCode(
  path: string,
  domainId: string,
): Promise<RedirectCode | null> {
  try {
    const [row] = await db
      .select(redirectCodeColumns)
      .from(linkPathAlias)
      .innerJoin(qrCode, liveJoin)
      .where(
        and(eq(linkPathAlias.domainId, domainId), eq(linkPathAlias.path, path)),
      )
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (noteMissingAliases(error)) return null;
    throw error;
  }
}

/** Whether `domainId` has any alias (host-routing.ts asks once a minute). */
export async function domainHasAliases(domainId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: linkPathAlias.id })
      .from(linkPathAlias)
      .where(eq(linkPathAlias.domainId, domainId))
      .limit(1);
    return Boolean(row);
  } catch (error) {
    if (noteMissingAliases(error)) return false;
    throw error;
  }
}

export interface PathAliasRow {
  id: string;
  path: string;
  createdAt: Date;
}

/** A code's aliases on its domain, oldest first; null while the table is missing. */
export async function listAliases(
  codeId: string,
  domainId: string,
): Promise<PathAliasRow[] | null> {
  try {
    return await db
      .select({
        id: linkPathAlias.id,
        path: linkPathAlias.path,
        createdAt: linkPathAlias.createdAt,
      })
      .from(linkPathAlias)
      .where(
        and(
          eq(linkPathAlias.qrCodeId, codeId),
          eq(linkPathAlias.domainId, domainId),
        ),
      )
      .orderBy(asc(linkPathAlias.createdAt), asc(linkPathAlias.path));
  } catch (error) {
    if (noteMissingAliases(error)) return null;
    throw error;
  }
}

/**
 * Which of `paths` can't be claimed on `domainId`: another code's live alias
 * holds it, or (for `/p/<x>`) a code there has the back-half x. Null while
 * the table is missing (imports then propose no aliases).
 */
export async function findTakenAliasPaths(
  paths: string[],
  domainId: string,
): Promise<Set<string> | null> {
  const taken = new Set<string>();
  const unique = [...new Set(paths)];
  try {
    for (let i = 0; i < unique.length; i += 500) {
      const rows = await db
        .select({ path: linkPathAlias.path })
        .from(linkPathAlias)
        .innerJoin(qrCode, liveJoin)
        .where(
          and(
            eq(linkPathAlias.domainId, domainId),
            inArray(linkPathAlias.path, unique.slice(i, i + 500)),
          ),
        );
      for (const row of rows) taken.add(row.path);
    }
  } catch (error) {
    if (noteMissingAliases(error)) return null;
    throw error;
  }
  const pages = new Map<string, string>();
  for (const path of unique) {
    const slug = hostedPageSlugOf(path);
    if (slug) pages.set(slug, path);
  }
  if (pages.size > 0) {
    const holders = await findTakenSlugs([...pages.keys()], domainId, {
      aliases: false,
    });
    for (const slug of holders) {
      taken.add(pages.get(slug) as string);
    }
  }
  return taken;
}

export type ClaimResult =
  | { ok: true; alias: PathAliasRow }
  | { ok: false; problem: PathAliasClaimProblem };

/**
 * Gives `codeId` (a code on `domainId`; the caller checked the workspace,
 * plan and domain) the alias `path` (normalized, lib/path-aliases.ts), up
 * to PATH_ALIASES_PER_CODE on that domain.
 * Claiming a path the code already has returns that alias. A path held by a
 * code that has since left the domain is taken over.
 */
export async function claimAlias(input: {
  codeId: string;
  domainId: string;
  path: string;
}): Promise<ClaimResult> {
  const { codeId, domainId, path } = input;
  const problem = pathAliasProblem(path);
  if (problem) return { ok: false, problem };
  try {
    const pageSlug = hostedPageSlugOf(path);
    const pageHolders = pageSlug
      ? await findTakenSlugs([pageSlug], domainId, { aliases: false })
      : null;
    if (pageHolders && pageHolders.size > 0) {
      return { ok: false, problem: "hostedPage" };
    }
    const [existing] = await db
      .select({
        id: linkPathAlias.id,
        qrCodeId: linkPathAlias.qrCodeId,
        createdAt: linkPathAlias.createdAt,
        codeDomainId: qrCode.domainId,
      })
      .from(linkPathAlias)
      .leftJoin(qrCode, eq(qrCode.id, linkPathAlias.qrCodeId))
      .where(
        and(eq(linkPathAlias.domainId, domainId), eq(linkPathAlias.path, path)),
      )
      .limit(1);
    if (existing?.qrCodeId === codeId) {
      return {
        ok: true,
        alias: { id: existing.id, path, createdAt: existing.createdAt },
      };
    }
    if (existing && existing.codeDomainId === domainId) {
      return { ok: false, problem: "taken" };
    }
    const [usage] = await db
      .select({ total: count() })
      .from(linkPathAlias)
      .where(
        and(
          eq(linkPathAlias.qrCodeId, codeId),
          eq(linkPathAlias.domainId, domainId),
        ),
      );
    if ((usage?.total ?? 0) >= PATH_ALIASES_PER_CODE) {
      return { ok: false, problem: "limit" };
    }
    if (existing) {
      // Its code has left the domain since: the path is free.
      await db.delete(linkPathAlias).where(eq(linkPathAlias.id, existing.id));
    }
    const alias = { id: cuid(), path, createdAt: new Date() };
    try {
      await db
        .insert(linkPathAlias)
        .values({ ...alias, domainId, qrCodeId: codeId });
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, problem: "taken" };
      throw error;
    }
    return { ok: true, alias };
  } catch (error) {
    if (noteMissingAliases(error)) return { ok: false, problem: "unavailable" };
    throw error;
  }
}

/**
 * Removes one of a code's aliases; false when it wasn't there, null while
 * the table is missing.
 */
export async function removeAlias(
  codeId: string,
  aliasId: string,
): Promise<boolean | null> {
  try {
    const removed = await db
      .delete(linkPathAlias)
      .where(
        and(eq(linkPathAlias.id, aliasId), eq(linkPathAlias.qrCodeId, codeId)),
      )
      .returning({ id: linkPathAlias.id });
    return removed.length > 0;
  } catch (error) {
    if (noteMissingAliases(error)) return null;
    throw error;
  }
}
