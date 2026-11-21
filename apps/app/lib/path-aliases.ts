// Path aliases (link_path_alias): an exact legacy path on a customer's custom
// domain that opens one of its codes, so codes another provider printed keep
// working after the domain moves to QRdx (`go.brand.com/r/NBDX`,
// `/s/<uuid>/code_batch-1/<uuid>`, `/a/cbey7J`, `/code-of-conduct/clip`).
// Pure and client-safe.
//
// Matching works like back-halves: exact and case-sensitive on the path, the
// query string is never part of it (`/r/abc?utm_source=x` matches `/r/abc`),
// and a trailing slash is ignored (next.config.ts redirects `/r/abc/` to
// `/r/abc` first).
//
// What answers a path on a custom domain (host-routing.ts), first match wins:
// QRdx's own paths (`/`, `/api/…`, `/stats/…`, GS1 `/01/…`), back-halves
// (`/<slug>`), hosted pages (`/p/<slug>`), then aliases. So a path shaped
// like a back-half is never an alias (give the code that back-half instead),
// and an alias at `/p/<x>` answers only while no hosted page on the domain
// has the back-half x (adding one is refused while a code there has it).

import {
  PATH_ALIAS_MAX_LENGTH,
  PATH_ALIAS_MAX_SEGMENTS,
  PATH_ALIASES_PER_CODE,
} from "./path-alias-limits";
import { isValidSlug } from "./short-links";

/** Letters, digits, `-`, `_`, `.` and `~`, not starting with a dot. */
const SEGMENT = /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;

/**
 * First segments that are never aliases, compared case-insensitively: the
 * paths QRdx serves on custom domains (`/api/…`, `/stats/…`, GS1 `/01/…`,
 * the app's own `/_next/…` and `/q/…`) and the files browsers and crawlers
 * ask every site for.
 */
export const RESERVED_ALIAS_SEGMENTS: ReadonlySet<string> = new Set([
  "01",
  "_next",
  "api",
  "apple-touch-icon-precomposed.png",
  "apple-touch-icon.png",
  "favicon.ico",
  "q",
  "robots.txt",
  "sitemap.xml",
  "stats",
]);

export type PathAliasProblem =
  | "empty"
  | "length"
  | "segments"
  | "characters"
  | "backHalf"
  | "reserved"
  | "otherDomain";

/** Why a normalized path (leading "/", no trailing "/") can't be an alias. */
export function pathAliasProblem(path: string): PathAliasProblem | null {
  if (path === "" || path === "/") return "empty";
  if (path.length > PATH_ALIAS_MAX_LENGTH) return "length";
  if (!path.startsWith("/")) return "characters";
  const segments = path.slice(1).split("/");
  if (segments.length > PATH_ALIAS_MAX_SEGMENTS) return "segments";
  if (!segments.every((segment) => SEGMENT.test(segment))) return "characters";
  const [first = ""] = segments;
  if (segments.length === 1 && isValidSlug(first)) return "backHalf";
  if (RESERVED_ALIAS_SEGMENTS.has(first.toLowerCase())) return "reserved";
  return null;
}

/** An escaped `/` or `\`: decoding it would change where the parts split. */
const ESCAPED_SEPARATOR = /%(?:2f|5c)/i;

/**
 * `/a%20b/` → `/a b`; null when the escapes don't decode, or hide a
 * separator (`/r%2Fabc` must not match `/r/abc`, nor `/p%2Fx` skip the
 * hosted page that `/p/x` reaches first).
 */
function decodePath(path: string): string | null {
  if (ESCAPED_SEPARATOR.test(path)) return null;
  try {
    return decodeURIComponent(path).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * The alias a request path would match, or null when no alias can have that
 * path (so the request never looks one up).
 */
export function aliasPathOf(pathname: string): string | null {
  const path = decodePath(pathname);
  return path !== null && !pathAliasProblem(path) ? path : null;
}

export type PathAliasInput =
  | { ok: true; path: string }
  | { ok: false; problem: PathAliasProblem };

/**
 * What someone typed or an import found ("r/abc", "/r/abc/",
 * "https://go.brand.com/r/abc?utm_source=x") as an alias path on `hostname`:
 * the query string and fragment dropped, a leading "/" added, trailing ones
 * removed, escapes decoded. A full URL must be on `hostname`.
 */
export function parsePathAlias(
  input: string,
  hostname: string | null = null,
): PathAliasInput {
  let value = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, problem: "characters" };
    }
    if (hostname && url.hostname.toLowerCase() !== hostname.toLowerCase()) {
      return { ok: false, problem: "otherDomain" };
    }
    value = url.pathname;
  } else {
    value = value.split(/[?#]/, 1)[0] ?? "";
  }
  const path = decodePath(value.startsWith("/") ? value : `/${value}`);
  if (path === null) return { ok: false, problem: "characters" };
  const problem = pathAliasProblem(path);
  return problem ? { ok: false, problem } : { ok: true, path };
}

/** The hosted page a `/p/<x>` alias would share its path with: x, or null. */
export function hostedPageSlugOf(path: string): string | null {
  const match = /^\/p\/([^/]+)$/.exec(path);
  return match?.[1] && isValidSlug(match[1]) ? match[1] : null;
}

/** `https://go.brand.com/r/abc` */
export const aliasUrl = (hostname: string, path: string) =>
  `https://${hostname}${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

/** Why a path alias can't be added, beyond its shape. */
export type PathAliasClaimProblem =
  | PathAliasProblem
  /** Another code on the domain answers at this path */
  | "taken"
  /** `/p/<x>`: a code on the domain has the back-half x (its hosted page) */
  | "hostedPage"
  /** The code has PATH_ALIASES_PER_CODE on the domain already */
  | "limit"
  /** link_path_alias doesn't exist yet */
  | "unavailable";

export const PATH_ALIAS_MESSAGES: Record<PathAliasClaimProblem, string> = {
  empty: "Enter the path after the domain, for example /r/abc.",
  length: `Use at most ${PATH_ALIAS_MAX_LENGTH} characters.`,
  segments: `Use at most ${PATH_ALIAS_MAX_SEGMENTS} parts separated by /.`,
  characters:
    "Use letters, digits, - _ . and ~ between the slashes, with no empty parts.",
  backHalf: "This path fits a back-half. Give the code that back-half instead.",
  reserved: "QRdx uses this path on custom domains.",
  otherDomain: "That link is on another domain.",
  taken: "Another code on this domain already answers at this path.",
  hostedPage:
    "A code on this domain has this back-half, and its hosted page answers at this path.",
  limit: `A code can have up to ${PATH_ALIASES_PER_CODE} path aliases.`,
  unavailable: "Path aliases aren't available on this server yet.",
};
