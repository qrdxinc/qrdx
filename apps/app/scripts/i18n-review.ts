// bun run --filter app i18n:review <locale> <key prefix>... [--dry-run]
//
// Records a native speaker's review: sets the status of every string under
// the prefixes to "reviewed" in messages/review/<locale>.json. A prefix is a
// namespace or a dotted part of a key (nav, app.signIn, auth.nudge) and
// covers that key and everything under it.
//
// Only a translated string whose review entry matches the current English is
// marked. Missing, unrecorded and stale strings are listed and left alone,
// and the script exits 1 after writing the ones it could mark. It changes
// nothing else: not the translations, not other locales, not the locale's
// `review` in packages/i18n/config.ts (publishing is a separate step, see
// CONTRIBUTING.md, Review and search engines). The file keeps its key order
// and formatting.
//
//   --dry-run   print what it would mark, write nothing
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, TRANSLATED_LOCALES } from "@repo/i18n/config";
import {
  type Catalog,
  formatJson,
  markReviewed,
  type ReviewFile,
} from "@/lib/i18n/catalog";

const MESSAGES = path.join(__dirname, "../messages");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const unknown = args.find((arg) => arg.startsWith("--") && arg !== "--dry-run");
if (unknown) fail(`Unknown option ${unknown}. The only option is --dry-run.`);
const [value, ...prefixes] = args.filter((arg) => !arg.startsWith("--"));
if (!value || prefixes.length === 0) {
  fail(
    "Usage: bun run --filter app i18n:review <locale> <key prefix>... [--dry-run]\n" +
      "Example: bun run --filter app i18n:review es nav footer",
  );
}
if (value === DEFAULT_LOCALE) {
  fail(`${DEFAULT_LOCALE} is the source language: it has nothing to review.`);
}
const locale =
  TRANSLATED_LOCALES.find((l) => l === value) ??
  fail(`Unknown locale "${value}". One of: ${TRANSLATED_LOCALES.join(", ")}`);

const read = (file: string): string | undefined =>
  existsSync(path.join(MESSAGES, file))
    ? readFileSync(path.join(MESSAGES, file), "utf8")
    : undefined;

const english = JSON.parse(
  readFileSync(path.join(MESSAGES, "en.json"), "utf8"),
) as Catalog;
// The docs' own copy (`docs`) is English only, as in i18n-check.ts.
const { docs: _docs, ...translatable } = english;
const reviewFile = `review/${locale}.json`;
const reviewText = read(reviewFile);
const review = JSON.parse(reviewText ?? "{}") as ReviewFile;

const report = markReviewed({
  english: translatable,
  catalog: JSON.parse(read(`${locale}.json`) ?? "{}") as Catalog,
  review,
  prefixes,
});
if (report.unmatched.length > 0) {
  fail(
    `No ${locale} string to review under ${report.unmatched.join(", ")}. A prefix is a namespace or a dotted part of a key in messages/en.json (nav, app.signIn).`,
  );
}
// Rewriting a file the scripts didn't write would change more than statuses.
if (reviewText !== undefined && formatJson(review) !== reviewText) {
  fail(
    `messages/${reviewFile} isn't formatted the way i18n:translate writes it (two-space JSON, a newline at the end), so nothing was written.`,
  );
}

if (DRY) for (const key of report.marked) console.log(`would mark ${key}`);
for (const { key, reason } of report.skipped) {
  console.warn(`skipped ${key}: ${reason}`);
}
if (!DRY && report.marked.length > 0) {
  writeFileSync(path.join(MESSAGES, reviewFile), formatJson(report.review));
}
console.log(
  `${locale}${DRY ? " (dry run, nothing written)" : ""}: ${DRY ? "would mark" : "marked"} ${report.marked.length}, already reviewed ${report.reviewed.length}, skipped ${report.skipped.length}`,
);
if (report.skipped.length > 0) {
  fail(
    `${report.skipped.length} string(s) not marked. Translate or record them first (CONTRIBUTING.md, Translating QRdx), read them, then run this again.`,
  );
}
