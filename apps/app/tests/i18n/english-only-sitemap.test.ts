// The sitemap lists the English-only marketing pages once, in English, with
// no hreflang alternates, even when a language is signed off (here Spanish:
// its translated pages, the playground among them, do get /es entries). The
// blog stays out while the marketing site serves it (lib/site-zone-on.ts,
// tests/lib/site-zone-lists.test.ts).
import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import { ENGLISH_ONLY_PATHS, isEnglishOnlyPath } from "@repo/i18n/paths";
import { describe, expect, it, vi } from "vitest";

const zone = vi.hoisted(() => ({ blog: true }));

vi.mock("@repo/i18n/review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/i18n/review")>();
  return { ...actual, REVIEW: { ...actual.REVIEW, es: "reviewed" } };
});
vi.mock("@/lib/site-zone-on", () => ({
  siteServes: (group: string) => group === "blog" && zone.blog,
}));
vi.mock("@/lib/docs-zone-manifest", () => ({
  docsZoneManifest: async () => null,
}));
// One comparison page and one post; the other collections are empty.
vi.mock("@/lib/content-source", () => {
  const empty = { getPages: () => [], pageTree: { children: [] } };
  const compare = {
    url: "/compare/qr-tiger",
    path: "qr-tiger.mdx",
    slugs: ["qr-tiger"],
    data: { lastVerified: "2026-11-01", lastModified: undefined },
  };
  const post = {
    url: "/blog/old-post",
    slugs: ["old-post"],
    data: {
      published: true,
      date: "2026-11-01",
      updated: undefined,
      author: [],
      category: "Education",
    },
  };
  return {
    blogAuthorsSource: empty,
    blogSource: { ...empty, getPages: () => [post] },
    changelogSource: empty,
    compareSource: { ...empty, getPages: () => [compare] },
    customersSource: empty,
    legalSource: empty,
  };
});

const { default: sitemap } = await import("@/app/sitemap");

const SEGMENTS = TRANSLATED_LOCALES.map(
  (locale) => LOCALE_INFO[locale].segment,
);

/** "/es/pricing" → "/pricing"; null when the path has no language prefix. */
function translatedPath(pathname: string): string | null {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!(match && SEGMENTS.includes(match[1] ?? ""))) return null;
  return match[2] ?? "/";
}

describe("the sitemap with Spanish signed off", () => {
  it("lists translated pages in Spanish, so the review state took effect", async () => {
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(urls).toContain("/playground");
    expect(urls).toContain("/es/playground");
  });

  it("has no translated URL for a marketing page, the home page included", async () => {
    const translated = (await sitemap())
      .map((entry) => new URL(entry.url).pathname)
      .map(translatedPath)
      .filter((path): path is string => path !== null);
    expect(translated.length).toBeGreaterThan(0);
    for (const path of translated) {
      expect(isEnglishOnlyPath(path), path).toBe(false);
    }
  });

  it("lists the marketing pages once each, in English, without alternates", async () => {
    const entries = await sitemap();
    const marketing = entries.filter((entry) =>
      isEnglishOnlyPath(new URL(entry.url).pathname),
    );
    const paths = marketing.map((entry) => new URL(entry.url).pathname);
    for (const path of [
      "/",
      "/pricing",
      "/enterprise",
      "/security",
      "/guarantee",
      "/compare",
      "/qr-code-generator",
      "/tools/bulk",
    ]) {
      expect(
        paths.filter((listed) => listed === path),
        path,
      ).toHaveLength(1);
    }
    for (const entry of marketing) {
      expect(entry.alternates, entry.url).toBeUndefined();
    }
    // Every static English-only page is in the list (dynamic ones by slug).
    for (const path of ENGLISH_ONLY_PATHS.filter((p) => !p.includes("["))) {
      expect(paths, path).toContain(path);
    }
  });

  it("still leaves the blog out while the site serves it", async () => {
    zone.blog = true;
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(urls.some((path) => /^\/blog(?:\/|$)/.test(path))).toBe(false);
  });
});
