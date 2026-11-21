// Postgres's "undefined table" (42P01) for link_path_alias, apart from
// lib/path-alias-store.ts so lib/slug-claims.ts can use it too.

/**
 * Postgres's "undefined table" (42P01), however deeply the driver wraps it:
 * what every read and write of link_path_alias hits until the table exists.
 */
export function isMissingTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

let warned = false;

/**
 * True when `error` is the missing table; logs it once per process (a
 * warning: it's expected until the table exists).
 */
export function noteMissingAliases(error: unknown): boolean {
  if (!isMissingTableError(error)) return false;
  if (!warned) {
    warned = true;
    console.warn(
      "Path aliases: link_path_alias doesn't exist yet (update the database schema: bun run db:push). Custom domains answer without aliases until it does.",
    );
  }
  return true;
}
