// Sitemap entries for a translated page (Google's sitemap form of hreflang):
// one <url> per indexable language, each with every language and x-default
// as xhtml:link alternates. Machine translations a native reviewer hasn't
// signed off are left out (packages/i18n/review.ts), and so are their
// alternates. A page that isn't translated (the English-only marketing
// pages) is one English entry without alternates.

import { DEFAULT_LOCALE } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import { REVIEW, type ReviewTable } from "@repo/i18n/review";
import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/metadata";
import { alternateLanguages, indexableLocales } from "./metadata";

type Entry = MetadataRoute.Sitemap[number];

/** Translations rank a little below the English page. */
const TRANSLATION_PRIORITY = 0.9;

export function localizedEntries(
  path: string,
  entry: Omit<Entry, "url" | "alternates">,
  review: ReviewTable = REVIEW,
): Entry[] {
  const languages = alternateLanguages(path, review);
  return indexableLocales(path, review).map((locale) => ({
    ...entry,
    url: new URL(localizePath(path, locale), baseUrl).toString(),
    ...(locale !== DEFAULT_LOCALE &&
      entry.priority !== undefined && {
        priority: Math.round(entry.priority * TRANSLATION_PRIORITY * 100) / 100,
      }),
    ...(languages && { alternates: { languages } }),
  }));
}
