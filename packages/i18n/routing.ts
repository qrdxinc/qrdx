// next.config.ts routing for translated pages (no middleware: the proxy
// never runs for public pages). English keeps its unprefixed URLs, which are
// rewritten to `[lang]=en` in the router, so the prerendered HTML is served
// as is. /en and /en/... redirect to the unprefixed URL, so English has one
// address. Short links (/q, /p, /m), the API and docs are never localized.
//
// The marketing pages under app/[lang] that are English only (paths.ts
// ENGLISH_ONLY_PATHS) keep their English rewrites, and their translated URLs
// redirect to the English page (englishOnlyRedirects), except the pages the
// site zone serves in every language while its group for them is on.
//
// next.config.ts imports this module (and docs.ts) from the package itself:
// Next compiles the config with the app's tsconfig paths, and a file in a
// subfolder of the app that imports @repo/* can't be resolved there.
import { LOCALE_INFO, TRANSLATED_LOCALES } from "./config";
import { ENGLISH_ONLY_PATHS, LOCALIZED_PATHS } from "./paths";

const EN = `/${LOCALE_INFO.en.segment}`;

/**
 * A route path in next.config.ts syntax: "/compare/[slug]" →
 * "/compare/:slug([^/.]+)", "[...slug]" → ":slug+", "[[...slug]]" →
 * ":slug*". A single segment never contains a dot, so files in public/
 * that share the prefix (/integrations/zapier.svg) aren't rewritten: these
 * rules run before the filesystem.
 */
export function rewriteSource(route: string): string {
  return route
    .replace(/\[\[\.\.\.([^/[\]]+)\]\]/g, ":$1*")
    .replace(/\[\.\.\.([^/[\]]+)\]/g, ":$1+")
    .replace(/\[([^/[\]]+)\]/g, ":$1([^/.]+)");
}

/** A rule's destination: the source's params by name, without their patterns. */
const destinationOf = (source: string) => source.replace(/\([^)]*\)/g, "");

/**
 * /pricing → /en/pricing, /compare/:slug → /en/compare/:slug (beforeFiles):
 * every page under app/[lang], translated or English only.
 */
export function englishRewrites(): { source: string; destination: string }[] {
  return [...LOCALIZED_PATHS, ...ENGLISH_ONLY_PATHS].map((path) => {
    const source = rewriteSource(path);
    const target = destinationOf(source);
    return { source, destination: target === "/" ? EN : `${EN}${target}` };
  });
}

/**
 * /en → /, /en/pricing → /pricing (308), on QRdx's own hosts only: on a
 * customer's domain /en is a short link. A page's Open Graph image lives
 * under its route (/en/pricing/opengraph-image-…) and isn't redirected.
 */
export function englishRedirects(platformHosts: string) {
  const has = [{ type: "host" as const, value: platformHosts }];
  return [
    { source: EN, destination: "/", permanent: true, has },
    {
      source: `${EN}/:path((?!.*(?:opengraph|twitter)-image).*)`,
      destination: "/:path",
      permanent: true,
      has,
    },
  ];
}

/** The translated languages' first segments, as one next.config.ts param. */
const TRANSLATED_SEGMENT = `:locale(${TRANSLATED_LOCALES.map(
  (locale) => LOCALE_INFO[locale].segment
).join("|")})`;

/**
 * The English-only pages' old translated URLs, to the English page with the
 * query kept: /es/pricing → /pricing, /ja/qr-code-generator/wifi?x=1 →
 * /qr-code-generator/wifi?x=1. The home page too: /es → / (where a
 * signed-in visitor goes on to the dashboard, as /es did) and /es/home →
 * /home (the logo's address, which never does).
 *
 * On QRdx's own hosts only: on a customer's domain /es is a short link.
 * Only the page URLs themselves; their Open Graph images under them aren't
 * linked from anywhere once the pages redirect.
 *
 * 307 for now: after a 7-day watch with no surprises, switch `permanent`
 * to true (308), as englishRedirects are.
 *
 * `except` leaves out pages whose translated URLs another app answers: the
 * site zone serves the generator pages in every language while its group
 * for them is on (paths.ts SITE_TRANSLATED_PATHS, owner decision, 23 Nov
 * 2026), so /es/qr-code-generator/wifi goes on to the site's rewrite
 * instead. Each must be one of ENGLISH_ONLY_PATHS, written the same way.
 */
export function englishOnlyRedirects(
  platformHosts: string,
  { except = [] }: { except?: readonly string[] } = {}
) {
  const unknown = except.filter((path) => !ENGLISH_ONLY_PATHS.includes(path));
  if (unknown.length > 0) {
    throw new Error(
      `englishOnlyRedirects: not English-only pages: ${unknown.join(", ")}`
    );
  }
  const has = [{ type: "host" as const, value: platformHosts }];
  const redirected = ENGLISH_ONLY_PATHS.filter(
    (path) => !except.includes(path)
  );
  const pages = redirected.map((path) => {
    const source = rewriteSource(path);
    return {
      source:
        path === "/"
          ? `/${TRANSLATED_SEGMENT}`
          : `/${TRANSLATED_SEGMENT}${source}`,
      destination: destinationOf(source),
      permanent: false,
      has,
    };
  });
  return [
    ...pages,
    {
      source: `/${TRANSLATED_SEGMENT}/home`,
      destination: "/home",
      permanent: false,
      has,
    },
  ];
}
