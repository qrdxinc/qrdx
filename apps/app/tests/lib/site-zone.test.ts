// The site zone (@repo/next-config/site-zone): with SITE_ORIGIN set, this
// app proxies groups of its public pages (the blog first) and the site's
// build assets to the marketing site, on QRdx's own hosts; unset
// (self-hosting, and qrdx.dev until the cutover), nothing changes. The
// guard: the rules never take over one of this app's own paths, the pages
// are still here for deployments without a site, and proxy.ts sends the
// zone key on exactly the proxied requests.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import { docsZoneRewrites } from "@repo/i18n/docs";
import {
  ENGLISH_ONLY_OUTSIDE_PATHS,
  ENGLISH_ONLY_PATHS,
  isEnglishOnlyPath,
  isSiteTranslatedPath,
  routeMatcher,
  SITE_TRANSLATED_PATHS,
} from "@repo/i18n/paths";
import {
  CONSOLE_ASSET_PREFIX,
  CONSOLE_KEY_HEADER,
} from "@repo/next-config/console-zone";
import { CORE_PATHS, corePathSamples } from "@repo/next-config/core-paths";
import { prerenderedPagesSource } from "@repo/next-config/csp";
import {
  isSiteOrigin,
  isSitePagePath,
  isSitePath,
  isSiteZoneGroups,
  lowerCasedSitePrefix,
  parseSiteZoneGroups,
  SITE_ASSET_PREFIX,
  SITE_COUNTRY_HEADER,
  SITE_GROUP_NAMES,
  SITE_GROUPS,
  SITE_KEY_HEADER,
  SITE_OPT_IN_GROUPS,
  SITE_TRANSLATED_GROUPS,
  type SitePath,
  siteGroup,
  siteMatcherPrefixes,
  siteTranslatedPaths,
  siteZoneGroups,
  siteZoneRewrites,
} from "@repo/next-config/site-zone";
import type { NextConfig } from "next";
// Next's own route matching, as `next start` and `next dev` run it
// (server/lib/router-utils/filesystem.js, resolve-routes.js): it matches
// paths without regard to case, unlike the test helper below.
// @ts-expect-error: exported at run time, not in its declaration file
import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";

const ORIGIN = "https://qrdx-site.vercel.app";
const KEY = "test-site-key-0123456789abcdef0123456789abcdef";
const CONSOLE_ORIGIN = "https://qrdx-console.vercel.app";
const CONSOLE_KEY = "test-console-key-0123456789abcdef0123456789abcdef";
const DOCS = "https://docs.qrdx.dev";
const HOSTS = "(?:qrdx\\.dev|localhost)";

/** The site's pages, as this app still serves them for deployments without a site. */
/** Every group's prefixes and paths, in list order. */
const SITE_ENTRIES: SitePath[] = SITE_GROUP_NAMES.flatMap((group) => [
  ...(SITE_GROUPS[group] as readonly SitePath[]),
]);
const entryPath = (entry: SitePath) =>
  typeof entry === "string" ? entry : entry.path;

const BLOG_DIR = path.resolve(
  import.meta.dirname,
  "../../app/(app)/(home)/blog",
);

interface ProxySession {
  lookups: number;
  /** Whether a lookup finds a session (the home page's redirect reads it). */
  signedIn?: boolean;
}

/**
 * What proxy.ts reads besides the request: the session and custom domains.
 * The site's paths are public, so neither should ever be looked up (the
 * home page alone looks up a session cookie's session, for its redirect).
 */
function mockProxyDependencies(session: ProxySession) {
  vi.doMock("@/lib/account/session-origin-server", () => ({
    getSessionAllowingHold: async () => {
      session.lookups++;
      return session.signedIn
        ? { session: { id: "s" }, user: { id: "u" } }
        : null;
    },
    isSessionHeld: async () => false,
  }));
  vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
  vi.doMock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
    routeCustomDomain: async () => null,
  }));
}

function unmockProxyDependencies() {
  vi.doUnmock("@/lib/account/session-origin-server");
  vi.doUnmock("next/headers");
  vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
}

describe("siteZoneRewrites", () => {
  const has = [{ type: "host", value: HOSTS }];

  it("adds nothing while SITE_ORIGIN is unset or empty", () => {
    expect(siteZoneRewrites(undefined, { hosts: HOSTS })).toEqual([]);
    expect(siteZoneRewrites("", { hosts: HOSTS })).toEqual([]);
  });

  it("adds nothing while no group is on", () => {
    expect(siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: [] })).toEqual([]);
  });

  it("proxies the blog and the assets, on the given hosts only", () => {
    expect(
      siteZoneRewrites(`${ORIGIN}//`, { hosts: HOSTS, groups: ["blog"] }),
    ).toEqual([
      // The group's own page first, exactly: one /blog/:path* rule sent
      // /blog as /blog/ on Vercel, and the zone's trailing-slash redirect
      // looped it (2026-11-15).
      {
        source: "/blog",
        destination: `${ORIGIN}/blog`,
        has,
      },
      {
        source: "/blog/:path+",
        destination: `${ORIGIN}/blog/:path+`,
        has,
      },
      {
        source: "/site-static/:path*",
        destination: `${ORIGIN}/site-static/:path*`,
        has,
      },
    ]);
  });

  it("lists each group once, in list order, whatever the groups option says", () => {
    expect(
      siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: ["blog", "blog"] }),
    ).toEqual(siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: ["blog"] }));
    expect(
      siteZoneRewrites(ORIGIN, {
        hosts: HOSTS,
        groups: [...SITE_GROUP_NAMES].reverse(),
      }),
    ).toEqual(siteZoneRewrites(ORIGIN, { hosts: HOSTS }));
  });

  it("gives every prefix its exact page, then everything below it, and every path itself alone", () => {
    const rules = siteZoneRewrites(ORIGIN, { hosts: HOSTS });
    expect(rules.map((rule) => rule.source)).toEqual([
      "/blog",
      "/blog/:path+",
      "/compare",
      "/compare/:path+",
      "/qr-codes-for",
      "/qr-codes-for/:path+",
      "/qr-codes-on",
      "/qr-codes-on/:path+",
      "/qr-code-generator",
      "/qr-code-generator/:path+",
      "/barcode-generator",
      "/barcode-generator/:path+",
      "/security",
      "/security/:path+",
      "/guarantee",
      "/guarantee/:path+",
      "/plugins",
      "/plugins/:path+",
      "/legal",
      "/legal/:path+",
      "/changelogs",
      "/changelogs/:path+",
      "/tools",
      "/tools/:path+",
      "/dynamic-qr-code",
      "/dynamic-qr-code/:path+",
      "/qr-code-api",
      "/qr-code-api/:path+",
      "/open-source-qr-code-generator",
      "/open-source-qr-code-generator/:path+",
      "/custom-domain-qr-codes",
      "/custom-domain-qr-codes/:path+",
      "/qr-code-tracking",
      "/qr-code-tracking/:path+",
      "/enterprise",
      "/enterprise/:path+",
      "/pricing",
      "/pricing/:path+",
      "/integrations",
      "/integrations/:p1([^/.]+)",
      "/integrations/:p1([^/.]+)/:p2(opengraph-image[^/.]*)",
      "/integrations/:p1([^/.]+)/:p2(twitter-image[^/.]*)",
      "/templates",
      "/templates/:p1(opengraph-image[^/.]*)",
      "/templates/:p1(twitter-image[^/.]*)",
      "/",
      "/home",
      // generators-i18n, when it's on: every translated language.
      ...TRANSLATED_LOCALES.flatMap((locale) => [
        `/${LOCALE_INFO[locale].segment}/qr-code-generator`,
        `/${LOCALE_INFO[locale].segment}/qr-code-generator/:path+`,
      ]),
      // barcodes-i18n, the same way.
      ...TRANSLATED_LOCALES.flatMap((locale) => [
        `/${LOCALE_INFO[locale].segment}/barcode-generator`,
        `/${LOCALE_INFO[locale].segment}/barcode-generator/:path+`,
      ]),
      "/site-static/:path*",
    ]);
    // A path's parameters go on as they came, without their patterns.
    expect(
      rules.find((rule) => rule.source.includes(":p2(opengraph-image"))
        ?.destination,
    ).toBe(`${ORIGIN}/integrations/:p1/:p2`);
    expect(
      rules.find((rule) => rule.source === "/templates")?.destination,
    ).toBe(`${ORIGIN}/templates`);
  });

  it("proxies the home page at / and /home, those two paths alone", () => {
    expect(
      siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: ["home"] }),
    ).toEqual([
      { source: "/", destination: `${ORIGIN}/`, has },
      { source: "/home", destination: `${ORIGIN}/home`, has },
      {
        source: "/site-static/:path*",
        destination: `${ORIGIN}/site-static/:path*`,
        has,
      },
    ]);
  });

  it("gives / exactly one rule, and no rule reaches every path", () => {
    const rules = siteZoneRewrites(ORIGIN, { hosts: HOSTS });
    expect(rules.filter((rule) => rule.source === "/")).toEqual([
      { source: "/", destination: `${ORIGIN}/`, has },
    ]);
    // Next's own matching (strict, without regard to case): none of these
    // belongs to a group, so no source may match one.
    const unclaimed = [
      "/x",
      "/a/b",
      "/a/b/c",
      "/home/x",
      "/homepage",
      "/home.md",
      "/index.md",
      "/opengraph-image",
      "/opengraph-image-1a2b3c",
      "/twitter-image-1a2b3c",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/dashboard",
      "/playground",
      "/q/x",
    ];
    for (const rule of rules) {
      const match = getPathMatch(rule.source, {
        strict: true,
        removeUnnamedParams: true,
        regexModifier: (regex: string) => modifyRouteRegex(regex),
      });
      for (const pathname of unclaimed) {
        expect(match(pathname), `${rule.source} vs ${pathname}`).toBe(false);
      }
    }
  });

  it("uses the origin alone, whatever else the value has", () => {
    for (const value of [`${ORIGIN}/base`, `${ORIGIN}/?x=1`, `${ORIGIN}#x`]) {
      expect(
        siteZoneRewrites(value, { hosts: HOSTS, groups: ["blog"] }).map(
          (rule) => rule.destination,
        ),
        value,
      ).toEqual([
        `${ORIGIN}/blog`,
        `${ORIGIN}/blog/:path+`,
        `${ORIGIN}/site-static/:path*`,
      ]);
    }
  });

  it("trims any number of trailing slashes, fast", () => {
    const run = "/".repeat(200_000);
    const start = performance.now();
    const [rule] = siteZoneRewrites(`${ORIGIN}${run}`, {
      hosts: HOSTS,
      groups: ["blog"],
    });
    expect(rule?.destination).toBe(`${ORIGIN}/blog`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("isSiteOrigin (what env.ts accepts as SITE_ORIGIN)", () => {
  it.each([
    ORIGIN,
    `${ORIGIN}/`,
    "https://Qrdx-Site.vercel.app",
    "http://localhost:3010",
    "http://127.0.0.1:3010/",
  ])("accepts %s", (value) => {
    expect(isSiteOrigin(value)).toBe(true);
  });

  it.each([
    "",
    "qrdx-site.vercel.app",
    `${ORIGIN}?x=1`,
    `${ORIGIN}/blog`,
    `${ORIGIN}#x`,
    "https://user:pass@qrdx-site.vercel.app",
    "http://qrdx-site.vercel.app",
    "ftp://qrdx-site.vercel.app",
  ])("refuses %s", (value) => {
    expect(isSiteOrigin(value)).toBe(false);
  });

  it("stops the app from starting with anything else, naming the variable", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.stubEnv("SITE_ORIGIN", `${ORIGIN}/blog`);
      await expect(import("@/env")).rejects.toThrow("SITE_ORIGIN");
      vi.resetModules();
      vi.stubEnv("SITE_ORIGIN", `${ORIGIN}/`);
      expect((await import("@/env")).env.SITE_ORIGIN).toBe(`${ORIGIN}/`);
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });
});

describe("SITE_ZONE_GROUPS", () => {
  it("means every group but the opt-in ones while unset or blank", () => {
    const byDefault = SITE_GROUP_NAMES.filter(
      (group) => !SITE_OPT_IN_GROUPS.includes(group),
    );
    expect(byDefault).not.toContain("generators-i18n");
    expect(byDefault).not.toContain("barcodes-i18n");
    expect(byDefault.length).toBe(SITE_GROUP_NAMES.length - 2);
    for (const value of [undefined, "", "  "]) {
      expect(parseSiteZoneGroups(value), String(value)).toEqual(byDefault);
      expect(siteZoneGroups(value), String(value)).toEqual(byDefault);
    }
  });

  it("turns an opt-in group on only by name", () => {
    expect(SITE_OPT_IN_GROUPS).toEqual(["generators-i18n", "barcodes-i18n"]);
    expect(parseSiteZoneGroups("generators-i18n")).toEqual(["generators-i18n"]);
    expect(parseSiteZoneGroups("barcodes-i18n")).toEqual(["barcodes-i18n"]);
    expect(parseSiteZoneGroups(`${SITE_GROUP_NAMES.join(",")}`)?.length).toBe(
      SITE_GROUP_NAMES.length,
    );
  });

  it("names groups, each once, in list order", () => {
    expect(parseSiteZoneGroups("blog")).toEqual(["blog"]);
    expect(parseSiteZoneGroups(" blog , blog ")).toEqual(["blog"]);
    expect(isSiteZoneGroups("blog")).toBe(true);
  });

  it.each(["careers", "blog,", "Blog", "blog;compare", ","])(
    "refuses %s",
    (value) => {
      expect(parseSiteZoneGroups(value)).toBeNull();
      expect(isSiteZoneGroups(value)).toBe(false);
      expect(() => siteZoneGroups(value)).toThrow("SITE_ZONE_GROUPS");
    },
  );

  it("stops the app from starting with an unknown group, naming the variable", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.stubEnv("SITE_ZONE_GROUPS", "blog,careers");
      await expect(import("@/env")).rejects.toThrow("SITE_ZONE_GROUPS");
      vi.resetModules();
      vi.stubEnv("SITE_ZONE_GROUPS", "blog");
      expect((await import("@/env")).env.SITE_ZONE_GROUPS).toBe("blog");
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });
});

describe("site paths", () => {
  it.each([
    ["/blog", "blog"],
    ["/blog/", "blog"],
    ["/blog/qr-codes-for-restaurant-menus", "blog"],
    ["/blog/rss.xml", "blog"],
    ["/blog/opengraph-image", "blog"],
    ["/blog/category/education", "blog"],
    ["/blog/category/education/opengraph-image-abc.png", "blog"],
    ["/blog/authors/ritesh-bucha", "blog"],
    ["/blog/some-post.md", "blog"],
    // Next matches rewrite sources without regard to case.
    ["/Blog/x", "blog"],
    ["/BLOG", "blog"],
    ["/security", "trust"],
    ["/guarantee/opengraph-image-1abc", "trust"],
    ["/legal/privacy", "legal"],
    ["/changelogs", "changelog"],
    ["/tools/bulk", "tools"],
    ["/qr-code-api", "products"],
    ["/open-source-qr-code-generator", "products"],
    ["/custom-domain-qr-codes", "products"],
    ["/custom-domain-qr-codes/opengraph-image-1abc", "products"],
    ["/Custom-Domain-QR-Codes", "products"],
    ["/qr-code-tracking", "products"],
    ["/qr-code-tracking/opengraph-image-1abc", "products"],
    ["/QR-Code-Tracking", "products"],
    ["/enterprise", "enterprise"],
    ["/pricing", "pricing"],
    ["/pricing/x", "pricing"],
    ["/integrations", "integrations"],
    ["/integrations/slack", "integrations"],
    ["/integrations/opengraph-image-1s1u8p", "integrations"],
    ["/integrations/slack/opengraph-image-1ulwde", "integrations"],
    ["/integrations/slack/opengraph-image", "integrations"],
    ["/Integrations/Slack", "integrations"],
    ["/templates", "templates"],
    ["/templates/opengraph-image-1r9j8v", "templates"],
    ["/TEMPLATES", "templates"],
    ["/", "home"],
    ["/home", "home"],
    ["/HOME", "home"],
    ["/Home", "home"],
  ])("%s is the site's %s group", (pathname, group) => {
    expect(siteGroup(pathname)).toBe(group);
    expect(isSitePath(pathname)).toBe(true);
  });

  it.each([
    // The home group is / and /home exactly. Everything else at the root
    // stays here: the default social images every page without its own
    // uses, the icons, the manifest, robots.txt, the sitemap, the home
    // page's Markdown. (/home/ never gets this far: Next sends it to /home.)
    "/home/",
    "/home/x",
    "/homepage",
    "/home.md",
    "/HOME/x",
    "/index.md",
    "/opengraph-image",
    "/opengraph-image-1a2b3c",
    "/twitter-image",
    "/twitter-image-1a2b3c",
    "/favicon.ico",
    "/favicon.svg",
    "/favicon-96x96.png",
    "/icon",
    "/icon.svg",
    "/apple-icon",
    "/apple-touch-icon.png",
    "/site.webmanifest",
    "/manifest.webmanifest",
    "/web-app-manifest-192x192.png",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/en",
    "/es",
    "/es/home",
    "/blogx",
    "/blog.md",
    "/blo",
    "/customers",
    "/customers/flam",
    "/pricing.md",
    "/pricingx",
    "/changelog/new-editor.png",
    "/integrations/slack/link",
    "/integrations/slack.svg",
    "/integrations/slack/link/x",
    "/integrations/slack/opengraph-image.png",
    "/integrations/a/b",
    "/templates/url",
    "/templates/url/menu",
    "/templates/opengraph-image/x",
    "/docs",
    "/admin",
    "/dashboard/blog",
    "/es/blog",
    "/site-staticx",
  ])("%s isn't", (pathname) => {
    expect(siteGroup(pathname)).toBeNull();
    expect(isSitePath(pathname)).toBe(false);
  });

  it("knows the hrefs that must load the site's page in full", () => {
    for (const href of [
      "/blog",
      "/blog/dynamic-vs-static-qr-codes",
      "/blog/category/education?page=2#top",
      "/blog/rss.xml",
      "/pricing?plan=pro",
      "/templates#gallery",
      "/integrations/zapier",
      "/",
      "/?ref=x",
      "/#features",
      "/home",
      "/home?ref=logo",
    ]) {
      expect(isSitePagePath(href), href).toBe(true);
    }
    for (const href of [
      "",
      "?ref=x",
      "#top",
      "/home/x",
      "/homepage",
      "/home.md",
      "/index.md",
      "/opengraph-image",
      "/favicon.ico",
      "https://qrdx.dev/",
      "//qrdx.dev/",
      "/blogx",
      "/blog.md",
      "/customers",
      "/templates/wifi",
      "/integrations/slack/link",
      "/docs",
      "/site-static/_next/static/x.js",
      "https://qrdx.dev/blog",
      "//qrdx.dev/blog",
      "blog/relative",
    ]) {
      expect(isSitePagePath(href), href).toBe(false);
    }
  });

  it("includes the site's build assets, which belong to no group", () => {
    expect(isSitePath("/site-static/_next/static/x.js")).toBe(true);
    expect(siteGroup("/site-static/_next/static/x.js")).toBeNull();
  });

  it("follows the groups that are on", () => {
    expect(isSitePath("/blog", ["blog"])).toBe(true);
    expect(siteGroup("/blog", [])).toBeNull();
    expect(isSitePath("/blog", [])).toBe(false);
    // The home page moves with its own group only.
    for (const pathname of ["/", "/home"]) {
      expect(isSitePath(pathname, ["home"]), pathname).toBe(true);
      expect(isSitePath(pathname, ["blog", "pricing"]), pathname).toBe(false);
      expect(siteGroup(pathname, ["blog"]), pathname).toBeNull();
    }
    // No group on, no rewrites: the assets aren't proxied either.
    expect(isSitePath("/site-static/x.js", [])).toBe(false);
  });
});

describe("lowerCasedSitePrefix (proxy.ts)", () => {
  it.each([
    ["/BLOG/x", "/blog/x"],
    ["/Blog", "/blog"],
    ["/bLoG/rss.xml", "/blog/rss.xml"],
    ["/SITE-STATIC/_next/x.js", "/site-static/_next/x.js"],
    ["/Pricing", "/pricing"],
    ["/TEMPLATES", "/templates"],
    ["/Integrations/Slack", "/integrations/Slack"],
    [
      "/INTEGRATIONS/Slack/OpenGraph-Image-AbC",
      "/integrations/Slack/opengraph-image-AbC",
    ],
    ["/HOME", "/home"],
    ["/Home", "/home"],
  ])("sends %s to %s", (pathname, expected) => {
    expect(lowerCasedSitePrefix(pathname)).toBe(expected);
  });

  it.each([
    "/home",
    "/HOME/x",
    "/Homepage",
    "/HOME.md",
    "/Index.md",
    "/OpenGraph-Image",
    "/blog",
    "/blog/X",
    "/site-static/x.js",
    "/Blogx",
    "/x/BLOG",
    "/",
    "/ADMIN/growth",
    "/integrations/Slack",
    "/TEMPLATES/url",
    "/Integrations/slack/link",
  ])("leaves %s alone", (pathname) => {
    expect(lowerCasedSitePrefix(pathname)).toBeNull();
  });
});

describe("the groups and this app's own paths", () => {
  it("names each group once, with well-formed prefixes and paths", () => {
    expect(new Set(SITE_GROUP_NAMES).size).toBe(SITE_GROUP_NAMES.length);
    for (const group of SITE_GROUP_NAMES) {
      expect(SITE_GROUPS[group].length, group).toBeGreaterThan(0);
    }
    for (const entry of SITE_ENTRIES) {
      if (typeof entry === "string") {
        expect(entry, entry).toMatch(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/);
      } else {
        // The root alone, or a literal first segment (proxy.ts's matcher
        // lists it), then literals, `*`, or literals ending in `*`: never
        // a wildcard first, which would reach this app's every page.
        expect(entry.path, entry.path).toMatch(
          /^\/(?:[a-z0-9-]+(?:\/(?:[a-z0-9-]+\*?|\*))*)?$/,
        );
      }
    }
    // No two entries alike, and no path below one of the prefixes.
    const paths = SITE_ENTRIES.map(entryPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const entry of SITE_ENTRIES) {
      if (typeof entry === "string") continue;
      for (const prefix of SITE_ENTRIES.filter((e) => typeof e === "string")) {
        expect(entry.path.startsWith(`${prefix}/`), entry.path).toBe(false);
      }
    }
    expect(SITE_ASSET_PREFIX).toMatch(/^\/[a-z-]+$/);
    // Its own header, never the console's: each zone gets only its own key.
    expect(SITE_KEY_HEADER).toBe("x-qrdx-site-key");
    expect(SITE_KEY_HEADER).not.toBe(CONSOLE_KEY_HEADER);
  });

  it("takes over none of this app's own paths", () => {
    expect(corePathSamples().length).toBeGreaterThanOrEqual(CORE_PATHS.length);
    for (const sample of corePathSamples()) {
      expect(isSitePath(sample), sample).toBe(false);
      expect(lowerCasedSitePrefix(sample.toUpperCase()), sample).toBeNull();
    }
    // A prefix takes over everything under it, so none may be at or under
    // one of this app's paths. A path takes over itself alone: the
    // samples above cover those (/templates may move, /templates/<type>
    // may not), and so do the cases below.
    for (const prefix of [
      ...SITE_ENTRIES.filter((entry) => typeof entry === "string"),
      SITE_ASSET_PREFIX,
    ]) {
      for (const core of CORE_PATHS) {
        const root = core.endsWith("/*") ? core.slice(0, -2) : core;
        expect(
          prefix === root ||
            prefix.startsWith(`${root}/`) ||
            root.startsWith(`${prefix}/`),
          `${prefix} and ${core}`,
        ).toBe(false);
      }
    }
    for (const pathname of [
      "/templates/url",
      "/templates/wifi/restaurant-menu",
      "/integrations/slack/link",
      "/integrations/zapier.svg",
      "/changelog/new-editor.png",
    ]) {
      expect(isSitePath(pathname), pathname).toBe(false);
      expect(lowerCasedSitePrefix(pathname.toUpperCase()), pathname).toBeNull();
    }
  });

  it("never lists an /admin path: the console's and this app's alone", () => {
    for (const prefix of [...SITE_ENTRIES.map(entryPath), SITE_ASSET_PREFIX]) {
      expect(prefix === "/admin" || prefix.startsWith("/admin/"), prefix).toBe(
        false,
      );
    }
    for (const pathname of ["/admin", "/admin/growth", "/ADMIN/blog"]) {
      expect(isSitePath(pathname), pathname).toBe(false);
      expect(isSitePagePath(pathname), pathname).toBe(false);
      expect(lowerCasedSitePrefix(pathname), pathname).toBeNull();
    }
    for (const rule of siteZoneRewrites(ORIGIN, { hosts: HOSTS })) {
      const match = getPathMatch(rule.source, {
        strict: true,
        removeUnnamedParams: true,
        regexModifier: (regex: string) => modifyRouteRegex(regex),
      });
      for (const pathname of ["/admin", "/admin/growth", "/admin/blog"]) {
        expect(match(pathname), `${rule.source} vs ${pathname}`).toBe(false);
      }
    }
  });

  it("keeps this app's blog pages, for deployments without a site", () => {
    // The change that removes the blog from this app deletes this check.
    for (const file of ["page.tsx", "[slug]/page.tsx", "rss.xml/route.ts"]) {
      expect(existsSync(path.join(BLOG_DIR, file)), file).toBe(true);
    }
  });
});

// The real next.config.ts, as Next resolves a request against it.
describe("next.config.ts", () => {
  const saved = { ...process.env };

  /** The app's config with these variables set (or, undefined, unset). */
  async function loadConfig(
    values: Record<string, string | undefined>,
  ): Promise<NextConfig> {
    for (const name of [
      "SITE_ORIGIN",
      "SITE_ZONE_KEY",
      "SITE_ZONE_GROUPS",
      "CONSOLE_ORIGIN",
      "CONSOLE_ZONE_KEY",
      "DOCS_ZONE_URL",
    ]) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) process.env[name] = value;
    }
    process.env.CSP_DEV = "1";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    return (await import("@/next.config")).default as unknown as NextConfig;
  }

  let off: NextConfig;
  let on: NextConfig;
  let all: NextConfig;
  let home: NextConfig;
  /** Every group named, the opt-in generators-i18n and barcodes-i18n included. */
  let every: NextConfig;
  /** Production's groups on 23 Nov 2026: the default ones and generators-i18n. */
  let production: NextConfig;
  let warned: string[];

  beforeAll(async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    off = await loadConfig({});
    on = await loadConfig({ SITE_ORIGIN: `${ORIGIN}/`, SITE_ZONE_KEY: KEY });
    expect(warn).not.toHaveBeenCalled();
    home = await loadConfig({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "home",
    });
    every = await loadConfig({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: SITE_GROUP_NAMES.join(","),
    });
    production = await loadConfig({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: [...siteZoneGroups(undefined), "generators-i18n"].join(
        ",",
      ),
    });
    all = await loadConfig({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "blog",
      CONSOLE_ORIGIN: CONSOLE_ORIGIN,
      CONSOLE_ZONE_KEY: CONSOLE_KEY,
      DOCS_ZONE_URL: DOCS,
    });
    expect(warn).not.toHaveBeenCalled();
    await loadConfig({ SITE_ORIGIN: ORIGIN });
    warned = warn.mock.calls.map((call) => String(call[0]));
    warn.mockRestore();
  }, 120_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
    unmockProxyDependencies();
  });

  /** Whether `url` (absolute, or a path on qrdx.dev) is on the site's origin. */
  const onSite = (url: string) =>
    new URL(url, "https://qrdx.dev").origin === ORIGIN;

  const resolve = (
    nextConfig: NextConfig,
    url: string,
    headers: Record<string, string> = {},
  ) => unstable_getResponseFromNextConfig({ url, nextConfig, headers });

  /** Where the site would get the request, or null. */
  async function siteTarget(
    nextConfig: NextConfig,
    url: string,
    headers?: Record<string, string>,
  ) {
    const response = await resolve(nextConfig, url, headers);
    const target = getRewrittenUrl(response) ?? getRedirectUrl(response);
    return target && onSite(target) ? target : null;
  }

  const CORE = [
    "/pricing.md",
    "/index.md",
    // The home group is / and /home exactly: the root's images, icons and
    // files stay here (the default social image of every page without its
    // own is this app's).
    "/home/x",
    "/home.md",
    "/homepage",
    "/HOMEPAGE",
    "/opengraph-image",
    "/opengraph-image-1a2b3c",
    "/opengraph-image-1a2b3c?abc",
    "/twitter-image",
    "/twitter-image-1a2b3c",
    "/favicon.ico",
    "/favicon.svg",
    "/favicon-96x96.png",
    "/icon",
    "/apple-icon",
    "/apple-touch-icon.png",
    "/site.webmanifest",
    "/manifest.webmanifest",
    "/web-app-manifest-192x192.png",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/logo.png",
    "/blogx",
    "/blog.md",
    "/customers",
    "/customers/flam",
    "/changelog/new-editor.png",
    "/integrations/slack/link",
    "/integrations/slack.svg",
    "/integrations/a/b",
    "/templates/url",
    "/templates/url/menu",
    "/es/blog",
    "/admin/growth",
    "/console-static/x.js",
    "/api/auth/get-session",
    "/q/x",
    "/p/x",
    "/m/x",
    "/docs",
    "/_next/static/x.js",
    "/dashboard",
    "/sign-in",
    "/zone/home-numbers.json",
    "/zone/availability.json",
    "/site-staticx/x.js",
    ...corePathSamples(),
  ];

  it.each(CORE)("never sends %s to the site", async (pathname) => {
    expect(await siteTarget(on, `https://qrdx.dev${pathname}`)).toBeNull();
  });

  it.each([
    ["/blog", "/blog"],
    [
      "/blog/qr-codes-for-restaurant-menus",
      "/blog/qr-codes-for-restaurant-menus",
    ],
    [
      "/blog/dynamic-vs-static-qr-codes?utm=x",
      "/blog/dynamic-vs-static-qr-codes?utm=x",
    ],
    ["/blog/rss.xml", "/blog/rss.xml"],
    ["/blog/opengraph-image", "/blog/opengraph-image"],
    [
      "/blog/some-post/opengraph-image-abc123.png",
      "/blog/some-post/opengraph-image-abc123.png",
    ],
    ["/blog/category/education", "/blog/category/education"],
    ["/blog/authors/ritesh-bucha", "/blog/authors/ritesh-bucha"],
    ["/blog/some-post.md", "/blog/some-post.md"],
    ["/pricing", "/pricing"],
    ["/tools/bulk", "/tools/bulk"],
    ["/changelogs", "/changelogs"],
    ["/legal/privacy", "/legal/privacy"],
    ["/integrations", "/integrations"],
    ["/integrations/slack", "/integrations/slack"],
    [
      "/integrations/slack/opengraph-image-1ulwde",
      "/integrations/slack/opengraph-image-1ulwde",
    ],
    ["/templates", "/templates"],
    ["/templates/opengraph-image-1r9j8v", "/templates/opengraph-image-1r9j8v"],
    ["/site-static/_next/static/x.js", "/site-static/_next/static/x.js"],
  ])("sends %s to the site", async (pathname, target) => {
    expect(await siteTarget(on, `https://qrdx.dev${pathname}`)).toBe(
      `${ORIGIN}${target}`,
    );
  });

  it("only on QRdx's own hosts", async () => {
    expect(await siteTarget(on, "http://localhost:3000/blog")).toBe(
      `${ORIGIN}/blog`,
    );
    expect(await siteTarget(on, "https://links.customer.com/blog")).toBeNull();
  });

  // The generators in the other languages (owner decision, 23 Nov 2026):
  // an opt-in group. Off (the default), /es/qr-code-generator/wifi still
  // redirects to the English page as every English-only page's translated
  // URL does; on, the redirect is gone and the site answers.
  describe("the generators in other languages (generators-i18n)", () => {
    const LOCALIZED = [
      "/es/qr-code-generator",
      "/es/qr-code-generator/wifi",
      "/pt-br/qr-code-generator/vcard?utm_source=x",
      "/zh-hans/qr-code-generator/wifi",
      "/hi/qr-code-generator",
      "/ja/qr-code-generator/wifi/opengraph-image-1a2b3c",
    ];

    it("covers every translated language's generator pages, and nothing else", () => {
      expect(SITE_GROUPS["generators-i18n"]).toEqual(
        TRANSLATED_LOCALES.map(
          (locale) => `/${LOCALE_INFO[locale].segment}/qr-code-generator`,
        ),
      );
      for (const locale of TRANSLATED_LOCALES) {
        const segment = LOCALE_INFO[locale].segment;
        for (const path of ["/qr-code-generator", "/qr-code-generator/wifi"]) {
          expect(siteGroup(`/${segment}${path}`), segment).toBe(
            "generators-i18n",
          );
        }
        expect(siteGroup(`/${segment}/pricing`), segment).toBeNull();
        expect(siteGroup(`/${segment}/playground`), segment).toBeNull();
      }
      expect(siteGroup("/en/qr-code-generator")).toBeNull();
      expect(siteGroup("/qr-code-generator/wifi")).toBe("generators");
    });

    it("names the English-only pages it translates, as @repo/i18n lists them", () => {
      const named = Object.values(SITE_TRANSLATED_GROUPS).flat();
      expect([...named].sort()).toEqual([...SITE_TRANSLATED_PATHS].sort());
      for (const path of named) {
        expect(ENGLISH_ONLY_PATHS, path).toContain(path);
      }
      expect(isSiteTranslatedPath("/qr-code-generator/wifi")).toBe(true);
      expect(isSiteTranslatedPath("/barcode-generator/ean-13")).toBe(true);
      expect(isSiteTranslatedPath("/qr-codes-for/restaurants")).toBe(false);
      expect(Object.keys(SITE_TRANSLATED_GROUPS)).toEqual([
        "generators-i18n",
        "barcodes-i18n",
      ]);
    });

    it("leaves the redirects alone unless the site and the group are on", () => {
      expect(siteTranslatedPaths(undefined, [...SITE_GROUP_NAMES])).toEqual([]);
      expect(siteTranslatedPaths("", [...SITE_GROUP_NAMES])).toEqual([]);
      expect(siteTranslatedPaths(ORIGIN, siteZoneGroups(undefined))).toEqual(
        [],
      );
      expect(siteTranslatedPaths(ORIGIN, ["generators-i18n"])).toEqual([
        "/qr-code-generator",
        "/qr-code-generator/[type]",
      ]);
    });

    it.each(LOCALIZED)(
      "redirects %s to English while the group is off",
      async (url) => {
        for (const nextConfig of [off, on, all, home]) {
          expect(await siteTarget(nextConfig, `https://qrdx.dev${url}`)).toBe(
            null,
          );
        }
        if (url.includes("opengraph-image")) return;
        const response = await resolve(on, `https://qrdx.dev${url}`);
        expect(response.status, url).toBe(307);
        const english = url.replace(/^\/[^/]+/, "");
        expect(getRedirectUrl(response), url).toBe(
          `https://qrdx.dev${english}`,
        );
      },
    );

    it.each(LOCALIZED)("sends %s to the site while it's on", async (url) => {
      const response = await resolve(every, `https://qrdx.dev${url}`);
      expect(getRedirectUrl(response), url).toBeNull();
      expect(await siteTarget(every, `https://qrdx.dev${url}`)).toBe(
        `${ORIGIN}${url}`,
      );
    });

    it("keeps every other English-only page's redirect, and English as it was", async () => {
      // As production has it (the barcode generators' group off): the
      // English-only page's redirect is permanent; the barcode generator's,
      // which the site serves once its group is on, only a 307.
      for (const [url, status] of [
        ["/es/pricing", 308],
        ["/ja/barcode-generator/ean-13", 307],
      ] as const) {
        const response = await resolve(production, `https://qrdx.dev${url}`);
        expect(response.status, url).toBe(status);
      }
      expect((await resolve(every, "https://qrdx.dev/es/pricing")).status).toBe(
        308,
      );
      // As production has it: the QR code generators on, the barcode ones off.
      expect(
        await siteTarget(production, "https://qrdx.dev/es/qr-code-generator"),
      ).toBe(`${ORIGIN}/es/qr-code-generator`);
      expect(
        getRedirectUrl(
          await resolve(every, "https://qrdx.dev/en/qr-code-generator/wifi"),
        ),
      ).toBe("https://qrdx.dev/qr-code-generator/wifi");
      for (const nextConfig of [on, every]) {
        expect(
          await siteTarget(
            nextConfig,
            "https://qrdx.dev/qr-code-generator/wifi",
          ),
        ).toBe(`${ORIGIN}/qr-code-generator/wifi`);
      }
      expect(
        await siteTarget(every, "https://qrdx.dev/es/playground"),
      ).toBeNull();
    });

    it("only on QRdx's own hosts", async () => {
      expect(
        await siteTarget(
          every,
          "https://links.customer.com/es/qr-code-generator/wifi",
        ),
      ).toBeNull();
    });
  });

  // The barcode generators in the other languages, the same way (owner
  // decision, 23 Nov 2026, about the generator pages): their own opt-in
  // group, switched on apart from generators-i18n.
  describe("the barcode generators in other languages (barcodes-i18n)", () => {
    const LOCALIZED = [
      "/es/barcode-generator",
      "/es/barcode-generator/ean-13",
      "/pt-br/barcode-generator/code-128?utm_source=x",
      "/zh-hans/barcode-generator/upc-a",
      "/hi/barcode-generator",
      "/ja/barcode-generator/ean-13/opengraph-image-1a2b3c",
    ];

    it("covers every translated language's barcode pages, and nothing else", () => {
      expect(SITE_GROUPS["barcodes-i18n"]).toEqual(
        TRANSLATED_LOCALES.map(
          (locale) => `/${LOCALE_INFO[locale].segment}/barcode-generator`,
        ),
      );
      for (const locale of TRANSLATED_LOCALES) {
        const segment = LOCALE_INFO[locale].segment;
        for (const path of ["/barcode-generator", "/barcode-generator/upc-a"]) {
          expect(siteGroup(`/${segment}${path}`), segment).toBe(
            "barcodes-i18n",
          );
        }
      }
      expect(siteGroup("/en/barcode-generator")).toBeNull();
      expect(siteGroup("/barcode-generator/ean-13")).toBe("barcodes");
      expect(siteTranslatedPaths(ORIGIN, ["barcodes-i18n"])).toEqual([
        "/barcode-generator",
        "/barcode-generator/[format]",
      ]);
    });

    it.each(LOCALIZED)(
      "redirects %s to English while the group is off",
      async (url) => {
        for (const nextConfig of [off, on, all, home, production]) {
          expect(await siteTarget(nextConfig, `https://qrdx.dev${url}`)).toBe(
            null,
          );
        }
        if (url.includes("opengraph-image")) return;
        for (const nextConfig of [on, production]) {
          const response = await resolve(nextConfig, `https://qrdx.dev${url}`);
          expect(response.status, url).toBe(307);
          const english = url.replace(/^\/[^/]+/, "");
          expect(getRedirectUrl(response), url).toBe(
            `https://qrdx.dev${english}`,
          );
        }
      },
    );

    it.each(LOCALIZED)("sends %s to the site while it's on", async (url) => {
      const response = await resolve(every, `https://qrdx.dev${url}`);
      expect(getRedirectUrl(response), url).toBeNull();
      expect(await siteTarget(every, `https://qrdx.dev${url}`)).toBe(
        `${ORIGIN}${url}`,
      );
    });

    it("keeps English as it was, and only on QRdx's own hosts", async () => {
      expect(
        getRedirectUrl(
          await resolve(every, "https://qrdx.dev/en/barcode-generator/ean-13"),
        ),
      ).toBe("https://qrdx.dev/barcode-generator/ean-13");
      for (const nextConfig of [on, production, every]) {
        expect(
          await siteTarget(
            nextConfig,
            "https://qrdx.dev/barcode-generator/ean-13",
          ),
        ).toBe(`${ORIGIN}/barcode-generator/ean-13`);
      }
      expect(
        await siteTarget(
          every,
          "https://links.customer.com/es/barcode-generator/ean-13",
        ),
      ).toBeNull();
    });
  });

  // No translated URL of an English-only page is a 404 (23 Nov 2026:
  // /es/compare/uniqode was one, while /es/pricing redirected). Every page
  // the site serves and every English-only page here answers
  // /<language><path> either as that page in the language (a page the site
  // translates, while its group is on) or with a redirect to the English
  // URL, query kept: a 308, or a 307 for a page the site can translate,
  // while its group is off. The pages: the zone's manifest, this app's own copies of
  // the site's pages (their routes: the blog's posts, authors, categories
  // and feed among them) and @repo/i18n's English-only lists. The site's
  // tests check its own routes against the same lists, so a page added
  // there without a rule fails before it ships.
  describe("translated URLs of English-only pages", () => {
    const APP_DIR = path.resolve(import.meta.dirname, "../../app");

    /** Route paths of the page and route files under `dir`. */
    const routesUnder = (dir: string, at: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory()) {
          return /^(?:page\.tsx|route\.ts)$/.test(entry.name)
            ? [at || "/"]
            : [];
        }
        // Parallel and intercepting routes are other views of these pages.
        if (entry.name.startsWith("@") || entry.name.startsWith("(.")) {
          return [];
        }
        const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
        return routesUnder(path.join(dir, entry.name), `${at}${segment}`);
      });

    /** A route's URLs: a dynamic segment is any one value, `[[...x]]` none too. */
    const samplesOf = (route: string): string[] =>
      /\[\[\.\.\.[^\]]+\]\]/.test(route)
        ? [
            route.replace(/\/\[\[\.\.\.[^\]]+\]\]/, "") || "/",
            route.replace(/\[\[\.\.\.[^\]]+\]\]/, "x"),
          ]
        : [route.replace(/\[(?:\.\.\.)?[^\]]+\]/g, "x")];

    const TRANSLATED_GROUPS = Object.keys(SITE_TRANSLATED_GROUPS);
    /** The manifest's pages (not the translated groups' or the images). */
    const MANIFEST = SITE_GROUP_NAMES.filter(
      (group) => !TRANSLATED_GROUPS.includes(group),
    ).flatMap((group) =>
      (SITE_GROUPS[group] as readonly SitePath[])
        .map(entryPath)
        .filter((entry) => !entry.includes("-image"))
        .map((entry) => entry.replaceAll("*", "x")),
    );
    /** This app's copies of the site's pages, and its English-only pages. */
    const OWN = [
      ...routesUnder(path.join(APP_DIR, "(app)", "(home)"), ""),
      ...routesUnder(path.join(APP_DIR, "[lang]"), ""),
    ]
      .flatMap(samplesOf)
      .filter((url) => isSitePath(url) || isEnglishOnlyPath(url));
    const LISTED = [
      ...ENGLISH_ONLY_PATHS,
      ...ENGLISH_ONLY_OUTSIDE_PATHS,
    ].flatMap(samplesOf);
    const PAGES = [...new Set([...MANIFEST, ...OWN, ...LISTED])].sort();

    /** The opt-in group that translates `path`, if any. */
    const translatedBy = (path: string) =>
      Object.entries(SITE_TRANSLATED_GROUPS).find(([, routes]) =>
        (routes ?? []).some((route) => routeMatcher(route)(path)),
      )?.[0];

    it("finds the site's pages, those of the 23 Nov 404s among them", () => {
      for (const page of [
        "/",
        "/home",
        "/blog",
        "/blog/x",
        "/blog/rss.xml",
        "/blog/authors/x",
        "/blog/category/x",
        "/changelogs",
        "/compare",
        "/compare/x",
        "/custom-domain-qr-codes",
        "/qr-code-tracking",
        "/legal",
        "/legal/x",
        "/pricing",
        "/integrations/x",
        "/barcode-generator/x",
        "/qr-code-generator/x",
      ]) {
        expect(PAGES, page).toContain(page);
      }
      // This app's own pages outside the site's groups aren't in question.
      expect(PAGES).not.toContain("/community");
      expect(PAGES).not.toContain("/playground");
    });

    const CASES = [
      { name: "without the site", groups: [] as string[] },
      {
        name: "with production's groups",
        groups: [...siteZoneGroups(undefined), "generators-i18n"],
      },
      { name: "with every group", groups: [...SITE_GROUP_NAMES] },
    ];

    it.each(CASES)(
      "answers every translated URL $name: the page, or a redirect to English",
      async ({ name, groups }) => {
        const nextConfig =
          name === "without the site"
            ? off
            : name === "with every group"
              ? every
              : production;
        const wrong: string[] = [];
        for (const page of PAGES) {
          const group = translatedBy(page);
          for (const locale of TRANSLATED_LOCALES) {
            const segment = LOCALE_INFO[locale].segment;
            const url = `/${segment}${page === "/" ? "" : page}?from=audit`;
            if (group && groups.includes(group)) {
              const target = await siteTarget(
                nextConfig,
                `https://qrdx.dev${url}`,
              );
              if (target !== `${ORIGIN}${url}`) {
                wrong.push(`${url}: ${target ?? "not the site"}`);
              }
              continue;
            }
            const response = await resolve(
              nextConfig,
              `https://qrdx.dev${url}`,
            );
            const to = getRedirectUrl(response);
            // Permanent, but a 307 for a page the site can translate
            // (routing.ts englishOnlyRedirects).
            const status = group ? 307 : 308;
            if (
              response.status !== status ||
              to !== `https://qrdx.dev${page}?from=audit`
            ) {
              wrong.push(`${url}: ${response.status} ${to ?? ""}`);
            }
          }
        }
        expect(wrong).toEqual([]);
      },
      60_000,
    );
  });

  it.each(["/blog", "/blog/rss.xml", "/site-static/_next/static/x.js"])(
    "sends nothing to the site while it's unset: %s",
    async (pathname) => {
      expect(await siteTarget(off, `https://qrdx.dev${pathname}`)).toBeNull();
      expect(
        getRedirectUrl(await resolve(off, `https://qrdx.dev${pathname}`)),
      ).toBeNull();
    },
  );

  it("keeps this app's redirects ahead of the site: moved pages, trailing slashes", async () => {
    const moved = await resolve(
      on,
      "https://qrdx.dev/blog/flam-branded-qr-codes",
    );
    expect(moved.status).toBe(308);
    expect(getRedirectUrl(moved)).toBe("https://qrdx.dev/customers/flam");
    const slash = await resolve(on, "https://qrdx.dev/blog/");
    expect(slash.status).toBe(308);
    expect(getRedirectUrl(slash)).toBe("https://qrdx.dev/blog");
  });

  interface Rule {
    source: string;
    destination: string;
    has?: Parameters<typeof matchHas>[2];
    missing?: Parameters<typeof matchHas>[3];
  }
  const beforeFiles = async (nextConfig: NextConfig) => {
    const phases = (await nextConfig.rewrites?.()) as
      | { beforeFiles: Rule[] }
      | undefined;
    return phases?.beforeFiles ?? [];
  };

  it("adds exactly the zone's rules (every group on by default)", async () => {
    const rules = await beforeFiles(on);
    const expected = siteZoneRewrites(ORIGIN, {
      hosts: HOSTS,
      groups: siteZoneGroups(undefined),
    }).length;
    expect(rules.filter((rule) => onSite(rule.destination))).toHaveLength(
      expected,
    );
    expect(rules.length - (await beforeFiles(off)).length).toBe(expected);
  });

  it("answers agents' Markdown for / and /pricing ahead of every site rule", async () => {
    for (const nextConfig of [on, all]) {
      const rules = await beforeFiles(nextConfig);
      const firstSite = rules.findIndex((rule) => onSite(rule.destination));
      expect(firstSite).toBeGreaterThan(-1);
      for (const [source, destination] of [
        ["/", "/index.md"],
        ["/pricing", "/pricing.md"],
      ]) {
        const at = rules.findIndex(
          (rule) => rule.source === source && rule.destination === destination,
        );
        expect(at, source).toBeGreaterThan(-1);
        expect(at, source).toBeLessThan(firstSite);
      }
    }
    // With every group on, /pricing's page is the site's, but an agent
    // asking for Markdown still gets this app's; so does / with the home
    // group on (alone or with every other group).
    expect(
      getRewrittenUrl(
        await resolve(on, "https://qrdx.dev/pricing", {
          accept: "text/markdown",
        }),
      ),
    ).toBe("https://qrdx.dev/pricing.md");
    expect(
      await siteTarget(on, "https://qrdx.dev/pricing", { accept: "text/html" }),
    ).toBe(`${ORIGIN}/pricing`);
    for (const nextConfig of [on, home]) {
      expect(
        getRewrittenUrl(
          await resolve(nextConfig, "https://qrdx.dev/", {
            accept: "text/markdown",
          }),
        ),
      ).toBe("https://qrdx.dev/index.md");
      expect(
        getRewrittenUrl(
          await resolve(nextConfig, "https://qrdx.dev/", {
            accept: "text/html, text/markdown;q=0.9",
          }),
        ),
      ).toBe("https://qrdx.dev/index.md");
      expect(
        await siteTarget(nextConfig, "https://qrdx.dev/", {
          accept: "text/html",
        }),
      ).toBe(`${ORIGIN}/`);
      // The Markdown file itself is this app's, whoever asks.
      expect(await siteTarget(nextConfig, "https://qrdx.dev/index.md")).toBe(
        null,
      );
    }
  });

  describe("the home group", () => {
    it.each([
      ["/", "/"],
      ["/?ref=x", "/?ref=x"],
      ["/?a=1&b=two", "/?a=1&b=two"],
      ["/home", "/home"],
      ["/home?ref=logo", "/home?ref=logo"],
    ])("sends %s to the site's %s, query kept", async (url, target) => {
      for (const nextConfig of [on, home]) {
        expect(await siteTarget(nextConfig, `https://qrdx.dev${url}`)).toBe(
          `${ORIGIN}${target}`,
        );
      }
    });

    it("keeps the home page here while the group is off: /home is this app's /en", async () => {
      // `all` names the blog alone; `off` has no site.
      for (const nextConfig of [off, all]) {
        expect(await siteTarget(nextConfig, "https://qrdx.dev/")).toBeNull();
        const atHome = await resolve(nextConfig, "https://qrdx.dev/home");
        expect(getRedirectUrl(atHome)).toBeNull();
        expect(getRewrittenUrl(atHome)).toBe("https://qrdx.dev/en");
      }
    });

    it("never redirects /home, and lists the site's rule ahead of this app's", async () => {
      const rules = await beforeFiles(home);
      const site = rules.findIndex(
        (rule) => rule.source === "/home" && onSite(rule.destination),
      );
      const core = rules.findIndex(
        (rule) => rule.source === "/home" && rule.destination === "/en",
      );
      expect(site).toBeGreaterThan(-1);
      expect(core).toBeGreaterThan(site);
      const response = await resolve(home, "https://qrdx.dev/home");
      expect(response.status).not.toBe(307);
      expect(response.status).not.toBe(308);
      expect(getRedirectUrl(response)).toBeNull();
    });

    it("sends /home/ to /home first, as every page", async () => {
      const response = await resolve(home, "https://qrdx.dev/home/");
      expect(response.status).toBe(308);
      expect(getRedirectUrl(response)).toBe("https://qrdx.dev/home");
    });

    it.each(TRANSLATED_LOCALES.map((locale) => LOCALE_INFO[locale].segment))(
      "still redirects /%s to /, and its /home to /home",
      async (segment) => {
        for (const nextConfig of [on, home]) {
          const root = await resolve(nextConfig, `https://qrdx.dev/${segment}`);
          expect(root.status).toBe(308);
          expect(getRedirectUrl(root)).toBe("https://qrdx.dev/");
          const atHome = await resolve(
            nextConfig,
            `https://qrdx.dev/${segment}/home`,
          );
          expect(atHome.status).toBe(308);
          expect(getRedirectUrl(atHome)).toBe("https://qrdx.dev/home");
        }
      },
    );

    it("keeps the query through the language redirect", async () => {
      const response = await resolve(home, "https://qrdx.dev/es?ref=x");
      expect(response.status).toBe(308);
      expect(getRedirectUrl(response)).toBe("https://qrdx.dev/?ref=x");
    });

    it("keeps /en and /en/home's permanent redirects", async () => {
      for (const [path, location] of [
        ["/en", "https://qrdx.dev/"],
        ["/en/home", "https://qrdx.dev/home"],
      ] as const) {
        const response = await resolve(home, `https://qrdx.dev${path}`);
        expect(response.status, path).toBe(308);
        expect(getRedirectUrl(response), path).toBe(location);
      }
    });

    it.each(CORE)("never sends %s to the site", async (pathname) => {
      expect(await siteTarget(home, `https://qrdx.dev${pathname}`)).toBeNull();
    });
  });

  it("sends /blog as /blog, never /blog/ (a zone's slash redirect would loop)", async () => {
    expect(await siteTarget(on, "https://qrdx.dev/blog")).toBe(
      `${ORIGIN}/blog`,
    );
    expect(await siteTarget(on, "https://qrdx.dev/blog?x=1")).toBe(
      `${ORIGIN}/blog?x=1`,
    );
    expect(await siteTarget(on, "https://qrdx.dev/blog/a/b")).toBe(
      `${ORIGIN}/blog/a/b`,
    );
  });

  it("puts them right after the console's when every zone is on", async () => {
    const rules = await beforeFiles(all);
    const docsCount = docsZoneRewrites(DOCS, { markdown: { has: [] } }).length;
    const zoneOf = (rule: Rule) => {
      const { origin } = new URL(rule.destination, "https://qrdx.dev");
      if (origin === DOCS) return "docs";
      if (origin === CONSOLE_ORIGIN) return "console";
      return origin === ORIGIN ? "site" : "app";
    };
    const zones = rules.map(zoneOf).filter((zone) => zone !== "app");
    expect(zones).toEqual([
      ...Array(docsCount).fill("docs"),
      "console",
      "console",
      "site",
      "site",
      "site",
    ]);
    expect(rules.length - (await beforeFiles(off)).length).toBe(docsCount + 5);
    expect(await siteTarget(all, "https://qrdx.dev/blog/x")).toBe(
      `${ORIGIN}/blog/x`,
    );
    expect(
      getRewrittenUrl(await resolve(all, "https://qrdx.dev/admin/growth")),
    ).toBe(`${CONSOLE_ORIGIN}/admin/growth`);
    expect(
      getRewrittenUrl(await resolve(all, "https://qrdx.dev/docs/developers")),
    ).toBe(`${DOCS}/docs/developers`);
  });

  it("inlines SITE_ORIGIN and SITE_ZONE_GROUPS into server code, empty while unset", () => {
    const inlined = (nextConfig: NextConfig, name: string) =>
      nextConfig.compiler?.defineServer?.[`process.env.${name}`];
    expect(inlined(off, "SITE_ORIGIN")).toBe("");
    expect(inlined(off, "SITE_ZONE_GROUPS")).toBe("");
    expect(inlined(on, "SITE_ORIGIN")).toBe(`${ORIGIN}/`);
    expect(inlined(on, "SITE_ZONE_GROUPS")).toBe("");
    expect(inlined(all, "SITE_ORIGIN")).toBe(ORIGIN);
    expect(inlined(all, "SITE_ZONE_GROUPS")).toBe("blog");
  });

  it("warns at build time when the zone key is missing", () => {
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/SITE_ZONE_KEY/);
  });

  // Next builds beforeFiles rewrites without experimental.caseSensitiveRoutes,
  // so /BLOG reaches the site too; the proxy's matcher has to see every such
  // path, or it would get there without the zone key.
  describe("in any case, with Next's own matching", () => {
    const req = { headers: { host: "qrdx.dev" } } as never;
    const rewriteMatches = async (pathname: string) =>
      (await beforeFiles(every))
        .filter((rule) => onSite(rule.destination))
        .some((rule) => {
          const match = getPathMatch(rule.source, {
            strict: true,
            removeUnnamedParams: true,
            regexModifier: (regex: string) => modifyRouteRegex(regex),
          });
          return (
            match(pathname) !== false &&
            matchHas(req, {}, rule.has, rule.missing) !== false
          );
        });

    let proxyMatches: (pathname: string) => boolean;
    beforeAll(async () => {
      // Only its matcher is read: no session or domain lookups run.
      vi.resetModules();
      mockProxyDependencies({ lookups: 0 });
      const { config } = await import("@/proxy");
      const matcher = getMiddlewareRouteMatcher(
        getMiddlewareMatchers(config.matcher, { basePath: "" } as never),
      );
      proxyMatches = (pathname) => matcher(pathname, req, {});
    });

    const CASINGS = [
      "/blog",
      "/BLOG",
      "/Blog/rss.xml",
      "/blog/Category/Education",
      "/bLoG/some-post/opengraph-image-abc.png",
      "/site-static/_next/static/x.js",
      "/SITE-STATIC/_next/static/x.js",
      "/Site-Static/x.js",
      "/Pricing",
      "/Legal/privacy",
      "/TEMPLATES",
      "/templates/OpenGraph-Image-1r9j8v",
      "/Integrations/Slack",
      "/integrations/slack/OpenGraph-Image-1ulwde",
      "/",
      "/home",
      "/HOME",
      "/Home",
      "/ES/qr-code-generator/wifi",
      "/es/QR-Code-Generator",
      "/Zh-Hans/qr-code-generator/vcard",
      "/ES/barcode-generator/ean-13",
      "/es/Barcode-Generator",
    ];

    it.each(CASINGS)(
      "%s reaches the site and passes the proxy",
      async (pathname) => {
        expect(await rewriteMatches(pathname)).toBe(true);
        expect(proxyMatches(pathname)).toBe(true);
      },
    );

    /** A path each SitePath covers: its wildcards filled in. */
    const sampleOf = (path: string) =>
      path
        .split("/")
        .map((segment) =>
          segment === "*"
            ? "x"
            : segment.endsWith("*")
              ? `${segment.slice(0, -1)}-1a`
              : segment,
        )
        .join("/") || "/";

    it("covers every prefix and path of every group, on or off", () => {
      const prefixes = siteMatcherPrefixes();
      expect(prefixes).toContain(SITE_ASSET_PREFIX);
      // The root has no prefix to list: proxy.ts matches "/" itself.
      expect(prefixes).not.toContain("/");
      for (const entry of SITE_ENTRIES) {
        // A prefix whole (/es/qr-code-generator), a path's first segment.
        const listed =
          typeof entry === "string" ? entry : `/${entry.path.split("/")[1]}`;
        if (listed === "/") continue;
        expect(prefixes, entryPath(entry)).toContain(listed);
      }
      // A prefix's page and everything under it.
      for (const prefix of [
        ...SITE_ENTRIES.filter((entry) => typeof entry === "string"),
        SITE_ASSET_PREFIX,
      ]) {
        for (const casing of [prefix, prefix.toUpperCase()]) {
          expect(proxyMatches(casing), casing).toBe(true);
          expect(proxyMatches(`${casing}/x`), casing).toBe(true);
          expect(proxyMatches(`${casing}/x/opengraph-image-1a`), casing).toBe(
            true,
          );
        }
      }
      // A path itself, in any case.
      for (const entry of SITE_ENTRIES) {
        if (typeof entry === "string") continue;
        const sample = sampleOf(entry.path);
        expect(siteGroup(sample), sample).not.toBeNull();
        for (const casing of [sample, sample.toUpperCase()]) {
          expect(proxyMatches(casing), casing).toBe(true);
        }
      }
    });

    it("never rewrites other paths, in any case", async () => {
      for (const pathname of [
        // (/home/ would match, as /blog/ does: the trailing-slash redirect
        // sends it to /home first, before any rewrite or the proxy.)
        "/HOME/x",
        "/Homepage",
        "/HOME.md",
        "/Index.md",
        "/OpenGraph-Image-1a2b3c",
        "/Twitter-Image",
        "/Favicon.ico",
        "/BLOGX",
        "/Blog.md",
        "/x/blog",
        "/Pricing.md",
        "/TEMPLATES/url",
        "/Templates/OpenGraph-Image/x",
        "/INTEGRATIONS/slack/link",
        "/Integrations/Slack.svg",
        "/integrations/a/b",
        "/ES/qr-code-generatorx",
        "/esx/qr-code-generator",
        "/en/qr-code-generator",
        "/es/playground",
        "/ES/Pricing",
      ]) {
        expect(await rewriteMatches(pathname), pathname).toBe(false);
      }
    });
  });

  it("puts no page policy on the site's assets while it's on, and keeps it on its pages", async () => {
    const pageRule = async (nextConfig: NextConfig) =>
      ((await nextConfig.headers?.()) ?? []).find(
        (rule) =>
          rule.headers.some(
            (header) => header.key === "Content-Security-Policy",
          ) && rule.source.startsWith("/:path((?!"),
      )?.source;
    expect(await pageRule(off)).toBe(prerenderedPagesSource());
    expect(await pageRule(on)).toBe(
      prerenderedPagesSource([SITE_ASSET_PREFIX.slice(1)]),
    );
    expect(await pageRule(all)).toBe(
      prerenderedPagesSource([
        CONSOLE_ASSET_PREFIX.slice(1),
        SITE_ASSET_PREFIX.slice(1),
      ]),
    );
    const policy = async (nextConfig: NextConfig, pathname: string) =>
      (await resolve(nextConfig, `https://qrdx.dev${pathname}`)).headers.get(
        "content-security-policy",
      );
    expect(await policy(off, "/site-static/x.js")).toContain("script-src");
    expect(await policy(on, "/site-static/x.js")).toBeNull();
    // Public pages keep this app's prerendered-page policy, as the docs' do.
    expect(await policy(on, "/blog")).toContain("script-src");
    expect(await policy(on, "/blog/some-post")).toContain("script-src");
    expect(await policy(on, "/pricing")).toContain("script-src");
  });

  it("adds no cache rule of its own: the site's responses decide", async () => {
    for (const pathname of ["/blog", "/blog/rss.xml", "/site-static/x.js"]) {
      const response = await resolve(on, `https://qrdx.dev${pathname}`);
      expect(response.headers.get("cache-control"), pathname).toBeNull();
    }
  });
});

describe("proxy.ts", () => {
  const saved = { ...process.env };
  const session: ProxySession = { lookups: 0 };

  /** The proxy with SITE_ORIGIN (and the key) set or unset. */
  async function loadProxy(
    values: Record<string, string | undefined>,
  ): Promise<(request: NextRequest) => Promise<Response>> {
    for (const name of [
      "SITE_ORIGIN",
      "SITE_ZONE_KEY",
      "SITE_ZONE_GROUPS",
      "CONSOLE_ORIGIN",
      "CONSOLE_ZONE_KEY",
    ]) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) process.env[name] = value;
    }
    process.env.CSP_DEV = "1";
    vi.resetModules();
    mockProxyDependencies(session);
    return (await import("@/proxy")).default;
  }

  let on: (request: NextRequest) => Promise<Response>;
  let onWithoutKey: (request: NextRequest) => Promise<Response>;
  let off: (request: NextRequest) => Promise<Response>;
  let both: (request: NextRequest) => Promise<Response>;
  let home: (request: NextRequest) => Promise<Response>;
  /** Every group named, the opt-in generators-i18n included. */
  let every: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    off = await loadProxy({});
    every = await loadProxy({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: SITE_GROUP_NAMES.join(","),
    });
    onWithoutKey = await loadProxy({ SITE_ORIGIN: ORIGIN });
    home = await loadProxy({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "home",
    });
    both = await loadProxy({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "blog",
      CONSOLE_ORIGIN: CONSOLE_ORIGIN,
      CONSOLE_ZONE_KEY: CONSOLE_KEY,
    });
    on = await loadProxy({ SITE_ORIGIN: ORIGIN, SITE_ZONE_KEY: KEY });
  });

  afterAll(() => {
    process.env = saved;
    unmockProxyDependencies();
  });

  const request = (url: string, headers: Record<string, string> = {}) =>
    new NextRequest(url, {
      headers: { host: new URL(url).host, ...headers },
    });

  /** The request headers Next renders (or proxies) with, as the proxy set them. */
  const forwarded = (response: Response) => {
    const names =
      response.headers.get("x-middleware-override-headers")?.split(",") ?? [];
    return (name: string) =>
      names.includes(name)
        ? response.headers.get(`x-middleware-request-${name}`)
        : undefined;
  };

  it.each([
    "/blog",
    "/blog/some-post?utm=x",
    "/blog/rss.xml",
    "/blog/category/education/opengraph-image-abc.png",
    "/site-static/_next/static/x.js",
  ])(
    "gives %s the zone key, dropping a forged one, and no policy of its own",
    async (pathname) => {
      const response = await on(
        request(`https://qrdx.dev${pathname}`, { [SITE_KEY_HEADER]: "forged" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBeNull();
      const sent = forwarded(response);
      expect(sent(SITE_KEY_HEADER)).toBe(KEY);
      expect(sent("content-security-policy")).toBeUndefined();
    },
  );

  it("gives the generators in other languages the key only while their group is on", async () => {
    for (const pathname of [
      "/es/qr-code-generator",
      "/es/qr-code-generator/wifi",
      "/zh-hans/qr-code-generator/vcard/opengraph-image-1a",
      "/es/barcode-generator",
      "/ja/barcode-generator/ean-13",
      "/zh-hans/barcode-generator/upc-a/opengraph-image-1a",
    ]) {
      const sent = forwarded(
        await every(
          request(`https://qrdx.dev${pathname}`, {
            [SITE_KEY_HEADER]: "forged",
          }),
        ),
      );
      expect(sent(SITE_KEY_HEADER), pathname).toBe(KEY);
      // Off by default (opt-in): no key, and the forged one is dropped.
      const offSent = forwarded(
        await on(
          request(`https://qrdx.dev${pathname}`, {
            [SITE_KEY_HEADER]: "forged",
          }),
        ),
      );
      expect(offSent(SITE_KEY_HEADER), pathname).not.toBe(KEY);
      expect(offSent(SITE_KEY_HEADER), pathname).not.toBe("forged");
    }
    // Any other casing goes to the lower-case URL first.
    const upper = await every(
      request("https://qrdx.dev/ES/QR-Code-Generator/wifi"),
    );
    expect(upper.status).toBe(308);
    expect(upper.headers.get("location")).toBe(
      "https://qrdx.dev/es/qr-code-generator/wifi",
    );
    const barcode = await every(
      request("https://qrdx.dev/ES/Barcode-Generator/ean-13"),
    );
    expect(barcode.status).toBe(308);
    expect(barcode.headers.get("location")).toBe(
      "https://qrdx.dev/es/barcode-generator/ean-13",
    );
    // The translated pages that aren't the site's keep no key.
    expect(
      forwarded(await every(request("https://qrdx.dev/es/playground")))(
        SITE_KEY_HEADER,
      ),
    ).not.toBe(KEY);
  });

  it("passes the visitor's country on to the site, from this app's geo headers only", async () => {
    const country = async (headers: Record<string, string>, url?: string) =>
      forwarded(await on(request(url ?? "https://qrdx.dev/blog", headers)))(
        SITE_COUNTRY_HEADER,
      );
    expect(await country({ "x-vercel-ip-country": "IN" })).toBe("IN");
    expect(await country({ "cf-ipcountry": "de" })).toBe("DE");
    // A copy the browser sent never gets through, with or without a country.
    expect(
      await country({
        "x-vercel-ip-country": "US",
        [SITE_COUNTRY_HEADER]: "IN",
      }),
    ).toBe("US");
    expect(await country({ [SITE_COUNTRY_HEADER]: "IN" })).toBeUndefined();
    // Unknown or malformed: none at all.
    for (const value of ["XX", "", "IND", "I1", "in-IN"]) {
      expect(await country({ "x-vercel-ip-country": value }), value).toBe(
        undefined,
      );
    }
    // Only on requests it proxies to the site.
    expect(
      await country(
        { "x-vercel-ip-country": "IN" },
        "https://qrdx.dev/admin/users/u1",
      ),
    ).toBeUndefined();
    expect(
      forwarded(
        await off(
          request("https://qrdx.dev/blog", { "x-vercel-ip-country": "IN" }),
        ),
      )(SITE_COUNTRY_HEADER),
    ).toBeUndefined();
    expect(SITE_COUNTRY_HEADER).toBe("x-qrdx-visitor-country");
  });

  it("drops the workspace header the browser sent", async () => {
    const response = await on(
      request("https://qrdx.dev/blog", { [WORKSPACE_HEADER]: "acme" }),
    );
    const sent = forwarded(response);
    expect(sent(WORKSPACE_HEADER)).toBeUndefined();
    expect(sent(SITE_KEY_HEADER)).toBe(KEY);
  });

  it("drops a key the browser sent when there's none to send", async () => {
    const response = await onWithoutKey(
      request("https://qrdx.dev/blog", { [SITE_KEY_HEADER]: "forged" }),
    );
    expect(forwarded(response)(SITE_KEY_HEADER)).toBeUndefined();
    expect(
      response.headers.get("x-middleware-override-headers")?.split(","),
    ).not.toContain(SITE_KEY_HEADER);
  });

  it("sends the key where next.config.ts proxies only: not on other hosts", async () => {
    const response = await on(request("https://other.example.com/blog"));
    expect(response.status).toBe(200);
    expect(forwarded(response)(SITE_KEY_HEADER)).toBeUndefined();
  });

  it("changes nothing while SITE_ORIGIN is unset, but drops a forged site key", async () => {
    const response = await off(request("https://qrdx.dev/blog"));
    expect(response.status).toBe(200);
    // Passed on untouched: no header is rewritten at all.
    expect(response.headers.get("x-middleware-override-headers")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    const forged = await off(
      request("https://qrdx.dev/blog", { [SITE_KEY_HEADER]: "forged" }),
    );
    expect(forged.status).toBe(200);
    expect(
      forged.headers.get("x-middleware-override-headers")?.split(","),
    ).not.toContain(SITE_KEY_HEADER);
    expect(forwarded(forged)(SITE_KEY_HEADER)).toBeUndefined();
  });

  // The four rules for the site's key header, each on its own.
  it("strips a client-sent site key on every request it handles", async () => {
    for (const [proxy, mode] of [
      [on, "on"],
      [off, "off"],
      [both, "both"],
    ] as const) {
      for (const pathname of [
        "/blog",
        "/blog/some-post",
        "/site-static/x.js",
        "/admin/users/u1",
        "/oauth/consent",
        "/invite/abc",
      ]) {
        const response = await proxy(
          request(`https://qrdx.dev${pathname}`, {
            [SITE_KEY_HEADER]: "forged",
          }),
        );
        const label = `${mode} ${pathname}`;
        expect(response.status, label).toBe(200);
        const names =
          response.headers.get("x-middleware-override-headers")?.split(",") ??
          [];
        // Either the request's headers are replaced without it, or it's the
        // real key on a proxied site request: never the browser's value.
        expect(names.length, label).toBeGreaterThan(0);
        expect(forwarded(response)(SITE_KEY_HEADER), label).not.toBe("forged");
      }
    }
  });

  it("adds the site key only on requests it proxies to the site", async () => {
    const proxied = await on(request("https://qrdx.dev/blog/some-post"));
    expect(forwarded(proxied)(SITE_KEY_HEADER)).toBe(KEY);
    for (const [proxy, url] of [
      [on, "https://other.example.com/blog"],
      [on, "https://qrdx.dev/admin/users/u1"],
      [on, "https://qrdx.dev/oauth/consent"],
      [off, "https://qrdx.dev/blog"],
      [both, "https://qrdx.dev/admin/growth"],
      [both, "https://qrdx.dev/console-static/x.js"],
    ] as const) {
      const response = await proxy(request(url));
      expect(forwarded(response)(SITE_KEY_HEADER), url).toBeUndefined();
    }
  });

  it("never sends the console's key header to the site", async () => {
    for (const pathname of ["/blog", "/blog/some-post", "/site-static/x.js"]) {
      const response = await both(
        request(`https://qrdx.dev${pathname}`, {
          [CONSOLE_KEY_HEADER]: "forged",
        }),
      );
      const sent = forwarded(response);
      expect(sent(SITE_KEY_HEADER), pathname).toBe(KEY);
      expect(sent(CONSOLE_KEY_HEADER), pathname).toBeUndefined();
    }
  });

  it("never sends the site's key header to the console", async () => {
    for (const pathname of ["/admin/growth", "/console-static/x.js"]) {
      const response = await both(
        request(`https://qrdx.dev${pathname}`, {
          [SITE_KEY_HEADER]: "forged",
        }),
      );
      const sent = forwarded(response);
      expect(sent(CONSOLE_KEY_HEADER), pathname).toBe(CONSOLE_KEY);
      expect(sent(SITE_KEY_HEADER), pathname).toBeUndefined();
    }
  });

  it("tells the zones apart when both are on: each gets its own key", async () => {
    const site = await both(request("https://qrdx.dev/blog/some-post"));
    expect(forwarded(site)(SITE_KEY_HEADER)).toBe(KEY);
    const console = await both(request("https://qrdx.dev/console-static/x.js"));
    expect(forwarded(console)(CONSOLE_KEY_HEADER)).toBe(CONSOLE_KEY);
  });

  it.each([
    ["/BLOG/some-post?page=2", "/blog/some-post?page=2"],
    ["/Blog", "/blog"],
    ["/SITE-STATIC/_next/x.js", "/site-static/_next/x.js"],
  ])("sends %s to the lower-case path, in both modes", async (path, target) => {
    for (const proxy of [on, off]) {
      const response = await proxy(request(`https://qrdx.dev${path}`));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://qrdx.dev${target}`,
      );
    }
  });

  it("answers 404 for dot segments in site paths, in both modes", async () => {
    for (const proxy of [on, off]) {
      // A bare %2e%2e segment never gets here: URL parsing resolves it first.
      for (const path of [
        "/site-static/a..b.js",
        "/site-static/a%2E%2Eb.js",
        "/blog/x%2Ey",
      ]) {
        const response = await proxy(request(`https://qrdx.dev${path}`));
        expect(response.status, path).toBe(404);
      }
    }
  });

  it("never looks up a session for the site's pages or assets", async () => {
    session.lookups = 0;
    for (const proxy of [on, off, both]) {
      for (const path of ["/blog", "/blog/some-post", "/site-static/x.js"]) {
        expect((await proxy(request(`https://qrdx.dev${path}`))).status).toBe(
          200,
        );
      }
    }
    expect(session.lookups).toBe(0);
  });

  describe("the home group", () => {
    const SESSION = "__Secure-better-auth.session_token=abc.def";

    afterAll(() => {
      session.signedIn = false;
    });

    it("sends a signed-in visitor on / to the dashboard before the site sees the request", async () => {
      session.signedIn = true;
      for (const proxy of [home, on, both, off]) {
        const response = await proxy(
          request("https://qrdx.dev/", { cookie: SESSION }),
        );
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
          "https://qrdx.dev/dashboard",
        );
        expect(forwarded(response)(SITE_KEY_HEADER)).toBeUndefined();
      }
      session.signedIn = false;
    });

    it("gives everyone else on / the site's key, with no session lookup", async () => {
      session.signedIn = false;
      session.lookups = 0;
      for (const url of ["https://qrdx.dev/", "https://qrdx.dev/?ref=x"]) {
        const response = await home(
          request(url, { [SITE_KEY_HEADER]: "forged", cookie: "theme=dark" }),
        );
        expect(response.status, url).toBe(200);
        expect(response.headers.get("location"), url).toBeNull();
        expect(forwarded(response)(SITE_KEY_HEADER), url).toBe(KEY);
      }
      expect(session.lookups).toBe(0);
    });

    it("gives a stale session cookie on / the site's page", async () => {
      session.signedIn = false;
      session.lookups = 0;
      const response = await home(
        request("https://qrdx.dev/", { cookie: SESSION }),
      );
      expect(session.lookups).toBe(1);
      expect(response.headers.get("location")).toBeNull();
      expect(forwarded(response)(SITE_KEY_HEADER)).toBe(KEY);
    });

    it("never redirects /home, signed in or not: it goes to the site", async () => {
      session.signedIn = true;
      session.lookups = 0;
      for (const cookie of [SESSION, "theme=dark"]) {
        const response = await home(
          request("https://qrdx.dev/home", { cookie }),
        );
        expect(response.status, cookie).toBe(200);
        expect(response.headers.get("location"), cookie).toBeNull();
        expect(forwarded(response)(SITE_KEY_HEADER), cookie).toBe(KEY);
      }
      expect(session.lookups).toBe(0);
      session.signedIn = false;
    });

    it("leaves / and /home to this app while the group is off", async () => {
      for (const proxy of [both, off]) {
        for (const pathname of ["/", "/home"]) {
          const response = await proxy(request(`https://qrdx.dev${pathname}`));
          expect(response.status, pathname).toBe(200);
          expect(forwarded(response)(SITE_KEY_HEADER), pathname).toBe(
            undefined,
          );
        }
      }
    });

    it("never gives the site's key to the root's other paths", async () => {
      for (const pathname of [
        "/home/x",
        "/homepage",
        "/home.md",
        "/index.md",
        "/opengraph-image-1a2b3c",
        "/twitter-image",
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml",
      ]) {
        const response = await home(request(`https://qrdx.dev${pathname}`));
        expect(forwarded(response)(SITE_KEY_HEADER), pathname).toBe(undefined);
      }
    });

    it.each([
      ["/HOME", "/home"],
      ["/Home?ref=x", "/home?ref=x"],
    ])("sends %s to %s with a 308, in every mode", async (path, target) => {
      for (const proxy of [home, on, both, off]) {
        const response = await proxy(request(`https://qrdx.dev${path}`));
        expect(response.status).toBe(308);
        expect(response.headers.get("location")).toBe(
          `https://qrdx.dev${target}`,
        );
      }
    });
  });
});
