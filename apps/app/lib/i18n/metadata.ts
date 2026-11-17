// Metadata for translated pages: a self-referencing canonical per language,
// hreflang alternates for every indexable language plus x-default, og:locale
// with its alternates, and `noindex, follow` until a native reviewer signs
// the language off (packages/i18n/review.ts).
//
// Only pages that exist in other languages (LOCALIZED_PATHS) get any of
// that. The English-only marketing pages under app/[lang] (packages/i18n/
// paths.ts ENGLISH_ONLY_PATHS) get plain English metadata: their canonical
// English URL, no hreflang, and no noindex whatever the review table says.

import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from "@repo/i18n/config";
import { isLocalizedPath, localizePath } from "@repo/i18n/paths";
import {
  isPublished,
  publishedLocales,
  REVIEW,
  type ReviewTable,
} from "@repo/i18n/review";
import type { Metadata } from "next";
import { baseUrl, createMetadata } from "@/lib/metadata";

const absolute = (path: string) => new URL(path, baseUrl).toString();

/**
 * The languages whose version of `path` may be indexed, English first:
 * English alone for a page that isn't translated.
 */
export function indexableLocales(
  path: string,
  review: ReviewTable = REVIEW,
): Locale[] {
  return isLocalizedPath(path)
    ? publishedLocales(path, review)
    : [DEFAULT_LOCALE];
}

/**
 * hreflang alternates for a translated page, keyed by hreflang value, with
 * x-default on the English URL. Undefined while no other language is
 * indexable (a set that names only English says nothing), and always for a
 * page that isn't translated.
 */
export function alternateLanguages(
  path: string,
  review: ReviewTable = REVIEW,
): Record<string, string> | undefined {
  const locales = indexableLocales(path, review);
  if (locales.length < 2) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    for (const tag of LOCALE_INFO[locale].hreflang) {
      languages[tag] = absolute(localizePath(path, locale));
    }
  }
  languages["x-default"] = absolute(path);
  return languages;
}

export interface LocalizedMetadataInput extends Metadata {
  locale: Locale;
  /** The page's English path, e.g. "/pricing". */
  path: string;
  /** Set when the segment has its own opengraph-image.tsx (see createMetadata). */
  ownOgImage?: boolean;
  /** For tests: the review table to apply. */
  review?: ReviewTable;
}

export function localizedMetadata({
  locale,
  path,
  review = REVIEW,
  ...override
}: LocalizedMetadataInput): Metadata {
  const metadata = createMetadata({
    ...override,
    path: localizePath(path, locale),
  });
  // An English-only page in another language only renders where its
  // redirect doesn't run (a host that isn't QRdx's): never indexed there.
  const published = isLocalizedPath(path)
    ? isPublished(locale, path, review)
    : locale === DEFAULT_LOCALE;
  // A page that may not be indexed claims no translations, and indexable
  // pages never point at it.
  const languages = published ? alternateLanguages(path, review) : undefined;
  const alternateLocales = languages
    ? indexableLocales(path, review)
        .filter((other) => other !== locale)
        .map((other) => LOCALE_INFO[other].ogLocale)
    : [];

  return {
    ...metadata,
    ...(!published && { robots: { index: false, follow: true } }),
    alternates: {
      ...metadata.alternates,
      ...(languages && { languages }),
    },
    openGraph: {
      ...metadata.openGraph,
      locale: LOCALE_INFO[locale].ogLocale,
      ...(alternateLocales.length > 0 && { alternateLocale: alternateLocales }),
    },
  };
}
