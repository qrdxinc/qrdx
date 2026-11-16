// While the marketing site serves the blog (lib/site-zone-on.ts), this app's
// copy of the posts is never shown and may be out of date: the sitemap
// leaves the blog out, robots.txt names the site's own sitemap
// (/blog/sitemap.xml), and llms.txt keeps only the Blog link. Without the
// site, all three list this app's blog as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const zone = vi.hoisted(() => ({ blog: false }));

vi.mock("@/lib/site-zone-on", () => ({
  siteServes: (group: string) => group === "blog" && zone.blog,
}));
vi.mock("@/lib/docs-zone-manifest", () => ({
  docsZoneManifest: async () => null,
}));
vi.mock("@/lib/npm-version", () => ({ getPublishedVersion: async () => null }));
// One post by one author; the other collections are empty.
vi.mock("@/lib/content-source", () => {
  const empty = { getPages: () => [], pageTree: { children: [] } };
  const post = {
    url: "/blog/old-post",
    slugs: ["old-post"],
    data: {
      title: "An old post",
      description: "From this app's copy of the blog.",
      published: true,
      date: "2026-11-01",
      updated: undefined,
      author: ["ritesh-bucha"],
      category: "Education",
    },
  };
  const author = {
    url: "/blog/authors/ritesh-bucha",
    slugs: ["ritesh-bucha"],
    data: { title: "Ritesh Bucha" },
  };
  return {
    blogAuthorsSource: { ...empty, getPages: () => [author] },
    blogSource: { ...empty, getPages: () => [post] },
    changelogSource: empty,
    compareSource: empty,
    customersSource: empty,
    legalSource: empty,
  };
});

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");
const { llmsTxt } = await import("@/lib/agents/llms-content");

const isBlog = (url: string) => /\/blog(?:\/|$)/.test(new URL(url).pathname);
const sitemaps = (): string[] => {
  const { sitemap: value } = robots();
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

describe("without the marketing site", () => {
  beforeEach(() => {
    zone.blog = false;
  });

  it("the sitemap lists this app's blog", async () => {
    const urls = (await sitemap()).map((entry) => entry.url).filter(isBlog);
    expect(urls.map((url) => new URL(url).pathname)).toEqual(
      expect.arrayContaining([
        "/blog",
        "/blog/old-post",
        "/blog/authors/ritesh-bucha",
      ]),
    );
  });

  it("robots.txt names this app's sitemap only", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
    ]);
  });

  it("llms.txt lists the posts", async () => {
    expect(await llmsTxt()).toContain("/blog/old-post");
  });
});

describe("while the marketing site serves the blog", () => {
  beforeEach(() => {
    zone.blog = true;
  });

  it("the sitemap leaves the blog out", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isBlog)).toEqual([]);
  });

  it("robots.txt names the site's blog sitemap too", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/blog/sitemap.xml",
    ]);
  });

  it("llms.txt keeps the Blog link, without this app's posts", async () => {
    const text = await llmsTxt();
    expect(text).toMatch(/\[Blog\]\([^)]*\/blog\)/);
    expect(text).not.toContain("/blog/old-post");
  });
});
