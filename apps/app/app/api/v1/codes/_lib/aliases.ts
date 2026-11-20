import "server-only";

import type { DomainRef } from "@/app/(app)/dashboard/domains/_lib/domains";
import type { PathAliasRefusal } from "@/lib/code-path-aliases";
import { HttpError } from "@/lib/error-response";
import type { PathAliasRow } from "@/lib/path-alias-store";
import { aliasUrl, PATH_ALIAS_MESSAGES } from "@/lib/path-aliases";

// /v1/codes/{id}/aliases: a code's path aliases (lib/path-aliases.ts) with
// the edit dialog's checks (lib/code-path-aliases.ts), refused with its
// sentences.

/** Public JSON shape of a path alias. */
export function serializePathAlias(alias: PathAliasRow, domain: DomainRef) {
  return {
    id: alias.id,
    path: alias.path,
    url: aliasUrl(domain.hostname, alias.path),
    createdAt: alias.createdAt.toISOString(),
  };
}

/**
 * The API error for a refusal. `data.reason` is the dialog's own name for
 * it where one code covers several.
 */
export function pathAliasError(refusal: PathAliasRefusal): HttpError {
  switch (refusal.problem) {
    case "domain":
      // assertBindableDomains's: DOMAIN_NOT_VERIFIED, PLAN_REQUIRED.
      return refusal.error;
    case "noDomain":
      return new HttpError(
        409,
        "NO_CUSTOM_DOMAIN",
        "Path aliases are for codes on a custom domain. Move the code to one first (`domainId`).",
      );
    case "taken":
    case "hostedPage":
      return new HttpError(
        409,
        "PATH_ALIAS_TAKEN",
        PATH_ALIAS_MESSAGES[refusal.problem],
        undefined,
        undefined,
        { reason: refusal.problem },
      );
    case "limit":
      return new HttpError(409, "PATH_ALIAS_LIMIT", PATH_ALIAS_MESSAGES.limit);
    case "unavailable":
      // Before manual-sql/2026-11-18-path-aliases.sql (lib/path-alias-missing.ts).
      return new HttpError(
        503,
        "PATH_ALIASES_UNAVAILABLE",
        PATH_ALIAS_MESSAGES.unavailable,
      );
    default:
      return new HttpError(
        400,
        "INVALID_PATH_ALIAS",
        PATH_ALIAS_MESSAGES[refusal.problem],
        undefined,
        undefined,
        { reason: refusal.problem },
      );
  }
}
