// app/ has two root layouts: app/[lang] for the pages in
// packages/i18n/localized-paths.json (translated and English only), app/(app)
// for every other page. A page, layout or boundary added straight under app/
// (after a rebase, say) has no root layout above it, and a listed page left
// under app/(app) loses its language URLs. Both show up here, with where to
// move the file.
import { readdirSync } from "node:fs";
import path from "node:path";
import localized from "@repo/i18n/localized-paths.json";
import { describe, expect, it } from "vitest";

const APP = path.join(import.meta.dirname, "../../app");

// Files that need a root layout above them (Next's UI file conventions).
const UI_FILE =
  /^(?:page|layout|template|loading|error|not-found|default|forbidden|unauthorized)\.(?:[jt]sx?|mdx)$/;
const PAGE_FILE = /^page\.(?:[jt]sx?|mdx)$/;

/** Every file under app/, as "segment/segment/file" paths. */
function filesIn(dir: string, at = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = at ? `${at}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? filesIn(path.join(dir, entry.name), relative)
      : [relative];
  });
}

const FILES = filesIn(APP);
const LISTED = [...localized.paths, ...localized.englishOnly];

/** A page file's route path: the root and route groups dropped. */
function routeOf(file: string): string {
  const segments = file
    .split("/")
    .slice(1, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${segments.join("/")}`;
}

/** Page files under one root, by route path. */
function pagesUnder(root: string): Map<string, string> {
  return new Map(
    FILES.filter(
      (file) =>
        file.startsWith(`${root}/`) && PAGE_FILE.test(path.basename(file)),
    ).map((file) => [routeOf(file), file]),
  );
}

describe("root layout split", () => {
  it("has every page, layout and boundary under app/[lang] or app/(app)", () => {
    const outside = FILES.filter(
      (file) =>
        UI_FILE.test(path.basename(file)) &&
        !file.startsWith("[lang]/") &&
        !file.startsWith("(app)/"),
    ).map(
      (file) =>
        `app/${file}: move it to app/(app)/${file}, or under app/[lang]/(home)/ if its path is listed in packages/i18n/localized-paths.json`,
    );
    expect(outside).toEqual([]);
  });

  it("has the page of every path in localized-paths.json under app/[lang]", () => {
    const lang = pagesUnder("[lang]");
    const app = pagesUnder("(app)");
    const misplaced = LISTED.filter((route) => !lang.has(route)).map(
      (route) => {
        const found = app.get(route);
        return found
          ? `${route}: app/${found} is listed in packages/i18n/localized-paths.json, so it belongs under app/[lang]/(home)/ (move its folder there)`
          : `${route}: listed in packages/i18n/localized-paths.json, but there is no page for it under app/[lang]`;
      },
    );
    expect(misplaced).toEqual([]);
  });

  it("keeps only route handlers and metadata files at the top of app/", () => {
    const top = readdirSync(APP);
    expect(top).toEqual(expect.arrayContaining(["(app)", "[lang]"]));
    expect(top).not.toContain("layout.tsx");
    expect(top).not.toContain("dashboard");
    expect(top).not.toContain("(home)");
  });
});
