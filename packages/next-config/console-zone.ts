// The console: QRdx's back office, a separate Next.js app. Two ways to
// reach it, both off until their variable is set (self-hosting, and qrdx.dev
// until the cutover):
// - ADMIN_CONSOLE_URL: the console at its own address
//   (https://console.qrdx.dev) with clean URLs (/users/<id>, /growth) and its
//   own sign-in through this app's OAuth provider (lib/admin-console). It
//   serves every admin section (ADMIN_CONSOLE_SECTIONS): the main app
//   redirects all of /admin there, links there instead of to /admin, and
//   confirms the console's sensitive actions on /oauth/confirm.
// - CONSOLE_ORIGIN: five sections proxied behind /admin/<section> on
//   qrdx.dev (the first design, CONSOLE_SECTIONS; its code stays until the
//   clean-up).
// Unset, nothing changes and the main app serves its own pages. Both apps
// import these lists. Pure: next.config.ts, proxy.ts, client components and
// tests import it.

/**
 * The /admin sections the proxied console (CONSOLE_ORIGIN) serves:
 * /admin/<section> and below. The console at its own address serves all of
 * them: ADMIN_CONSOLE_SECTIONS.
 */
export const CONSOLE_SECTIONS = [
  "growth",
  "numbers",
  "subscriptions",
  "ai-usage",
  "affiliates",
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/** The console's assetPrefix: its build assets live under it on qrdx.dev. */
export const CONSOLE_ASSET_PREFIX = "/console-static";

/**
 * The request header the main app's proxy.ts sets on console pages, from
 * CONSOLE_ZONE_KEY, after dropping any copy the browser sent. The console
 * sends requests without it to qrdx.dev. That keeps its own address out of
 * search results; the session check is what keeps people out.
 */
export const CONSOLE_KEY_HEADER = "x-qrdx-zone-key";

/** A next.config rewrite that only applies on the hosts given. */
export interface ConsoleRewrite {
  source: string;
  destination: string;
  has: { type: "host"; value: string }[];
}

export interface ConsoleZoneOptions {
  /**
   * The host condition's value: a regex of QRdx's own hosts (next.config's
   * PLATFORM_HOSTS). Customers' domains never reach the console.
   */
  hosts: string;
}

/**
 * `url` without its trailing slashes. A loop rather than /\/+$/, which
 * backtracks on every position of a long run of slashes.
 */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Whether `value` can be CONSOLE_ORIGIN or ADMIN_CONSOLE_URL: an origin and
 * nothing else (no path, query, hash or credentials; trailing slashes are
 * fine), over https, or over http on localhost for local development.
 */
export function isConsoleOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname));
  return secure && withoutTrailingSlashes(value).toLowerCase() === url.origin;
}

/**
 * The main app's beforeFiles rewrites that send the console's sections and
 * build assets to the console at `origin` (its origin is used, so a stray
 * path or query can't end up in the destinations). None while `origin` is
 * unset or empty: the main app keeps serving its own pages.
 *
 * A section name fills a whole segment, so /admin/growthx and the other
 * /admin sections never match.
 */
export function consoleZoneRewrites(
  origin: string | undefined,
  { hosts }: ConsoleZoneOptions
): ConsoleRewrite[] {
  if (!origin) return [];
  const zone = new URL(origin).origin;
  const has = [{ type: "host" as const, value: hosts }];
  return [
    {
      source: `/admin/:section(${CONSOLE_SECTIONS.join("|")})/:path*`,
      destination: `${zone}/admin/:section/:path*`,
      has,
    },
    {
      source: `${CONSOLE_ASSET_PREFIX}/:path*`,
      destination: `${zone}${CONSOLE_ASSET_PREFIX}/:path*`,
      has,
    },
  ];
}

// Next matches beforeFiles rewrites without regard to case (it never passes
// them experimental.caseSensitiveRoutes), so these do too.
const SECTION_PATH = new RegExp(
  `^/admin/(${CONSOLE_SECTIONS.join("|")})(?:/|$)`,
  "i"
);
const ASSET_PATH = new RegExp(`^${CONSOLE_ASSET_PREFIX}(?:/|$)`, "i");

/** The console section `pathname` is in (/admin/<section> or below), or null. */
export function consoleSection(pathname: string): ConsoleSection | null {
  const section = SECTION_PATH.exec(pathname)?.[1];
  return section ? (section.toLowerCase() as ConsoleSection) : null;
}

/**
 * Whether the console serves `pathname` once CONSOLE_ORIGIN is set: one of
 * its sections' pages, or its build assets.
 */
export function isConsolePath(pathname: string): boolean {
  return consoleSection(pathname) !== null || ASSET_PATH.test(pathname);
}

// The console's two prefixes as the first segment, in any case.
const ZONE_PREFIX = /^\/(admin|console-static)(?=\/|$)/i;

/**
 * `pathname` with its /admin or /console-static prefix lower-cased, or null
 * when the prefix already is (or there's none). The rewrites match /ADMIN/…
 * too, but proxy.ts matchers and the pages don't, so the proxy sends any
 * other casing to the lower-case path before anything reaches the console.
 */
export function lowerCasedZonePrefix(pathname: string): string | null {
  const prefix = ZONE_PREFIX.exec(pathname)?.[1];
  if (!prefix || prefix === prefix.toLowerCase()) return null;
  return `/${prefix.toLowerCase()}${pathname.slice(prefix.length + 1)}`;
}

/** A `..` or an encoded dot (%2e, %2E) anywhere in `pathname`. */
export function hasDotSegment(pathname: string): boolean {
  return pathname.includes("..") || /%2e/i.test(pathname);
}

const RETURN_BASE = "https://return.invalid";

/**
 * `next` as a path (with its query) when it's a console page on this site,
 * else null: where /admin/confirm may send an admin back to. Never another
 * host, a protocol-relative URL, a build asset or another /admin page.
 */
export function consoleReturnPath(
  next: string | null | undefined
): string | null {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(next, RETURN_BASE);
  } catch {
    return null;
  }
  if (url.origin !== RETURN_BASE || consoleSection(url.pathname) === null) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

// ─── The console at its own address (ADMIN_CONSOLE_URL) ─────────────────────

// Its OAuth client, as both apps know it (the main app's lib/admin-console
// defines the client from these; the console sends them).

/** The client id the console sends; not an oauth_app row. */
export const ADMIN_CONSOLE_CLIENT_ID = "qrdx_admin_console";

/** The console's one redirect URI: this path under ADMIN_CONSOLE_URL. */
export const ADMIN_CONSOLE_CALLBACK_PATH = "/auth/callback";

/** OpenID Connect's names; `openid` is required, the others optional. */
export const ADMIN_CONSOLE_SCOPES = ["openid", "email", "profile"] as const;
export type AdminConsoleScope = (typeof ADMIN_CONSOLE_SCOPES)[number];

/** The console's access tokens start with this, so userinfo knows whose they are. */
export const ADMIN_CONSOLE_TOKEN_PREFIX = "qrdxc_";

/** A next.config redirect that only applies on the hosts given. */
export interface ConsoleRedirect {
  source: string;
  destination: string;
  permanent: boolean;
  has: { type: "host"; value: string }[];
}

/**
 * The client secret must be this long to count (the console requires the
 * same): a short or missing CONSOLE_ZONE_KEY leaves everything off.
 */
export const ADMIN_CONSOLE_SECRET_MIN_LENGTH = 32;

/**
 * The console's address once it can be used: ADMIN_CONSOLE_URL, but only
 * with a CONSOLE_ZONE_KEY of 32 characters or more (the console's OAuth
 * client secret), since without it the console can't sign anyone in and
 * sending admins there would strand them. Undefined otherwise. The
 * redirects, the admin menus, the overview, the user menu's Admin link and
 * /oauth/confirm all read this one.
 */
export function adminConsoleAddress({
  adminConsoleUrl,
  secret,
}: {
  adminConsoleUrl: string | undefined;
  secret: string | undefined;
}): string | undefined {
  if (!(adminConsoleUrl && secret)) return undefined;
  if (secret.length < ADMIN_CONSOLE_SECRET_MIN_LENGTH) return undefined;
  return new URL(adminConsoleUrl).origin;
}

/**
 * Sections only the console has (no app/(app)/admin/<section> here): its
 * Email page sends personal notes through this app's signed endpoints
 * (/api/internal/console/emails/*).
 */
export const CONSOLE_ONLY_SECTIONS = ["email"] as const;

/**
 * Every section the console at its own address serves at /<section>: each
 * of the main app's admin sections (app/(app)/admin/<section>), the five it
 * started with first, then CONSOLE_ONLY_SECTIONS. /admin itself is the
 * console's front page (/), and /admin/confirm isn't a section: the console
 * confirms on /oauth/confirm.
 */
export const ADMIN_CONSOLE_SECTIONS = [
  ...CONSOLE_SECTIONS,
  "users",
  "themes",
  "community",
  "codes",
  "abuse",
  "integrations",
  "audit-log",
  "health",
  "search",
  ...CONSOLE_ONLY_SECTIONS,
] as const;

export type AdminConsoleSection = (typeof ADMIN_CONSOLE_SECTIONS)[number];

/**
 * The main app's "Confirm it's you" page for the console's sensitive
 * actions, outside /admin (app/(app)/oauth/confirm): ?next= is a page at the
 * console's own address (adminConsoleReturnUrl).
 */
export const ADMIN_CONSOLE_CONFIRM_PATH = "/oauth/confirm";

/**
 * The main app's redirects while the console is at its own address
 * (`adminConsoleUrl`, from adminConsoleAddress): every /admin URL goes there,
 * the query kept (as Next does by default).
 * - /admin → https://console.qrdx.dev/
 * - /admin/<section>[/…] → …/<section>[/…], for every ADMIN_CONSOLE_SECTIONS
 *   entry: /admin/users/abc/export → …/users/abc/export, /admin/search?q=a →
 *   …/search?q=a. One pair of rules per section with literal, lower-case
 *   destinations: Next matches sources without regard to case, so
 *   /admin/Users/abc lands on /users/abc, not /Users/abc. The bare section
 *   has a rule of its own because Vercel writes an empty :path* as a
 *   trailing slash (/growth/), an extra hop at the console.
 * - /admin/confirm → /oauth/confirm here (ADMIN_CONSOLE_CONFIRM_PATH): a
 *   console still sending admins to the old page reaches the new one, rather
 *   than a page the console doesn't have.
 * - anything else under /admin → the same path there (the console's 404).
 * None while it's unset: this app serves its own pages.
 *
 * Temporary (307) for now, so browsers don't cache the move and a rollback
 * (unsetting ADMIN_CONSOLE_URL) takes effect at once. After the seven-day
 * watch it becomes permanent (308).
 */
export function adminConsoleRedirects(
  adminConsoleUrl: string | undefined,
  { hosts }: ConsoleZoneOptions
): ConsoleRedirect[] {
  if (!adminConsoleUrl) return [];
  const origin = new URL(adminConsoleUrl).origin;
  const rule = (source: string, destination: string): ConsoleRedirect => ({
    source,
    destination,
    permanent: false,
    has: [{ type: "host", value: hosts }],
  });
  return [
    rule("/admin", `${origin}/`),
    rule("/admin/confirm", ADMIN_CONSOLE_CONFIRM_PATH),
    ...ADMIN_CONSOLE_SECTIONS.flatMap((section) => [
      rule(`/admin/${section}`, `${origin}/${section}`),
      rule(`/admin/${section}/:path+`, `${origin}/${section}/:path+`),
    ]),
    rule("/admin/:path+", `${origin}/:path+`),
  ];
}

// /admin/<section> for any of the console's sections, in any case.
const ADMIN_CONSOLE_SECTION_PATH = new RegExp(
  `^/admin/(${ADMIN_CONSOLE_SECTIONS.join("|")})(?=/|$)`,
  "i"
);

/**
 * The console's own URL for an admin page named the way this app names it
 * (/admin, /admin/users/abc, /admin/subscriptions?status=active): the same
 * path without /admin, with its query, on `adminConsoleUrl`. Null while
 * that's unset, and for any href that isn't /admin or one of its sections.
 */
export function adminConsoleHref(
  href: string,
  adminConsoleUrl: string | undefined
): string | null {
  if (!adminConsoleUrl) return null;
  let url: URL;
  try {
    url = new URL(href, RETURN_BASE);
  } catch {
    return null;
  }
  if (url.origin !== RETURN_BASE) return null;
  const origin = new URL(adminConsoleUrl).origin;
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    return `${origin}/${url.search}`;
  }
  const section = ADMIN_CONSOLE_SECTION_PATH.exec(url.pathname)?.[1];
  if (!section) return null;
  const rest = url.pathname.slice("/admin/".length + section.length);
  return `${origin}/${section.toLowerCase()}${rest}${url.search}`;
}

const MAX_RETURN_LENGTH = 2048;

/**
 * The query parameter the console adds to the page it sends to
 * /oauth/confirm, so it can tell, once back, that the admin has just
 * confirmed (`?confirmed=1`). Going back without confirming drops it
 * (adminConsoleCancelUrl).
 */
export const ADMIN_CONSOLE_CONFIRMED_PARAM = "confirmed";

/**
 * Where /oauth/confirm may send an admin back to, or null: a page at exactly
 * the console's own address (`adminConsoleUrl`), as an absolute URL, without
 * its hash. Never another origin (scheme, host or port), credentials, a
 * relative or protocol-relative URL, a backslash, whitespace or a control
 * character (browsers rewrite those), a path with an empty segment (//) or
 * any percent-encoding (so what's checked is what the console routes), a dot
 * segment, the console's sign-in routes (/auth…), or anything longer than
 * 2,048 characters. The query may hold anything.
 */
export function adminConsoleReturnUrl(
  next: string | null | undefined,
  adminConsoleUrl: string | undefined
): string | null {
  if (!(adminConsoleUrl && next) || next.length > MAX_RETURN_LENGTH) {
    return null;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return null;
  // Absolute only: no base, so "/users" and "//host/users" don't parse.
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return null;
  }
  const path = url.pathname;
  if (
    url.origin !== new URL(adminConsoleUrl).origin ||
    url.username ||
    url.password ||
    // The console's ids and section names are plain: an encoded character
    // (%61uth, auth%2flogin) or an empty segment (//auth) is never needed,
    // and could hide a path the checks below would refuse.
    path.includes("%") ||
    path.includes("//") ||
    hasDotSegment(path) ||
    /^\/auth(?:\/|$)/i.test(path)
  ) {
    return null;
  }
  return `${url.origin}${path}${url.search}`;
}

/**
 * The console page `back` (from adminConsoleReturnUrl) without the console's
 * "just confirmed" marker: where "Go back" on /oauth/confirm goes, so a
 * return without confirming isn't read as one after confirming.
 */
export function adminConsoleCancelUrl(back: string): string {
  const url = new URL(back);
  url.searchParams.delete(ADMIN_CONSOLE_CONFIRMED_PARAM);
  return url.toString();
}
