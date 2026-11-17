// A link from this app into another zone (the marketing site's pages,
// @repo/next-config/site-zone, or the docs, @repo/i18n/docs) must load the
// page in full: next/link would prefetch and soft-navigate to a page this
// app doesn't serve once the zone does. LocaleLink and SpotlightLink pick
// a plain <a> for those hrefs themselves; this guard catches next/link used
// directly with a literal href into a zone.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDocsPagePath } from "@repo/i18n/docs";
import { isSitePagePath } from "@repo/next-config/site-zone";
import { describe, expect, it } from "vitest";

const APP_DIR = path.resolve(import.meta.dirname, "../..");
const SCANNED = ["app", "components", "ee", "lib"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(full);
    }
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** The local name next/link's default export has in `source`, or null. */
function nextLinkName(source: string): string | null {
  return (
    /^import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s+from\s+["']next\/link["']/m.exec(
      source,
    )?.[1] ?? null
  );
}

/** The literal hrefs of `name`'s opening tags in `source`. */
function literalHrefs(source: string, name: string): string[] {
  const tags = source.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"));
  return [...tags].flatMap(([, attributes = ""]) => {
    const href =
      /\bhref=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\}|\{\s*`([^`$]*)`\s*\})/.exec(
        attributes,
      );
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    return value === undefined ? [] : [value];
  });
}

describe("next/link into another zone", () => {
  it("finds the cases it guards against", () => {
    const sample = [
      'import Link from "next/link";',
      '<Link className="x" href="/pricing">a</Link>',
      '<Link href={"/blog/x"}>b</Link>',
      "<Link href={`/docs/api`} prefetch={false}>c</Link>",
      '<Link href="/playground">d</Link>',
    ].join("\n");
    expect(nextLinkName(sample)).toBe("Link");
    expect(literalHrefs(sample, "Link")).toEqual([
      "/pricing",
      "/blog/x",
      "/docs/api",
      "/playground",
    ]);
  });

  it("is never used with a literal href into the site or the docs", () => {
    const offenders = SCANNED.flatMap((dir) =>
      sourceFiles(path.join(APP_DIR, dir)),
    ).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const name = nextLinkName(source);
      if (!name) return [];
      return literalHrefs(source, name)
        .filter((href) => isSitePagePath(href) || isDocsPagePath(href))
        .map((href) => `${path.relative(APP_DIR, file)}: ${href}`);
    });
    expect(offenders).toEqual([]);
  });
});
