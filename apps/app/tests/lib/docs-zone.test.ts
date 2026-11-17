// The docs zone (@repo/i18n/docs, @repo/next-config/docs-zone): with
// DOCS_ZONE_URL set, the main app proxies the docs' URLs to the docs site
// (apps/docs); unset, it redirects them to the same paths on qrdx.dev. The
// docs are English only: the other languages' old docs URLs (/es/docs/...)
// redirect to the English page either way. Also the manifest the sitemap
// and llms.txt read from it.
import { createRequire } from "node:module";
import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import {
  docsOriginRedirects,
  docsZoneRewrites,
  englishDocsPath,
  formerDocsSegments,
  isDocsPagePath,
  translatedDocsRedirects,
} from "@repo/i18n/docs";
import {
  DOCS_MANIFEST_PATH,
  parseDocsManifest,
} from "@repo/next-config/docs-zone";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const SEGMENTS = formerDocsSegments();
const MARKDOWN = {
  has: [
    { type: "header" as const, key: "accept", value: "markdown" },
    { type: "host" as const, value: "qrdx\\.dev" },
  ],
  missing: [{ type: "host" as const, value: "api\\.qrdx\\.dev" }],
};
const options = { markdown: MARKDOWN };

// Next's own copy of the matcher it applies to next.config.ts (no types).
const pathToRegexp = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  match: (
    source: string,
  ) => (path: string) => false | { params: Record<string, unknown> };
  compile: (path: string) => (params: Record<string, unknown>) => string;
};

interface Rule {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: { type: string; key?: string; value?: string }[];
}

/** Where the first rule matching `path` on `host` sends it, with its rule. */
function follow(rules: readonly Rule[], host: string, path: string) {
  for (const rule of rules) {
    const found = pathToRegexp.match(rule.source)(path);
    const onHost = (rule.has ?? []).every(
      (condition) =>
        condition.type === "host" &&
        new RegExp(`^${condition.value}$`).test(host),
    );
    if (!(found && onHost)) continue;
    const url = new URL(rule.destination, "http://same-origin");
    const target = `${url.origin}${pathToRegexp.compile(url.pathname)(found.params)}`;
    return { rule, target: target.replace("http://same-origin", "") };
  }
  return undefined;
}

describe("docsZoneRewrites", () => {
  it("adds nothing while DOCS_ZONE_URL is unset", () => {
    expect(docsZoneRewrites(undefined, options)).toEqual([]);
    expect(docsZoneRewrites("", options)).toEqual([]);
  });

  it("proxies every docs URL to the zone, Markdown requests first", () => {
    const rules = docsZoneRewrites("https://docs.qrdx.dev/", options);
    expect(
      rules.map(({ source, destination, has, missing }) => ({
        source,
        destination,
        markdown: has === MARKDOWN.has && missing === MARKDOWN.missing,
      })),
    ).toEqual([
      // Accept: text/markdown at a page's own URL: its Markdown.
      {
        source: "/docs",
        destination: "https://docs.qrdx.dev/llms.mdx",
        markdown: true,
      },
      {
        source: "/docs/:path+",
        destination: "https://docs.qrdx.dev/llms.mdx/:path+",
        markdown: true,
      },
      // The pages, and their .md and .mdx versions (the zone maps those).
      {
        source: "/docs",
        destination: "https://docs.qrdx.dev/docs",
        markdown: false,
      },
      {
        source: "/docs.md",
        destination: "https://docs.qrdx.dev/docs.md",
        markdown: false,
      },
      {
        source: "/docs.mdx",
        destination: "https://docs.qrdx.dev/docs.mdx",
        markdown: false,
      },
      {
        source: "/docs/:path*",
        destination: "https://docs.qrdx.dev/docs/:path*",
        markdown: false,
      },
      // The docs' routes and the zone's build assets.
      ...[
        "/llms.mdx/:path*",
        "/og/docs/:path*",
        "/api/search",
        "/llms-full.txt",
        "/docs-static/:path*",
      ].map((source) => ({
        source,
        destination: `https://docs.qrdx.dev${source}`,
        markdown: false,
      })),
    ]);
  });

  it("proxies no other language's docs URL: those redirect", () => {
    const rules = docsZoneRewrites("https://docs.example.com", options);
    expect(rules).toHaveLength(11);
    for (const rule of rules) {
      expect(rule.source, rule.source).not.toMatch(/:lang|docs-md/);
      expect(rule.destination, rule.source).not.toMatch(/:lang|docs-md/);
    }
    for (const path of ["/es/docs", "/pt-br/docs/help/faq", "/docs-md/es/x"]) {
      expect(follow(rules, "qrdx.dev", path), path).toBeUndefined();
    }
  });
});

describe("translatedDocsRedirects", () => {
  const HOST = { type: "host" as const, value: "(?:qrdx\\.dev|localhost)" };
  const rules = translatedDocsRedirects({ has: [HOST] });

  it("covers every language's segment but English's", () => {
    expect(SEGMENTS).toEqual(
      TRANSLATED_LOCALES.map((locale) => LOCALE_INFO[locale].segment),
    );
    expect(SEGMENTS).toEqual(
      expect.arrayContaining(["es", "pt-br", "zh-hans", "hi"]),
    );
    expect(SEGMENTS).not.toContain("en");
  });

  it.each(SEGMENTS)(
    "/%s/docs and its pages go to the English page for good (308)",
    (segment) => {
      for (const [path, to] of [
        [`/${segment}/docs`, "/docs"],
        [`/${segment}/docs/angular`, "/docs/angular"],
        [
          `/${segment}/docs/help/dynamic-codes/password`,
          "/docs/help/dynamic-codes/password",
        ],
        [`/${segment}/docs.md`, "/docs.md"],
        [`/${segment}/docs.mdx`, "/docs.mdx"],
        [`/${segment}/docs/angular.md`, "/docs/angular.md"],
        [`/${segment}/docs/developers/mcp.mdx`, "/docs/developers/mcp.mdx"],
        [`/docs-md/${segment}`, "/docs.md"],
        [`/docs-md/${segment}/help/faq`, "/docs/help/faq.md"],
      ] as const) {
        const found = follow(rules, "qrdx.dev", path);
        expect(found?.target, path).toBe(to);
        // `permanent: true` is a 308 in Next.
        expect(found?.rule.permanent, path).toBe(true);
      }
    },
  );

  it("keeps the query string: Next carries it over when the destination has none", () => {
    // /de/docs/developers/quickstart?x=1 → /docs/developers/quickstart?x=1.
    for (const rule of rules) {
      expect(rule.destination, rule.source).not.toContain("?");
    }
  });

  it("leaves English docs, other pages and look-alikes alone", () => {
    for (const path of [
      "/docs",
      "/docs/angular",
      "/docs/angular.md",
      "/docs.md",
      "/en/docs",
      "/es",
      "/es/pricing",
      "/es/documentation",
      "/es/x/docs",
      "/xx/docs",
      "/docs-md/xx/teams",
      "/llms.mdx/teams",
    ]) {
      expect(follow(rules, "qrdx.dev", path), path).toBeUndefined();
    }
  });

  it("only on the hosts it's given (a custom domain's paths are short links)", () => {
    expect(rules.every((rule) => rule.has?.[0] === HOST)).toBe(true);
    expect(follow(rules, "go.example.com", "/es/docs")).toBeUndefined();
    // Without hosts (the docs site's own next.config.ts): every host.
    expect(translatedDocsRedirects().every((rule) => !rule.has)).toBe(true);
  });

  it("can send them to another site's English docs", () => {
    const elsewhere = translatedDocsRedirects({ origin: "https://qrdx.dev//" });
    expect(follow(elsewhere, "localhost", "/ja/docs/teams.md")?.target).toBe(
      "https://qrdx.dev/docs/teams.md",
    );
    expect(follow(elsewhere, "localhost", "/docs-md/ja")?.target).toBe(
      "https://qrdx.dev/docs.md",
    );
    // Temporary (307): a deployment that later gets a docs site serves
    // these itself.
    expect(elsewhere.every((rule) => rule.permanent === false)).toBe(true);
  });

  it("has nothing to do without languages", () => {
    expect(translatedDocsRedirects({ segments: [] })).toEqual([]);
  });
});

describe("englishDocsPath", () => {
  it("names the English page of a path from the translated docs", () => {
    expect(englishDocsPath("/es/docs")).toBe("/docs");
    expect(englishDocsPath("/pt-br/docs/help/faq")).toBe("/docs/help/faq");
    for (const path of [
      "/docs/help",
      "/xx/docs/help",
      "/es/pricing",
      "/en/docs",
    ]) {
      expect(englishDocsPath(path)).toBe(path);
    }
  });
});

describe("isDocsPagePath", () => {
  it.each([
    "/docs",
    "/docs/dynamic-qr-codes",
    "/docs/developers/rest-api?x=1#auth",
  ])("%s is a docs page", (href) => {
    expect(isDocsPagePath(href)).toBe(true);
  });

  it.each([
    "/",
    "/pricing",
    "/es/pricing",
    "/docs.md",
    "/docs/dynamic-qr-codes.md",
    // The other languages' docs URLs redirect: the main app answers them.
    "/es/docs",
    "/pt-br/docs/help/faq",
    "/es/docs/x.mdx",
    "/docsy",
    "/en/docs",
    "/xx/docs",
    "https://qrdx.dev/docs",
    "//qrdx.dev/docs",
    "docs/relative",
  ])("%s isn't", (href) => {
    expect(isDocsPagePath(href)).toBe(false);
  });
});

describe("long runs of slashes", () => {
  // Both helpers read URLs and hrefs they don't control, so they must stay
  // linear: a regex like /\/+$/ backtracks over every slash of a long run.
  const run = "/".repeat(200_000);
  const within = (ms: number, work: () => void) => {
    const start = performance.now();
    work();
    expect(performance.now() - start).toBeLessThan(ms);
  };

  it("docsZoneRewrites trims any number of trailing slashes, fast", () => {
    within(200, () => {
      const [first] = docsZoneRewrites(`https://docs.qrdx.dev${run}`, options);
      expect(first?.destination).toBe("https://docs.qrdx.dev/llms.mdx");
    });
    within(200, () => {
      expect(docsZoneRewrites(`${run}x${run}`, options)[0]?.destination).toBe(
        `${run}x/llms.mdx`,
      );
    });
  });

  it("isDocsPagePath answers fast for any run of slashes", () => {
    within(200, () => {
      expect(isDocsPagePath(run)).toBe(false);
      expect(isDocsPagePath(`/docs${run}x`)).toBe(true);
      expect(isDocsPagePath(`/es${run}`)).toBe(false);
      expect(isDocsPagePath(`/x${run}docs`)).toBe(false);
      expect(isDocsPagePath(`/docs/x${run}.md`)).toBe(false);
    });
  });
});

describe("docsOriginRedirects", () => {
  const HOST = { type: "host" as const, value: "(?:qrdx\\.dev|localhost)" };
  const rules = docsOriginRedirects("https://qrdx.dev//", { has: [HOST] });

  it.each([
    ["/docs", "https://qrdx.dev/docs"],
    ["/docs.md", "https://qrdx.dev/docs.md"],
    ["/docs/dynamic-qr-codes", "https://qrdx.dev/docs/dynamic-qr-codes"],
    ["/docs/developers/mcp.md", "https://qrdx.dev/docs/developers/mcp.md"],
    ["/docs/developers/mcp.mdx", "https://qrdx.dev/docs/developers/mcp.mdx"],
    ["/llms.mdx/teams", "https://qrdx.dev/llms.mdx/teams"],
    ["/og/docs/teams/image.png", "https://qrdx.dev/og/docs/teams/image.png"],
    ["/llms-full.txt", "https://qrdx.dev/llms-full.txt"],
  ])("sends %s to the same path on qrdx.dev, for now (307)", (path, to) => {
    const found = follow(rules, "localhost", path);
    expect(found?.target).toBe(to);
    expect(found?.rule.permanent).toBe(false);
  });

  it("leaves search, the docs site's assets and other pages alone", () => {
    for (const path of [
      "/api/search",
      "/docs-static/chunks/a.js",
      "/pricing",
      "/es/pricing",
      "/documentation",
      "/fr/x/docs",
      // The other languages' docs URLs: translatedDocsRedirects' job.
      "/es/docs",
      "/docs-md/es/teams",
    ]) {
      expect(follow(rules, "localhost", path), path).toBeUndefined();
    }
  });

  it("only on the hosts it's given (a custom domain's paths are short links)", () => {
    expect(rules.every((rule) => rule.has?.[0] === HOST)).toBe(true);
    expect(follow(rules, "go.example.com", "/docs/x")).toBeUndefined();
  });

  it("covers every URL docsZoneRewrites would proxy, but search and assets", () => {
    const proxied = docsZoneRewrites("https://docs.qrdx.dev", options)
      // The Markdown rules answer the page URLs, covered below.
      .filter((rule) => !rule.has)
      .map((rule) => rule.source)
      .filter(
        (source) => !["/api/search", "/docs-static/:path*"].includes(source),
      );
    expect(new Set(rules.map((rule) => rule.source))).toEqual(new Set(proxied));
  });
});

describe("next.config.ts with and without a docs site", () => {
  const saved = { ...process.env };

  async function load(zone: string | undefined) {
    process.env = { ...saved };
    if (zone) process.env.DOCS_ZONE_URL = zone;
    else delete process.env.DOCS_ZONE_URL;
    vi.resetModules();
    // As in tests/lib/csp.test.ts: no MDX for the routing rules.
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    const config = (await import("@/next.config")).default;
    const rewrites = (await config.rewrites?.()) as {
      beforeFiles: Rule[];
      afterFiles: Rule[];
    };
    return {
      redirects: ((await config.redirects?.()) ?? []) as Rule[],
      rewrites: [...rewrites.beforeFiles, ...rewrites.afterFiles],
    };
  }

  let without: Awaited<ReturnType<typeof load>>;
  let withZone: Awaited<ReturnType<typeof load>>;
  beforeAll(async () => {
    without = await load(undefined);
    withZone = await load("http://localhost:3290");
  }, 60_000);
  afterAll(() => {
    process.env = saved;
    // The suites below read @/env as the test run sets it.
    vi.resetModules();
  });

  it("without one, redirects the docs to qrdx.dev and proxies nothing", () => {
    for (const path of [
      "/docs",
      "/docs/dynamic-qr-codes",
      "/docs/developers/mcp.md",
      "/llms-full.txt",
      "/og/docs/teams/image.png",
    ]) {
      const found = follow(without.redirects, "localhost", path);
      expect(found?.target, path).toBe(`https://qrdx.dev${path}`);
      expect(found?.rule.permanent, path).toBe(false);
      expect(follow(without.rewrites, "localhost", path), path).toBeUndefined();
    }
    // Another language's docs URL: straight to the English page there, in
    // one redirect.
    for (const [path, to] of [
      ["/es/docs/dynamic-qr-codes", "/docs/dynamic-qr-codes"],
      ["/zh-hans/docs/angular.md", "/docs/angular.md"],
      ["/docs-md/de/teams", "/docs/teams.md"],
    ] as const) {
      const found = follow(without.redirects, "localhost", path);
      expect(found?.target, path).toBe(`https://qrdx.dev${to}`);
      expect(found?.rule.permanent, path).toBe(false);
      expect(follow(without.rewrites, "localhost", path), path).toBeUndefined();
    }
    // A custom domain's short links keep their paths.
    expect(
      follow(without.redirects, "go.example.com", "/docs/x"),
    ).toBeUndefined();
    expect(
      follow(without.rewrites, "localhost", "/api/search"),
    ).toBeUndefined();
    // /help still goes to the help center first (lib/docs-redirects.ts).
    expect(follow(without.redirects, "qrdx.dev", "/help")?.target).toBe(
      "/docs/help",
    );
  });

  it("with one, proxies the docs there and redirects none of them", () => {
    for (const path of ["/docs/dynamic-qr-codes", "/llms-full.txt"]) {
      expect(
        follow(withZone.redirects, "localhost", path),
        path,
      ).toBeUndefined();
      expect(follow(withZone.rewrites, "localhost", path)?.target, path).toBe(
        `http://localhost:3290${path}`,
      );
    }
    expect(follow(withZone.rewrites, "localhost", "/api/search")?.target).toBe(
      "http://localhost:3290/api/search",
    );
  });

  it("with one, redirects the other languages' docs URLs itself, once", () => {
    for (const [path, to] of [
      ["/es/docs", "/docs"],
      [
        "/pt-br/docs/help/dynamic-codes/password",
        "/docs/help/dynamic-codes/password",
      ],
      ["/zh-hans/docs/angular.md", "/docs/angular.md"],
      ["/de/docs/developers/quickstart", "/docs/developers/quickstart"],
      ["/docs-md/es/teams", "/docs/teams.md"],
    ] as const) {
      // A redirect on this site (Next answers redirects before rewrites)…
      const found = follow(withZone.redirects, "localhost", path);
      expect(found?.target, path).toBe(to);
      expect(found?.rule.permanent, path).toBe(true);
      // …never proxied to the docs site, which has no such page any more…
      expect(
        follow(withZone.rewrites, "localhost", path),
        path,
      ).toBeUndefined();
      // …and the English URL it lands on isn't redirected again.
      expect(follow(withZone.redirects, "localhost", to), to).toBeUndefined();
    }
    // The translated pages of this app are untouched.
    for (const path of ["/pt-br/playground", "/es/ai/art"]) {
      expect(
        follow(withZone.redirects, "localhost", path),
        path,
      ).toBeUndefined();
    }
    // The marketing pages are English only too: their own rules send /es
    // and /es/pricing to the English page, never to the docs.
    for (const [path, to] of [
      ["/es", "/"],
      ["/es/pricing", "/pricing"],
    ] as const) {
      expect(follow(withZone.redirects, "localhost", path)?.target, path).toBe(
        to,
      );
    }
    // A customer's domain: /es/docs is a short link there.
    expect(
      follow(withZone.redirects, "go.example.com", "/es/docs"),
    ).toBeUndefined();
  });

  it("keeps no docs rules of its own either way", () => {
    for (const { rewrites } of [without, withZone]) {
      for (const rule of rewrites) {
        expect(rule.destination, rule.source).not.toMatch(
          /^\/(?:llms\.mdx|docs-md|en\/docs)/,
        );
      }
    }
  });
});

describe("parseDocsManifest", () => {
  const manifest = {
    version: 1,
    sitemap: [
      {
        url: "https://qrdx.dev/docs",
        lastModified: "2026-11-01T00:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ],
    sections: [{ title: "", pages: [{ title: "Introduction", url: "/docs" }] }],
  };

  it("accepts a manifest", () => {
    expect(parseDocsManifest(manifest)).toEqual(manifest);
  });

  it.each([
    ["an error page", "<html>"],
    ["another version", { ...manifest, version: 2 }],
    ["entries without a url", { ...manifest, sitemap: [{}] }],
    ["sections without pages", { ...manifest, sections: [{ title: "" }] }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseDocsManifest(value)).toThrow(/Docs manifest/);
  });
});

describe("docsZoneManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null while DOCS_ZONE_URL is unset, without a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    expect(await docsZoneManifest(undefined)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the zone's manifest, revalidated hourly", async () => {
    const body = { version: 1, sitemap: [], sections: [] };
    const fetch = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetch);
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    expect(await docsZoneManifest("https://docs.qrdx.dev")).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      new URL(DOCS_MANIFEST_PATH, "https://docs.qrdx.dev"),
      { next: { revalidate: 3600 } },
    );
  });

  it("throws when the zone doesn't answer, so the last good copy stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    await expect(docsZoneManifest("https://docs.qrdx.dev")).rejects.toThrow(
      /answered 503/,
    );
  });
});
