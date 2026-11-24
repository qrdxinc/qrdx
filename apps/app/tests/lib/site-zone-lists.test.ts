// While the marketing site serves the blog (lib/site-zone-on.ts), this app's
// copy of the posts is never shown and may be out of date: the sitemap
// leaves the blog out, robots.txt names the site's own sitemap
// (/blog/sitemap.xml), and llms.txt lists the site's posts from its RSS
// feed (this app's copy only when the feed can't be read). Without the
// site, all three list this app's blog as before.
import {
  SITE_KEY_HEADER,
  SITE_SITEMAPS,
  type SiteGroup,
} from "@repo/next-config/site-zone";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const zone = vi.hoisted(() => ({ blog: false, groups: new Set<string>() }));
// The site's origin and key, as SITE_ORIGIN and SITE_ZONE_KEY would set them.
const site = vi.hoisted(() => ({ origin: undefined as string | undefined }));

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: new Proxy(env, {
      get: (target, key) => {
        if (key === "SITE_ORIGIN") return site.origin;
        if (key === "SITE_ZONE_KEY") return site.origin && "test-zone-key";
        return Reflect.get(target, key);
      },
    }),
  };
});

vi.mock("@/lib/site-zone-on", () => ({
  siteServes: (group: string) =>
    (group === "blog" && zone.blog) || zone.groups.has(group),
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
    zone.groups = new Set();
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

  it("robots.txt names this app's sitemaps only", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/community/sitemap.xml",
    ]);
  });

  it("llms.txt lists the posts", async () => {
    expect(await llmsTxt()).toContain("/blog/old-post");
  });
});

describe("while the marketing site serves the blog", () => {
  beforeEach(() => {
    zone.blog = true;
    zone.groups = new Set();
  });

  afterEach(() => {
    site.origin = undefined;
    vi.unstubAllGlobals();
  });

  it("the sitemap leaves the blog out", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isBlog)).toEqual([]);
  });

  it("robots.txt names the site's blog sitemap too", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/community/sitemap.xml",
      "/blog/sitemap.xml",
    ]);
  });

  it("llms.txt lists the site's posts from its feed, with their one-line answers", async () => {
    site.origin = "https://site.example";
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (
        input: string | URL,
        init?: { headers?: Record<string, string> },
      ) => {
        const url = new URL(String(input));
        asked.push(url.toString());
        // Asked as this app's proxy asks, with the zone key.
        expect(init?.headers?.[SITE_KEY_HEADER]).toBe("test-zone-key");
        if (url.pathname !== "/blog/rss.xml") {
          return new Response("Not found", { status: 404 });
        }
        return new Response(
          `<rss><channel><item><title>What stops a QR code from scanning?</title><link>http://localhost:3000/blog/qr-code-scan-study</link><description>How big a logo can be.</description></item></channel></rss>`,
        );
      },
    );
    const text = await llmsTxt();
    expect(asked).toEqual(["https://site.example/blog/rss.xml"]);
    expect(text).toMatch(/\[Blog\]\([^)]*\/blog\)/);
    expect(text).toContain(
      "- [What stops a QR code from scanning?](http://localhost:3000/blog/qr-code-scan-study): How big a logo can be.",
    );
    expect(text).not.toContain("/blog/old-post");
  });

  it("llms.txt falls back to this app's copy when the site's feed can't be read", async () => {
    for (const answer of [
      () => new Response("Unavailable", { status: 503 }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("<!doctype html><html></html>"),
    ]) {
      site.origin = "https://site.example";
      vi.stubGlobal("fetch", async () => answer());
      expect(await llmsTxt()).toContain(
        "- [An old post](http://localhost:3000/blog/old-post): From this app's copy of the blog.",
      );
    }
    // Without SITE_ORIGIN nothing is asked for.
    site.origin = undefined;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await llmsTxt()).toContain("/blog/old-post");
    expect(fetch).not.toHaveBeenCalled();
  });
});

// The industry and placement pages come from lib/seo-content (real data).
const under = (prefix: string) => (url: string) =>
  new URL(url).pathname === prefix ||
  new URL(url).pathname.startsWith(`${prefix}/`);

describe("while the marketing site serves compare and the SEO collections", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set(["compare", "industries", "placements"]);
  });

  it("the sitemap leaves those pages out", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const prefix of ["/compare", "/qr-codes-for", "/qr-codes-on"]) {
      expect(urls.filter(under(prefix)), prefix).toEqual([]);
    }
  });

  it("robots.txt names each group's own sitemap", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/community/sitemap.xml",
      "/compare/sitemap.xml",
      "/qr-codes-for/sitemap.xml",
      "/qr-codes-on/sitemap.xml",
    ]);
  });

  it("llms.txt lists every comparison in the site's sitemap", async () => {
    site.origin = "https://site.example";
    vi.stubGlobal("fetch", async (input: string | URL) =>
      new URL(String(input)).pathname === "/compare/sitemap.xml"
        ? new Response(
            `<urlset><url><loc>http://localhost:3000/compare</loc></url><url><loc>http://localhost:3000/compare/new-tool</loc></url></urlset>`,
          )
        : new Response("Not found", { status: 404 }),
    );
    try {
      const text = await llmsTxt();
      const guides = text.slice(
        text.indexOf("## Guides and research"),
        text.indexOf("## Developers"),
      );
      expect(guides).toContain(
        "- [QRdx vs new-tool](http://localhost:3000/compare/new-tool)",
      );
    } finally {
      site.origin = undefined;
      vi.unstubAllGlobals();
    }
  });
});

describe("before the site serves the SEO collections", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set();
  });

  it("the sitemap lists them", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.filter(under("/qr-codes-for")).length).toBeGreaterThan(1);
    expect(urls.filter(under("/qr-codes-on")).length).toBeGreaterThan(1);
  });
});

describe("while the marketing site serves the generators and barcodes", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set(["generators", "barcodes"]);
  });

  it("the sitemap leaves their pages out, hosted types included", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const prefix of ["/qr-code-generator", "/barcode-generator"]) {
      expect(urls.filter(under(prefix)), prefix).toEqual([]);
    }
  });

  it("robots.txt names their sitemaps", () => {
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/community/sitemap.xml",
      "/qr-code-generator/sitemap.xml",
      "/barcode-generator/sitemap.xml",
    ]);
  });
});

describe("before the site serves the generators and barcodes", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set();
  });

  it("the sitemap lists them", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.filter(under("/qr-code-generator")).length).toBeGreaterThan(1);
    expect(urls.filter(under("/barcode-generator")).length).toBeGreaterThan(1);
  });
});

// Stage two's groups and the home page (/) keep their URLs whichever app
// serves them, so this app's sitemap goes on listing them and robots.txt
// names no sitemap of theirs (SITE_SITEMAPS has none). The one page only the
// site has, /custom-domain-qr-codes, joins the list while the site serves
// `products` (below).
describe("while the marketing site serves pages without a sitemap of their own", () => {
  const groups = [
    "trust",
    "plugins",
    "tools",
    "products",
    "enterprise",
    "pricing",
    "integrations",
    "templates",
    "home",
  ];

  it("has no sitemap of the site's for them", () => {
    for (const group of groups) {
      expect(SITE_SITEMAPS[group as SiteGroup], group).toBeUndefined();
    }
  });

  it("the sitemap still lists their pages", async () => {
    zone.blog = false;
    zone.groups = new Set();
    const before = (await sitemap()).map((entry) => entry.url);
    zone.groups = new Set(groups);
    const after = (await sitemap()).map((entry) => entry.url);
    expect(
      after.filter(
        (url) =>
          !url.endsWith(CUSTOM_DOMAIN_PAGE) && !url.endsWith(TRACKING_PAGE),
      ),
    ).toEqual(before);
    for (const path of ["/pricing", "/integrations", "/security", "/"]) {
      expect(after, path).toContain(new URL(path, after[0]).toString());
    }
  });

  it("robots.txt names this app's sitemaps only", () => {
    zone.blog = false;
    zone.groups = new Set(groups);
    expect(sitemaps().map((url) => new URL(url).pathname)).toEqual([
      "/sitemap.xml",
      "/community/sitemap.xml",
    ]);
  });
});

// /custom-domain-qr-codes is the marketing site's page alone (SITE_GROUPS
// .products): this app has none, so its sitemap and llms.txt list it only
// while the site serves that group.
const CUSTOM_DOMAIN_PAGE = "/custom-domain-qr-codes";

describe("the site's custom domain page", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set();
  });

  it("is in neither list without the site", async () => {
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(paths).not.toContain(CUSTOM_DOMAIN_PAGE);
    expect(await llmsTxt()).not.toContain(CUSTOM_DOMAIN_PAGE);
  });

  it("is in both while the site serves the product pages", async () => {
    zone.groups = new Set(["products"]);
    const entries = (await sitemap()).filter(
      (entry) => new URL(entry.url).pathname === CUSTOM_DOMAIN_PAGE,
    );
    // No lastmod: its copy isn't in this repo.
    expect(entries).toEqual([
      {
        url: expect.stringMatching(/\/custom-domain-qr-codes$/),
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ]);
    expect(await llmsTxt()).toMatch(
      /- \[QR codes on your own domain\]\([^)]*\/custom-domain-qr-codes\): /,
    );
  });
});

// /qr-code-tracking is the marketing site's page alone too (SITE_GROUPS
// .products), and /qr-code-generator/app-download a generator only the site
// has (SITE_GROUPS.generators): this app's sitemap lists the first while the
// site serves `products` (the site's own generator sitemap lists the
// second), and llms.txt lists each while the site serves its group.
const TRACKING_PAGE = "/qr-code-tracking";
const APP_DOWNLOAD_PAGE = "/qr-code-generator/app-download";

describe("the site's scan tracking page and app download generator", () => {
  beforeEach(() => {
    zone.blog = false;
    zone.groups = new Set();
  });

  it("are in neither list without the site", async () => {
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(paths).not.toContain(TRACKING_PAGE);
    expect(paths).not.toContain(APP_DOWNLOAD_PAGE);
    const text = await llmsTxt();
    expect(text).not.toContain(TRACKING_PAGE);
    expect(text).not.toContain(APP_DOWNLOAD_PAGE);
  });

  it("the tracking page is in both while the site serves the product pages", async () => {
    zone.groups = new Set(["products"]);
    const entries = (await sitemap()).filter(
      (entry) => new URL(entry.url).pathname === TRACKING_PAGE,
    );
    // No lastmod: its copy isn't in this repo.
    expect(entries).toEqual([
      {
        url: expect.stringMatching(/\/qr-code-tracking$/),
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ]);
    const text = await llmsTxt();
    expect(text).toMatch(
      /- \[QR code scan tracking\]\([^)]*\/qr-code-tracking\): /,
    );
    expect(text).not.toContain(APP_DOWNLOAD_PAGE);
  });

  it("the app download generator is in llms.txt while the site serves the generators", async () => {
    zone.groups = new Set(["generators"]);
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(paths).not.toContain(APP_DOWNLOAD_PAGE);
    const text = await llmsTxt();
    expect(text).toMatch(
      /- \[App Store and Google Play QR Code Generator\]\([^)]*\/qr-code-generator\/app-download\): /,
    );
    expect(text).not.toContain(TRACKING_PAGE);
  });
});
