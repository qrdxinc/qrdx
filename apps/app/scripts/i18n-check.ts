// bun run --filter app i18n:check [--verbose]   (CI, next to tsc and biome)
//
// Every catalog in packages/i18n/config.ts (messages/<locale>.json) against
// English. Errors (exit 1): a missing catalog file, keys English doesn't
// have, changed ICU arguments or tags, dropped numbers, and, in a locale
// marked "reviewed", any missing, unrecorded, machine or stale string.
// Warnings (listed with --verbose): the same gaps in a locale that isn't
// reviewed yet, where they show in English and the pages stay noindex.
//
// The content catalogs (copy in TypeScript data, lib/i18n/content.ts) get
// the same treatment: messages/content/<locale>.json against the English
// in lib/i18n/content-sources.ts, numbers checked, gaps warned about.
//
// Fill gaps with `bun run --filter app i18n:translate --locale <locale>`, or
// translate by hand and record it with `i18n:translate --record`.
import "./i18n-env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { REVIEW } from "@repo/i18n/review";
import {
  type Catalog,
  checkContent,
  checkLocale,
  type ReviewFile,
} from "@/lib/i18n/catalog";
import type { TranslationMemory } from "@/lib/i18n/content";
import { contentEnglish } from "@/lib/i18n/content-sources";
import { icuShape } from "@/lib/i18n/icu";

const VERBOSE = process.argv.includes("--verbose");

const MESSAGES = path.join(__dirname, "../messages");
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T;

const errors: string[] = [];
const warnings: string[] = [];
const english = read<Catalog>("en.json");
// The docs' own copy (`docs`) is English only, like the docs: it has no
// translations, and a translated catalog that holds one fails as a key
// English doesn't have.
const { docs: _docs, ...translatable } = english;

// The source itself must parse.
const walk = (catalog: Catalog, prefix = "") => {
  for (const [key, value] of Object.entries(catalog)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value !== "string") walk(value, keyPath);
    else {
      try {
        icuShape(value);
      } catch (error) {
        errors.push(`en: ${keyPath}: ${(error as Error).message}`);
      }
    }
  }
};
walk(english);

for (const locale of TRANSLATED_LOCALES) {
  if (!existsSync(path.join(MESSAGES, `${locale}.json`))) {
    errors.push(
      `messages/${locale}.json is missing (start it with {} and translate)`,
    );
    continue;
  }
  // Written by i18n:translate; a hand translation records it with --record.
  const reviewFile = `review/${locale}.json`;
  const reviewEntries = existsSync(path.join(MESSAGES, reviewFile))
    ? read<ReviewFile>(reviewFile)
    : {};
  const report = checkLocale({
    locale,
    english: translatable,
    catalog: read<Catalog>(`${locale}.json`),
    review: reviewEntries,
    state: REVIEW[locale],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { keys, machine, reviewed, stale, missing } = report.counts;
  const review = REVIEW[locale];
  const state =
    typeof review === "string"
      ? review
      : `reviewed pages: ${review.join(", ")}`;
  console.log(
    `${locale.padEnd(8)} ${state.padEnd(9)} ${keys} strings: ${reviewed} reviewed, ${machine} machine, ${stale} stale, ${missing} missing`,
  );
}

// Content: one translation memory per locale, against the sources' English.
const contentStrings = contentEnglish();
for (const locale of TRANSLATED_LOCALES) {
  const file = `content/${locale}.json`;
  const memory = existsSync(path.join(MESSAGES, file))
    ? read<TranslationMemory>(file)
    : {};
  const report = checkContent({
    locale,
    english: contentStrings,
    memory,
    state: REVIEW[locale],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { strings, machine, reviewed, missing, unused } = report.counts;
  console.log(
    `${locale.padEnd(8)} content   ${strings} strings: ${reviewed} reviewed, ${machine} machine, ${missing} missing, ${unused} unused`,
  );
}

if (VERBOSE)
  for (const warning of warnings) console.warn(`warning: ${warning}`);
else if (warnings.length > 0) {
  console.warn(
    `${warnings.length} warning(s) in locales not reviewed yet; --verbose lists them.`,
  );
}
if (errors.length > 0) {
  for (const error of errors.slice(0, 50)) console.error(`error: ${error}`);
  if (errors.length > 50) console.error(`…and ${errors.length - 50} more`);
  console.error(
    "\nFix the strings above. For missing or stale ones: `bun run --filter app i18n:translate --locale <locale>` (CONTRIBUTING.md, Translating QRdx).",
  );
  process.exit(1);
}
console.log("i18n catalogs OK");
