// The docs' URLs. Client-safe: no server imports.
//
// The docs (apps/docs) are English only, at /docs/.... Until 17 Nov 2026
// they were also served under each language's segment (/es/docs/...,
// /pt-br/docs/...); those URLs now redirect to the English page
// (translatedDocsRedirects).
import { LOCALE_INFO, TRANSLATED_LOCALES } from "./config";

/** "/docs" and "/docs/…", the paths of docs pages. */
export function isDocsPath(path: string): boolean {
  return path === "/docs" || path.startsWith("/docs/");
}

/**
 * The URL segments the translated docs lived under (es|pt-br|…): every
 * language's but English's.
 */
export function formerDocsSegments(): string[] {
  return TRANSLATED_LOCALES.map((locale) => LOCALE_INFO[locale].segment);
}

/**
 * "/es/docs/a" → "/docs/a", for a path recorded while the docs had
 * translations (a link someone kept, a page an open tab reports). Other
 * paths come back as they are.
 */
export function englishDocsPath(url: string): string {
  const match = /^\/([^/]+)(\/docs(?:\/.*)?)$/.exec(url);
  return match && formerDocsSegments().includes(match[1] as string)
    ? (match[2] as string)
    : url;
}

/** A next.config redirect: `has` as Next takes it. */
export interface DocsRedirect {
  source: string;
  destination: string;
  permanent: boolean;
  has?: RouteCondition[];
}

/**
 * next.config.ts redirects for the docs URLs of the other languages: each
 * goes to the same page in English, keeping its path and query.
 *
 *   /es/docs                  → /docs
 *   /pt-br/docs/help/faq      → /docs/help/faq
 *   /zh-hans/docs/angular.md  → /docs/angular.md   (.mdx too, and /es/docs.md)
 *   /docs-md/es/teams         → /docs/teams.md     (the old Markdown route)
 *
 * Permanent (308) on a site that serves the docs itself: the translated
 * docs are gone for good. Redirects run before rewrites, so the main app
 * answers these itself and never proxies them to the docs site. `origin`
 * sends them to another site's docs (qrdx.dev, for a deployment without a
 * docs site); those stay temporary (307), like docsOriginRedirects(), so a
 * deployment that later gets a docs site serves them itself.
 */
export function translatedDocsRedirects(
  options: {
    /** Where the English docs are, without a trailing slash; this site by default. */
    origin?: string;
    /** Conditions every rule carries (the main app's own hosts). */
    has?: RouteCondition[];
    /** The language segments; formerDocsSegments() unless a test passes its own. */
    segments?: readonly string[];
  } = {}
): DocsRedirect[] {
  const segments = options.segments ?? formerDocsSegments();
  if (segments.length === 0) return [];
  const target = withoutTrailingSlashes(options.origin ?? "");
  const lang = `:lang(${segments.join("|")})`;
  return [
    { source: `/${lang}/docs`, destination: "/docs" },
    { source: `/${lang}/docs.md`, destination: "/docs.md" },
    { source: `/${lang}/docs.mdx`, destination: "/docs.mdx" },
    { source: `/${lang}/docs/:path*`, destination: "/docs/:path*" },
    { source: `/docs-md/${lang}`, destination: "/docs.md" },
    { source: `/docs-md/${lang}/:path+`, destination: "/docs/:path+.md" },
  ].map(({ source, destination }) => ({
    source,
    destination: `${target}${destination}`,
    permanent: !options.origin,
    ...(options.has && { has: options.has }),
  }));
}

// ─── The docs zone ───────────────────────────────────────────────────────────
// The docs are a separate Next.js app (apps/docs), served at the same
// URLs on qrdx.dev. The main app proxies the docs' URLs to it with
// docsZoneRewrites() when DOCS_ZONE_URL is set. Without it (self-hosting,
// local development without the docs site), docsOriginRedirects() sends
// them to the same paths on qrdx.dev. The manifest the zones exchange is in
// @repo/next-config/docs-zone.

/** A next.config rewrite: `has` and `missing` as Next takes them. */
export interface ZoneRewrite {
  source: string;
  destination: string;
  has?: RouteCondition[];
  missing?: RouteCondition[];
}

export type RouteCondition =
  | { type: "header" | "cookie" | "query"; key: string; value?: string }
  | { type: "host"; key?: undefined; value: string };

export interface DocsZoneOptions {
  /**
   * What makes a request one for Markdown (`Accept: text/markdown` on the
   * main app's own hosts). Those rules come first, so an agent asking for
   * Markdown at a page's URL gets the page's Markdown, as it does today.
   */
  markdown: { has: RouteCondition[]; missing?: RouteCondition[] };
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

/**
 * The main app's beforeFiles rewrites that send the docs to the zone at
 * `zoneUrl` (no trailing slash): the pages and their Markdown versions, the docs' Open Graph images, search, llms-full.txt and
 * the zone's own build assets (its assetPrefix, /docs-static). None when
 * `zoneUrl` is unset: docsOriginRedirects() covers the same URLs then.
 *
 * The .md and .mdx URLs go to the zone as they are; the zone's own
 * next.config maps them to its Markdown routes.
 */
export function docsZoneRewrites(
  zoneUrl: string | undefined,
  options: DocsZoneOptions
): ZoneRewrite[] {
  if (!zoneUrl) return [];
  const zone = withoutTrailingSlashes(zoneUrl);

  const markdown: ZoneRewrite[] = [
    { source: "/docs", destination: `${zone}/llms.mdx` },
    { source: "/docs/:path+", destination: `${zone}/llms.mdx/:path+` },
  ].map((rule) => ({
    ...rule,
    has: options.markdown.has,
    ...(options.markdown.missing && { missing: options.markdown.missing }),
  }));

  const pages: ZoneRewrite[] = [
    { source: "/docs", destination: `${zone}/docs` },
    { source: "/docs.md", destination: `${zone}/docs.md` },
    { source: "/docs.mdx", destination: `${zone}/docs.mdx` },
    { source: "/docs/:path*", destination: `${zone}/docs/:path*` },
  ];

  const routes: ZoneRewrite[] = [
    "/llms.mdx/:path*",
    "/og/docs/:path*",
    "/api/search",
    "/llms-full.txt",
    "/docs-static/:path*",
  ].map((source) => ({ source, destination: `${zone}${source}` }));

  return [...markdown, ...pages, ...routes];
}

/**
 * The main app's redirects when it has no docs site (DOCS_ZONE_URL unset):
 * every docs URL docsZoneRewrites() would proxy, as a page and as Markdown,
 * plus llms-full.txt and the docs' Open Graph images, goes to the same path
 * at `origin` (qrdx.dev), keeping its query. The other languages' docs URLs
 * go straight to the English page there
 * (translatedDocsRedirects({ origin })). Temporary (307), so a
 * deployment that later gets a docs site serves them itself. Not
 * /api/search, which answers 404 instead (the command menu leaves docs out
 * then), nor /docs-static, which only the docs site's pages load.
 */
export function docsOriginRedirects(
  origin: string,
  options: {
    /** Conditions every rule carries (the main app's own hosts). */
    has?: RouteCondition[];
  } = {}
): DocsRedirect[] {
  const target = withoutTrailingSlashes(origin);
  const sources = [
    "/docs",
    "/docs.md",
    "/docs.mdx",
    "/docs/:path*",
    "/llms.mdx/:path*",
    "/og/docs/:path*",
    "/llms-full.txt",
  ];
  return sources.map((source) => ({
    source,
    destination: `${target}${source}`,
    permanent: false,
    ...(options.has && { has: options.has }),
  }));
}

/**
 * Whether `href` is a docs page: /docs or /docs/…. Not their .md or .mdx
 * versions, which are files rather than pages. Query and hash are ignored;
 * external and relative hrefs are never docs pages.
 *
 * Links between the zones must be plain <a> elements (a full page load):
 * next/link would try to load the other zone's page in this app.
 */
export function isDocsPagePath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (path.endsWith(".md") || path.endsWith(".mdx")) return false;
  return isDocsPath(path);
}
