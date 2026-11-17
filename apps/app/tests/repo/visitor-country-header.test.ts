// x-qrdx-visitor-country (SITE_COUNTRY_HEADER in
// @repo/next-config/site-zone) is for the marketing site alone. proxy.ts
// sets it on the requests it sends to the site, from this app's geo headers,
// after dropping any copy the browser sent. On every other path a browser's
// copy reaches this app untouched (and the proxy doesn't even run on most of
// them), so nothing here may ever read it: this fails when a source file in
// apps/ or packages/, other than the two below and the tests, names it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const ROOTS = ["apps", "packages"];
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".source",
  ".vercel",
  ".output",
  "coverage",
  // Capacitor's generated native projects (copies of the web build).
  "ios",
  "android",
  // Tests may name it: they check it's set and stripped.
  "tests",
  "e2e",
]);
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/** The only files that may name it: where it's defined, and where it's set. */
const ALLOWED = ["packages/next-config/site-zone.ts", "apps/app/proxy.ts"];

const NAMES = /x-qrdx-visitor-country|SITE_COUNTRY_HEADER/i;

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...sourceFiles(path));
    } else if (SOURCE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const naming = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  .filter((file) => NAMES.test(readFileSync(file, "utf8")))
  .map((file) => relative(REPO, file).split(sep).join("/"))
  .sort();

describe("the site's visitor-country header", () => {
  it("is named only where it's defined and where proxy.ts sets it", () => {
    expect(naming).toEqual([...ALLOWED].sort());
  });

  it("the scan reads real sources (so finding nothing can't pass)", () => {
    const proxy = readFileSync(join(REPO, "apps/app/proxy.ts"), "utf8");
    expect(proxy).toMatch(/SITE_COUNTRY_HEADER/);
    expect(naming.length).toBeGreaterThan(0);
  });
});
