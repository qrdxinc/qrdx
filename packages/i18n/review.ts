// Native review gate (owner decision, 2 Nov 2026). Machine translations ship,
// but search engines don't see them until a native speaker signs off:
// until then a locale's pages are `noindex, follow`, left out of the sitemap
// and left out of every page's hreflang alternates (an hreflang link to a
// noindex page is an error).
//
// The state is each locale's `review` in config.ts: set it to "reviewed" and
// all three turn on at the next deploy. A list of paths opens only those
// pages. `bun run --filter app i18n:check` fails if a locale marked
// "reviewed" still has missing, machine or stale strings
// (apps/app/messages/review/<locale>.json).
//
// One exception, INDEXED_MACHINE_PATHS (owner decision, 23 Nov 2026): the
// QR code generators are indexed in every language, machine-made or not,
// for search traffic in other languages. Every other page keeps its
// locale's state (the playground, /ai, /mcp and /scan among them), the
// barcode generators too (owner decision, 25 Nov 2026: tiered indexing).
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  type ReviewState,
  TRANSLATED_LOCALES,
  type TranslatedLocale,
} from "./config";
import { routeMatcher } from "./paths";

export type { ReviewState } from "./config";

export type ReviewTable = Record<TranslatedLocale, ReviewState>;

export const REVIEW = Object.fromEntries(
  TRANSLATED_LOCALES.map((locale) => [locale, LOCALE_INFO[locale].review])
) as ReviewTable;

/**
 * Pages whose machine translations search engines may index (owner
 * decision, 23 Nov 2026, overriding the gate above for these pages alone):
 * the QR code generators, which the site zone serves in every language
 * (paths.ts SITE_TRANSLATED_PATHS), so that people searching in other
 * languages can find them. Written like the route paths in
 * localized-paths.json; nothing else is added here without the owner.
 *
 * Not the barcode generators (owner decision, 25 Nov 2026: tiered
 * indexing). Their translated URLs redirected to English while the site's
 * group for them (barcodes-i18n) was off, yet the site's sitemap and every
 * English barcode page's hreflang listed them. Left out here, they follow
 * their languages' review state like any other page: out of the sitemaps
 * and hreflang, and `noindex, follow` if the site serves them, until the
 * owner decides to index them.
 */
export const INDEXED_MACHINE_PATHS: readonly string[] = [
  "/qr-code-generator",
  "/qr-code-generator/[type]",
];

const INDEXED_MACHINE_MATCHERS = INDEXED_MACHINE_PATHS.map(routeMatcher);

/** Whether `path` is indexed in every language, reviewed or not. */
export function isIndexedWhenMachine(path: string): boolean {
  return INDEXED_MACHINE_MATCHERS.some((matches) => matches(path));
}

/** True when `path` in `locale` may be indexed (English always may). */
export function isPublished(
  locale: Locale,
  path: string,
  review: ReviewTable = REVIEW
): boolean {
  if (locale === DEFAULT_LOCALE) return true;
  if (isIndexedWhenMachine(path)) return true;
  const state = review[locale];
  if (state === "reviewed") return true;
  if (state === "machine") return false;
  return state.includes(path);
}

/** The locales whose version of `path` is indexable, English first. */
export function publishedLocales(
  path: string,
  review: ReviewTable = REVIEW
): Locale[] {
  return LOCALES.filter((locale) => isPublished(locale, path, review));
}
