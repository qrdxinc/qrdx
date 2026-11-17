// The site zone: QRdx's marketing pages, a separate Next.js app that serves
// some of qrdx.dev's public pages at their URLs. The main app proxies them
// there once SITE_ORIGIN is set; unset (self-hosting, and qrdx.dev until the
// cutover), nothing changes and the main app serves its own pages. Both apps
// import this one list. Pure: next.config.ts, proxy.ts, client components
// and tests import it.
//
// The pages move in groups (the blog first; comparisons, SEO pages and the
// home page later), so the list is a map of group → path prefixes. A group
// is on while SITE_ORIGIN is set and SITE_ZONE_GROUPS is unset or names it,
// so traffic moves one group at a time with an environment change and a
// redeploy, and moves back the same way.
//
// Unlike the console, these pages are public: no session check, and the
// main app adds no cache rules of its own, so the zone's own Cache-Control
// decides what the CDN keeps (as with the docs zone). What the zone gets
// from the proxy is the zone key, so it can turn away requests that didn't
// come through qrdx.dev and keep its own address out of search results.

/**
 * Where a group's pages are. A string is a prefix: the page at it and
 * everything under it (its Open Graph images, feeds, Markdown copies and
 * child pages); "/" would mean the home page alone. `{ path }` is that one
 * path and nothing under it, for a group that shares its first segment with
 * this app's own pages (/templates/<type> stays here while /templates
 * moves). A segment of `path` may be `*`, any one segment without a dot,
 * or end in `*`, as in `opengraph-image*`: that text, then anything but a
 * slash or a dot (Next adds a hash to Open Graph image URLs).
 */
export type SitePath = string | { readonly path: string };

/**
 * The groups of pages the site serves, each a list of SitePaths.
 *
 * Adding a group here is what moves its pages; the shape stays the same.
 */
export const SITE_GROUPS = {
  /** /blog, its feed (/blog/rss.xml), categories, authors and posts. */
  blog: ["/blog"],
  /** /compare and /compare/<slug>, their Open Graph images and sitemap. */
  compare: ["/compare"],
  /** QR codes by industry: /qr-codes-for and its topic pages. */
  industries: ["/qr-codes-for"],
  /** QR codes by placement: /qr-codes-on and its topic pages. */
  placements: ["/qr-codes-on"],
  /** The QR code generators by type: /qr-code-generator and its type pages. */
  generators: ["/qr-code-generator"],
  /** The barcode generator: /barcode-generator and its format pages. */
  barcodes: ["/barcode-generator"],
  /** How QRdx keeps codes safe and working: /security and /guarantee. */
  trust: ["/security", "/guarantee"],
  /** The browser and design-tool plugins: /plugins. */
  plugins: ["/plugins"],
  /** The legal pages: /legal/<page>. */
  legal: ["/legal"],
  /** What's new: /changelogs (its pictures stay here, at /changelog/…). */
  changelog: ["/changelogs"],
  /** The free tools: /tools and its tools (bulk, print size, scan checker). */
  tools: ["/tools"],
  /** The product pages. */
  products: [
    "/dynamic-qr-code",
    "/qr-code-api",
    "/open-source-qr-code-generator",
  ],
  /** /enterprise and its contact form (which posts to this app's API). */
  enterprise: ["/enterprise"],
  /** /pricing (/pricing.md, its Markdown copy, stays here). */
  pricing: ["/pricing"],
  /**
   * The integrations directory and each integration's page, with their
   * Open Graph images. /integrations/slack/link (an app page) and the
   * integrations' logos (/integrations/<name>.svg) stay here.
   */
  integrations: [
    { path: "/integrations" },
    { path: "/integrations/*" },
    { path: "/integrations/*/opengraph-image*" },
    { path: "/integrations/*/twitter-image*" },
  ],
  /**
   * The templates gallery and its Open Graph images. The templates' own
   * pages (/templates/<type>/…) stay here.
   */
  templates: [
    { path: "/templates" },
    { path: "/templates/opengraph-image*" },
    { path: "/templates/twitter-image*" },
  ],
} as const satisfies Record<string, readonly SitePath[]>;

export type SiteGroup = keyof typeof SITE_GROUPS;

/**
 * The site's own sitemaps, for the groups whose pages it lists itself (it
 * decides which of them exist: posts, comparisons, topics, generator and
 * barcode types). While the site serves one of these groups, the main
 * app's sitemap leaves its pages out and robots.txt names this one. Every
 * other group's pages stay in the main app's sitemap, at the same URLs,
 * whichever app serves them.
 */
export const SITE_SITEMAPS: Partial<Record<SiteGroup, string>> = {
  blog: "/blog/sitemap.xml",
  compare: "/compare/sitemap.xml",
  industries: "/qr-codes-for/sitemap.xml",
  placements: "/qr-codes-on/sitemap.xml",
  generators: "/qr-code-generator/sitemap.xml",
  barcodes: "/barcode-generator/sitemap.xml",
};

/** Every group, in the order their rewrites are listed. */
export const SITE_GROUP_NAMES = Object.keys(
  SITE_GROUPS
) as readonly SiteGroup[];

/** The site's assetPrefix: its build assets live under it on qrdx.dev. */
export const SITE_ASSET_PREFIX = "/site-static";

/**
 * The request header the main app's proxy.ts sets on the site's pages and
 * assets, from SITE_ZONE_KEY, after dropping any copy the browser sent. A
 * header of its own, never the console's (x-qrdx-zone-key): a site request
 * never carries the console's key, and a console request never carries the
 * site's. The site answers requests without it however it sees fit (a
 * redirect to qrdx.dev keeps its own address out of search results).
 */
export const SITE_KEY_HEADER = "x-qrdx-site-key";

/**
 * The request header the main app's proxy.ts sets on the site's pages and
 * assets with the visitor's country (two capital letters), read from the
 * main app's own geo headers, after dropping any copy the browser sent. The
 * site can't count on the hosting platform's geo headers describing the
 * visitor on a proxied request, so its pages that depend on the country
 * (/pricing's currency) read this one. Absent when the main app has none
 * (local development, self-hosting without a geo-aware proxy).
 *
 * The main app must never read or trust it: only requests proxied to the
 * site have a browser's copy replaced, and on every other path a browser can
 * send any value (apps/app/tests/repo/visitor-country-header.test.ts fails
 * on a reader).
 */
export const SITE_COUNTRY_HEADER = "x-qrdx-visitor-country";

/** A next.config rewrite that only applies on the hosts given. */
export interface SiteRewrite {
  source: string;
  destination: string;
  has: { type: "host"; value: string }[];
}

export interface SiteZoneOptions {
  /**
   * The host condition's value: a regex of QRdx's own hosts (next.config's
   * PLATFORM_HOSTS). Customers' domains never reach the site.
   */
  hosts: string;
  /** The groups that are on (siteZoneGroups); every group by default. */
  groups?: readonly SiteGroup[];
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
 * Whether `value` can be SITE_ORIGIN: an origin and nothing else (no path,
 * query, hash or credentials; trailing slashes are fine), over https, or
 * over http on localhost for local development.
 */
export function isSiteOrigin(value: string): boolean {
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

export function isSiteGroup(name: string): name is SiteGroup {
  return Object.hasOwn(SITE_GROUPS, name);
}

/**
 * The groups SITE_ZONE_GROUPS names ("blog,compare"), in list order and
 * each once; every group when it's unset or blank. Null when a name isn't
 * a group: env.ts refuses the value then, naming the variable.
 */
export function parseSiteZoneGroups(
  value: string | undefined
): SiteGroup[] | null {
  if (value === undefined || value.trim() === "") return [...SITE_GROUP_NAMES];
  const names = value.split(",").map((name) => name.trim());
  if (!names.every(isSiteGroup)) return null;
  return SITE_GROUP_NAMES.filter((group) => names.includes(group));
}

/** Whether `value` can be SITE_ZONE_GROUPS. */
export function isSiteZoneGroups(value: string): boolean {
  return parseSiteZoneGroups(value) !== null;
}

/**
 * The groups that are on, for a SITE_ZONE_GROUPS that env.ts has accepted.
 * Throws on anything else, so next.config.ts and proxy.ts never disagree
 * about a value one of them couldn't read.
 */
export function siteZoneGroups(value: string | undefined): SiteGroup[] {
  const groups = parseSiteZoneGroups(value);
  if (!groups) {
    throw new Error(
      `SITE_ZONE_GROUPS must name groups from: ${SITE_GROUP_NAMES.join(", ")}`
    );
  }
  return groups;
}

/** The rewrite source for a prefix: the page and everything under it. */
function sourceFor(prefix: string): string {
  return prefix === "/" ? "/" : `${prefix}/:path*`;
}

/**
 * A group prefix's sources: the page itself, exactly, then everything below
 * it. With one `${prefix}/:path*` rule, Vercel forwards the bare prefix as
 * `${prefix}/` (an empty :path* keeps the slash), and a zone that redirects
 * trailing slashes sends it straight back: /blog looped that way on
 * 2026-11-15. The exact rule keeps the address as it was asked for.
 */
function pageSourcesFor(prefix: string): string[] {
  return prefix === "/" ? ["/"] : [prefix, `${prefix}/:path+`];
}

/** What a wildcard matches: anything but a slash or a dot. */
const WILDCARD = "[^/.]";

/** One segment of a `{ path }` entry: its literal text, and whether a wildcard follows. */
interface PathSegment {
  literal: string;
  wild: boolean;
}

function segmentsOf(path: string): PathSegment[] {
  return path
    .split("/")
    .slice(1)
    .map((segment) =>
      segment.endsWith("*")
        ? { literal: segment.slice(0, -1), wild: true }
        : { literal: segment, wild: false }
    );
}

/** A wildcard segment's pattern: its literal text, then the wildcard. */
function wildPattern({ literal }: PathSegment): string {
  return literal === "" ? `${WILDCARD}+` : `${literal}${WILDCARD}*`;
}

/**
 * A `{ path }` entry's rewrite source and destination path: each wildcard
 * segment becomes a named parameter (:p1, :p2, …) with its pattern, and the
 * destination passes it on as it came. Segments are lower-case letters,
 * digits and hyphens (tests/lib/site-zone.test.ts), so nothing needs
 * escaping.
 */
function pathRule(path: string): { source: string; destination: string } {
  let count = 0;
  const source: string[] = [];
  const destination: string[] = [];
  for (const segment of segmentsOf(path)) {
    if (!segment.wild) {
      source.push(segment.literal);
      destination.push(segment.literal);
      continue;
    }
    count++;
    source.push(`:p${count}(${wildPattern(segment)})`);
    destination.push(`:p${count}`);
  }
  return {
    source: `/${source.join("/")}`,
    destination: `/${destination.join("/")}`,
  };
}

/**
 * Whether `pathname` is a `{ path }` entry's path, without regard to case
 * (as Next matches rewrites), segment by segment.
 */
function atPath(pathname: string, path: string): boolean {
  const segments = segmentsOf(path);
  const parts = pathname.split("/").slice(1);
  if (parts.length !== segments.length) return false;
  return segments.every((segment, index) => {
    const part = parts[index] ?? "";
    if (!segment.wild) return part.toLowerCase() === segment.literal;
    return new RegExp(`^${wildPattern(segment)}$`, "i").test(part);
  });
}

/** The rewrites one SitePath needs: its sources, each with its destination path. */
function rulesFor(entry: SitePath): { source: string; destination: string }[] {
  if (typeof entry !== "string") return [pathRule(entry.path)];
  return pageSourcesFor(entry).map((source) => ({
    source,
    destination: source,
  }));
}

/**
 * The main app's beforeFiles rewrites that send the groups' pages and the
 * site's build assets to the site at `origin` (its origin is used, so a
 * stray path or query can't end up in the destinations). None while
 * `origin` is unset or empty, or no group is on: the main app keeps serving
 * its own pages.
 *
 * A prefix fills whole segments, so /blogx never matches, and the rules
 * carry no cache or policy of their own: the zone's responses do.
 */
export function siteZoneRewrites(
  origin: string | undefined,
  { hosts, groups = SITE_GROUP_NAMES }: SiteZoneOptions
): SiteRewrite[] {
  if (!origin || groups.length === 0) return [];
  const zone = new URL(origin).origin;
  const has = [{ type: "host" as const, value: hosts }];
  const rules = [
    ...SITE_GROUP_NAMES.filter((group) => groups.includes(group)).flatMap(
      (group) => (SITE_GROUPS[group] as readonly SitePath[]).flatMap(rulesFor)
    ),
    {
      source: sourceFor(SITE_ASSET_PREFIX),
      destination: sourceFor(SITE_ASSET_PREFIX),
    },
  ];
  return rules.map(({ source, destination }) => ({
    source,
    destination: `${zone}${destination}`,
    has,
  }));
}

/**
 * Whether `pathname` is `prefix` or below it, without regard to case (Next
 * matches beforeFiles rewrites that way: it never passes them
 * experimental.caseSensitiveRoutes). "/" matches the home page alone.
 */
function underPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  if (pathname.length < prefix.length) return false;
  const head = pathname.slice(0, prefix.length);
  if (head.toLowerCase() !== prefix) return false;
  const next = pathname[prefix.length];
  return next === undefined || next === "/";
}

/** Whether a SitePath covers `pathname`, without regard to case. */
function covers(entry: SitePath, pathname: string): boolean {
  return typeof entry === "string"
    ? underPrefix(pathname, entry)
    : atPath(pathname, entry.path);
}

/**
 * The group `pathname` belongs to (a page at one of its paths or below a
 * prefix), or null. `groups` narrows it to the groups that are on.
 */
export function siteGroup(
  pathname: string,
  groups: readonly SiteGroup[] = SITE_GROUP_NAMES
): SiteGroup | null {
  for (const group of SITE_GROUP_NAMES) {
    if (!groups.includes(group)) continue;
    const entries: readonly SitePath[] = SITE_GROUPS[group];
    if (entries.some((entry) => covers(entry, pathname))) {
      return group;
    }
  }
  return null;
}

/**
 * Whether the site serves `pathname` once SITE_ORIGIN is set: a page of one
 * of the groups that are on, or the site's build assets.
 *
 * Links from the main app into the site must be plain <a> elements (a full
 * page load): next/link would try to load the site's page in this app.
 */
export function isSitePath(
  pathname: string,
  groups: readonly SiteGroup[] = SITE_GROUP_NAMES
): boolean {
  // With no group on there are no rewrites, the assets' included.
  if (groups.length === 0) return false;
  return (
    siteGroup(pathname, groups) !== null ||
    underPrefix(pathname, SITE_ASSET_PREFIX)
  );
}

/**
 * Whether `href` is a page the site serves: a group's page (/blog, /blog/…,
 * /templates), with any query or hash. External and relative hrefs never
 * are. Links into the site must be plain <a> elements (a full page load):
 * next/link would try to load the site's page in this app. Both apps serve
 * these URLs, so that holds with SITE_ORIGIN set or not.
 */
export function isSitePagePath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return siteGroup(path) !== null;
}

/**
 * The first segment of every SitePath, and the site's asset prefix: what
 * proxy.ts's matcher lists in any casing (tests/lib/site-zone.test.ts
 * checks it does).
 */
export function siteMatcherPrefixes(): string[] {
  const firsts = SITE_GROUP_NAMES.flatMap((group) =>
    (SITE_GROUPS[group] as readonly SitePath[]).map((entry) => {
      const path = typeof entry === "string" ? entry : entry.path;
      return `/${path.split("/")[1] ?? ""}`;
    })
  );
  return [...new Set([...firsts, SITE_ASSET_PREFIX])].filter(
    (prefix) => prefix !== "/"
  );
}

/**
 * `pathname` with a `{ path }` entry's literal text lower-cased (a
 * wildcard's own part keeps its case), when the entry covers it.
 */
function lowerCasedAtPath(pathname: string, path: string): string {
  const segments = segmentsOf(path);
  const parts = pathname.split("/").slice(1);
  return `/${parts
    .map((part, index) => {
      const literal = segments[index]?.literal ?? "";
      return `${part.slice(0, literal.length).toLowerCase()}${part.slice(literal.length)}`;
    })
    .join("/")}`;
}

/**
 * `pathname` with its site prefix or path (/blog, /templates,
 * /site-static, …) lower-cased, or null when it already is (or there's
 * none). The rewrites match /BLOG/… too, but proxy.ts matchers and the
 * pages don't, so the proxy sends any other casing to the lower-case path
 * before anything reaches the site. Every group's paths, on or off: they
 * were 404s before.
 */
export function lowerCasedSitePrefix(pathname: string): string | null {
  const entries: SitePath[] = [
    ...SITE_GROUP_NAMES.flatMap(
      (group) => SITE_GROUPS[group] as readonly SitePath[]
    ),
    SITE_ASSET_PREFIX,
  ].filter((entry) => entry !== "/");
  for (const entry of entries) {
    if (!covers(entry, pathname)) continue;
    const lowered =
      typeof entry === "string"
        ? `${entry}${pathname.slice(entry.length)}`
        : lowerCasedAtPath(pathname, entry.path);
    return lowered === pathname ? null : lowered;
  }
  return null;
}
