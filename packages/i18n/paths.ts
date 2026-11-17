// Which pages exist in every language, and their URLs. Client-safe.
//
// A page is translated once it lives under apps/app/app/[lang] and its path
// is in localized-paths.json (apps/app/scripts/i18n-split-roots.mjs moves it
// there). Links to any other page stay unprefixed in every language: the
// docs (/docs/...), for one, are English only.
//
// The marketing pages are English only too (owner decision, 17 Nov 2026):
// they still live under app/[lang], listed as `englishOnly`, and render in
// English at their unprefixed URLs; their old translated URLs redirect there
// (routing.ts). Links to them never gain a prefix.

import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  type Locale,
  localeFromSegment,
} from "./config";
import localized from "./localized-paths.json";

/**
 * Translated pages, as their route paths. Dynamic segments are written the
 * way their folders are named: "/compare/[slug]" matches one segment there
 * ("/compare/qr-tiger"), "[...slug]" one or more, "[[...slug]]" none or
 * more. A slug that doesn't exist still 404s, in every language.
 */
export const LOCALIZED_PATHS: readonly string[] = localized.paths;

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "/compare/[slug]" → /^\/compare\/[^/]+$/; plain paths match only themselves. */
export function routeMatcher(route: string): (path: string) => boolean {
  if (!route.includes("[")) return (path) => path === route;
  const pattern = route
    .split("/")
    .map((segment, index) => {
      if (index === 0) return "";
      if (/^\[\[\.\.\.[^/[\]]+\]\]$/.test(segment)) return "(?:/[^?#]*)?";
      if (/^\[\.\.\.[^/[\]]+\]$/.test(segment)) return "/[^?#]+";
      // One segment, never a file name (public/integrations/zapier.svg).
      if (/^\[[^/[\].]+\]$/.test(segment)) return "/[^/.?#]+";
      return `/${escapeRegex(segment)}`;
    })
    .join("");
  const regex = new RegExp(`^${pattern || "/"}$`);
  return (path) => regex.test(path);
}

const MATCHERS = LOCALIZED_PATHS.map(routeMatcher);

export function isLocalizedPath(path: string): boolean {
  return MATCHERS.some((matches) => matches(path));
}

/**
 * Marketing pages under app/[lang] that exist in English only, as route
 * paths (written like LOCALIZED_PATHS). English serves them at their
 * unprefixed URLs (routing.ts englishRewrites); /es/pricing and the other
 * translated URLs they had redirect there (routing.ts englishOnlyRedirects).
 */
export const ENGLISH_ONLY_PATHS: readonly string[] = localized.englishOnly;

const ENGLISH_ONLY_MATCHERS = ENGLISH_ONLY_PATHS.map(routeMatcher);

export function isEnglishOnlyPath(path: string): boolean {
  return ENGLISH_ONLY_MATCHERS.some((matches) => matches(path));
}

/** "/playground" in Spanish → "/es/playground". English is unprefixed. */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !isLocalizedPath(path)) return path;
  const prefix = `/${LOCALE_INFO[locale].segment}`;
  return path === "/" ? prefix : `${prefix}${path}`;
}

/**
 * A link's href for a page in `locale`: prefixed only when the page exists
 * in that language. Keeps any query and hash; leaves external links,
 * mailto:, anchors and relative hrefs alone.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (
    locale === DEFAULT_LOCALE ||
    !href.startsWith("/") ||
    href.startsWith("//")
  ) {
    return href;
  }
  const end = href.search(/[?#]/);
  const path = end === -1 ? href : href.slice(0, end);
  const rest = end === -1 ? "" : href.slice(end);
  return `${localizePath(path, locale)}${rest}`;
}

/**
 * Splits a pathname into its language and the page's English path:
 * "/es/playground" → { locale: "es", path: "/playground" }, "/docs" →
 * English. Only translated pages carry a prefix.
 */
export function splitLocale(pathname: string): {
  locale: Locale;
  path: string;
} {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const locale = localeFromSegment(match?.[1]);
  // "/en/scan" too: the route an English page prerenders as, which is what
  // usePathname() says while it does, before the browser's "/scan". English
  // only pages prerender under /en as well ("/en" is the home page).
  if (match && locale) {
    const path = match[2] ?? "/";
    if (isLocalizedPath(path)) return { locale, path };
    if (locale === DEFAULT_LOCALE && isEnglishOnlyPath(path)) {
      return { locale, path };
    }
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}
