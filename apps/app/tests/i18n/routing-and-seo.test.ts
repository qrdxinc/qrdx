// Translated pages: URLs, the review gate (noindex, sitemap, hreflang) in
// both states, the English rewrites and redirects in next.config.ts. The
// marketing pages are English only (owner, 17 Nov 2026): no prefix, no
// hreflang and no translated sitemap entries for them, in either state
// (tests/i18n/english-only.test.ts runs their redirects through Next).

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  LOCALE_INFO,
  LOCALES,
  localeFromSegment,
  TRANSLATED_LOCALES,
} from "@repo/i18n/config";
import {
  ENGLISH_ONLY_OUTSIDE_PATHS,
  ENGLISH_ONLY_PATHS,
  isEnglishOnlyPath,
  isLocalizedPath,
  isSiteTranslatedPath,
  LOCALIZED_PATHS,
  localizeHref,
  localizePath,
  localizeSitePath,
  routeMatcher,
  SITE_TRANSLATED_PATHS,
  splitLocale,
} from "@repo/i18n/paths";
import {
  INDEXED_MACHINE_PATHS,
  isIndexedWhenMachine,
  isPublished,
  publishedLocales,
  REVIEW,
  type ReviewTable,
} from "@repo/i18n/review";
import {
  englishOnlyRedirects,
  englishRedirects,
  englishRewrites,
  rewriteSource,
} from "@repo/i18n/routing";
import { describe, expect, it } from "vitest";
import { alternateLanguages, localizedMetadata } from "@/lib/i18n/metadata";
import { localizedEntries } from "@/lib/i18n/sitemap";
import { baseUrl } from "@/lib/metadata";

// Next's own copy of the matcher it applies to next.config.ts (no types).
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  pathToRegexp: (
    source: string,
    keys: unknown[],
    options: { strict: boolean },
  ) => RegExp;
};

const abs = (path: string) => new URL(path, baseUrl).toString();
const APP = join(import.meta.dirname, "../../app");

/** Every translation still machine-made (the state this PR ships in). */
const MACHINE = Object.fromEntries(
  TRANSLATED_LOCALES.map((locale) => [locale, "machine"]),
) as ReviewTable;
/** Spanish and Simplified Chinese signed off by a native reviewer. */
const SIGNED_OFF: ReviewTable = {
  ...MACHINE,
  es: "reviewed",
  "zh-Hans": "reviewed",
};

describe("locales", () => {
  // A new language is one entry in LOCALE_CONFIG: these hold for any entry.
  const appDirs = [
    ...readdirSync(join(APP, "(app)")),
    ...readdirSync(join(APP, "(app)", "(home)")),
    ...readdirSync(APP),
  ];

  it("start with English, the source", () => {
    expect(LOCALES[0]).toBe("en");
    expect(LOCALE_INFO.en.review).toBe("reviewed");
  });

  it.each(LOCALES)("%s has a usable definition", (locale) => {
    const info = LOCALE_INFO[locale];
    expect(info.segment).toMatch(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/);
    expect(localeFromSegment(info.segment)).toBe(locale);
    expect(info.hreflang.length).toBeGreaterThan(0);
    expect(info.ogLocale).toMatch(/^[a-z]{2,3}_[A-Z]{2}$/);
    expect(["ltr", "rtl"]).toContain(info.dir);
    expect(info.name.trim()).not.toBe("");
    // Its first URL segment can't shadow a page or route: /p, /q, /docs.
    expect(appDirs).not.toContain(info.segment);
    // The language code is a valid BCP 47 tag the browser knows.
    expect(() => new Intl.Locale(locale)).not.toThrow();
  });

  it("use each URL segment once", () => {
    const segments = LOCALES.map((locale) => LOCALE_INFO[locale].segment);
    expect(new Set(segments).size).toBe(segments.length);
    expect(localeFromSegment("pt-BR")).toBeUndefined();
    expect(localeFromSegment("xx")).toBeUndefined();
  });

  it("have a review state each", () => {
    expect(Object.keys(REVIEW).sort()).toEqual([...TRANSLATED_LOCALES].sort());
  });
});

/**
 * The marketing pages the owner made English only (17 Nov 2026). Not /scan
 * yet: each language's scanner is its own installed app, scoped to
 * /<lang>/scan (lib/scanner-app.ts), so the owner decides that one apart.
 */
const MARKETING = [
  "/",
  "/pricing",
  "/guarantee",
  "/enterprise",
  "/security",
  "/tools",
  "/tools/bulk",
  "/tools/print-size",
  "/tools/scan-checker",
  "/barcode-generator",
  "/barcode-generator/[format]",
  "/qr-code-generator",
  "/qr-code-generator/[type]",
  "/qr-codes-for",
  "/qr-codes-for/[slug]",
  "/qr-codes-on",
  "/qr-codes-on/[slug]",
  "/templates",
  "/integrations",
  "/integrations/[slug]",
  "/plugins",
  "/qr-code-api",
  "/dynamic-qr-code",
  "/open-source-qr-code-generator",
  "/compare",
];

describe("paths", () => {
  it("translate the playground, AI, MCP and scanner pages only", () => {
    expect([...LOCALIZED_PATHS].sort()).toEqual([
      "/ai",
      "/ai/art",
      "/mcp",
      "/playground",
      "/scan",
    ]);
    expect([...ENGLISH_ONLY_PATHS].sort()).toEqual([...MARKETING].sort());
    for (const path of LOCALIZED_PATHS) {
      expect(isEnglishOnlyPath(path), path).toBe(false);
    }
  });

  it("keep every English-only page under app/[lang], where it renders", () => {
    for (const path of ENGLISH_ONLY_PATHS) {
      expect(
        existsSync(join(APP, "[lang]", "(home)", path, "page.tsx")),
        path,
      ).toBe(true);
    }
  });

  it("prefix translated pages only", () => {
    expect(localizePath("/playground", "es")).toBe("/es/playground");
    expect(localizePath("/ai/art", "pt-BR")).toBe("/pt-br/ai/art");
    expect(localizePath("/mcp", "zh-Hans")).toBe("/zh-hans/mcp");
    expect(localizePath("/playground", "en")).toBe("/playground");
    // The marketing pages are English only, the home page too: one URL in
    // every language, so no link leads to a redirect.
    for (const path of [
      "/",
      "/pricing",
      "/qr-code-generator/wifi",
      "/integrations/zapier",
    ]) {
      expect(localizePath(path, "ja"), path).toBe(path);
      expect(isEnglishOnlyPath(path), path).toBe(true);
    }
    // The playground's shared theme links and short links keep one URL in
    // every language.
    for (const path of ["/playground/abc", "/q/abc", "/p/abc", "/m/abc"]) {
      expect(localizePath(path, "ja")).toBe(path);
    }
  });

  it("never prefix docs pages: the docs are English only", () => {
    expect(localizePath("/docs", "ja")).toBe("/docs");
    expect(localizePath("/docs/developers/mcp", "pt-BR")).toBe(
      "/docs/developers/mcp",
    );
    expect(localizeHref("/docs/help#faq", "zh-Hans")).toBe("/docs/help#faq");
    expect(localizeHref("/docs/help?x=1", "hi")).toBe("/docs/help?x=1");
    expect(localizePath("/docs/help", "en")).toBe("/docs/help");
  });

  it("keep queries and hashes, and leave external links alone", () => {
    expect(localizeHref("/playground?type=wifi#preview", "de")).toBe(
      "/de/playground?type=wifi#preview",
    );
    expect(localizeHref("/pricing?currency=inr#faq", "de")).toBe(
      "/pricing?currency=inr#faq",
    );
    expect(localizeHref("https://github.com/qrdxinc/qrdx", "de")).toBe(
      "https://github.com/qrdxinc/qrdx",
    );
    expect(localizeHref("mailto:support@qrdx.dev", "de")).toBe(
      "mailto:support@qrdx.dev",
    );
    expect(localizeHref("//evil.example/pricing", "de")).toBe(
      "//evil.example/pricing",
    );
  });

  it("split a pathname into its language and English path", () => {
    expect(splitLocale("/es/playground")).toEqual({
      locale: "es",
      path: "/playground",
    });
    expect(splitLocale("/ja/ai/art")).toEqual({
      locale: "ja",
      path: "/ai/art",
    });
    expect(splitLocale("/pricing")).toEqual({ locale: "en", path: "/pricing" });
    // English-only pages have no other language: those URLs redirect.
    expect(splitLocale("/es/pricing")).toEqual({
      locale: "en",
      path: "/es/pricing",
    });
    expect(splitLocale("/ja")).toEqual({ locale: "en", path: "/ja" });
    // The docs have no translated URLs (/es/docs redirects to /docs).
    expect(splitLocale("/docs/help")).toEqual({
      locale: "en",
      path: "/docs/help",
    });
    expect(splitLocale("/es/docs")).toEqual({ locale: "en", path: "/es/docs" });
    // What an English page prerenders as (usePathname() says /en/pricing
    // there): the same English path as the browser's /pricing, for
    // translated and English-only pages alike.
    expect(splitLocale("/en/pricing")).toEqual({
      locale: "en",
      path: "/pricing",
    });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/en/qr-code-generator/wifi")).toEqual({
      locale: "en",
      path: "/qr-code-generator/wifi",
    });
    expect(splitLocale("/en/playground")).toEqual({
      locale: "en",
      path: "/playground",
    });
    expect(splitLocale("/en/q/abc")).toEqual({
      locale: "en",
      path: "/en/q/abc",
    });
    expect(isLocalizedPath("/docs")).toBe(false);
  });
});

describe("review gate, before review (every locale machine-made)", () => {
  it("indexes English only", () => {
    expect(publishedLocales("/playground", MACHINE)).toEqual(["en"]);
    expect(isPublished("es", "/playground", MACHINE)).toBe(false);
  });

  it("makes translated pages noindex, self-canonical, with no hreflang", () => {
    const es = localizedMetadata({
      locale: "es",
      path: "/playground",
      title: "Diseñador",
      review: MACHINE,
    });
    expect(es.robots).toEqual({ index: false, follow: true });
    expect(es.alternates?.canonical).toBe(abs("/es/playground"));
    expect(es.alternates?.languages).toBeUndefined();
    expect(es.openGraph?.locale).toBe("es_ES");
  });

  it("keeps the English page indexable and claiming no translations", () => {
    const en = localizedMetadata({
      locale: "en",
      path: "/playground",
      title: "Designer",
      review: MACHINE,
    });
    expect(en.robots).toBeUndefined();
    expect(en.alternates?.canonical).toBe(abs("/playground"));
    expect(en.alternates?.languages).toBeUndefined();
    expect(alternateLanguages("/mcp", MACHINE)).toBeUndefined();
  });

  it("lists only English in the sitemap, without alternates", () => {
    const entries = localizedEntries("/playground", { priority: 0.9 }, MACHINE);
    expect(entries).toEqual([{ url: abs("/playground"), priority: 0.9 }]);
  });
});

describe("review gate, after review (one config change)", () => {
  it("indexes the reviewed languages", () => {
    expect(publishedLocales("/playground", SIGNED_OFF)).toEqual([
      "en",
      "es",
      "zh-Hans",
    ]);
    const es = localizedMetadata({
      locale: "es",
      path: "/playground",
      title: "Diseñador",
      review: SIGNED_OFF,
    });
    expect(es.robots).toBeUndefined();
    expect(es.alternates?.canonical).toBe(abs("/es/playground"));
  });

  it("links every indexable version with hreflang and x-default, never an unreviewed one", () => {
    const languages = {
      en: abs("/playground"),
      es: abs("/es/playground"),
      "zh-CN": abs("/zh-hans/playground"),
      "zh-SG": abs("/zh-hans/playground"),
      "x-default": abs("/playground"),
    };
    for (const locale of ["en", "es", "zh-Hans"] as const) {
      const metadata = localizedMetadata({
        locale,
        path: "/playground",
        title: "x",
        review: SIGNED_OFF,
      });
      expect(metadata.alternates?.languages).toEqual(languages);
    }
    const en = localizedMetadata({
      locale: "en",
      path: "/playground",
      title: "Designer",
      review: SIGNED_OFF,
    });
    expect(en.openGraph).toMatchObject({
      locale: "en_US",
      alternateLocale: ["es_ES", "zh_CN"],
    });
    // German is still machine-made: noindex, and no hreflang from it.
    const de = localizedMetadata({
      locale: "de",
      path: "/playground",
      title: "Designer",
      review: SIGNED_OFF,
    });
    expect(de.robots).toEqual({ index: false, follow: true });
    expect(de.alternates?.languages).toBeUndefined();
  });

  it("puts each reviewed version in the sitemap with every alternate", () => {
    const entries = localizedEntries("/ai", { priority: 1 }, SIGNED_OFF);
    expect(entries.map((entry) => entry.url)).toEqual([
      abs("/ai"),
      abs("/es/ai"),
      abs("/zh-hans/ai"),
    ]);
    expect(entries.map((entry) => entry.priority)).toEqual([1, 0.9, 0.9]);
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        en: abs("/ai"),
        es: abs("/es/ai"),
        "zh-CN": abs("/zh-hans/ai"),
        "zh-SG": abs("/zh-hans/ai"),
        "x-default": abs("/ai"),
      });
    }
  });

  it("can open single pages of a locale", () => {
    const review: ReviewTable = { ...MACHINE, ja: ["/mcp"] };
    expect(isPublished("ja", "/mcp", review)).toBe(true);
    expect(isPublished("ja", "/playground", review)).toBe(false);
  });
});

describe("English-only marketing pages, in either review state", () => {
  it.each([
    ["machine-made", MACHINE],
    ["signed off", SIGNED_OFF],
  ] as const)("claim no translations when %s", (_state, review) => {
    for (const path of ["/", "/pricing", "/qr-code-generator/wifi"]) {
      const en = localizedMetadata({ locale: "en", path, title: "x", review });
      expect(en.robots, path).toBeUndefined();
      expect(en.alternates?.canonical, path).toBe(abs(path));
      expect(en.alternates?.languages, path).toBeUndefined();
      expect(en.openGraph?.locale, path).toBe("en_US");
      expect(en.openGraph, path).not.toHaveProperty("alternateLocale");
      expect(alternateLanguages(path, review), path).toBeUndefined();
    }
  });

  it.each([
    ["machine-made", MACHINE],
    ["signed off", SIGNED_OFF],
  ] as const)("are one English sitemap entry when %s", (_state, review) => {
    expect(localizedEntries("/", { priority: 1 }, review)).toEqual([
      { url: abs("/"), priority: 1 },
    ]);
    expect(localizedEntries("/pricing", { priority: 0.9 }, review)).toEqual([
      { url: abs("/pricing"), priority: 0.9 },
    ]);
  });

  it("are never indexed in another language, where the redirect didn't run", () => {
    // Only on a host that isn't QRdx's: the redirect sends /es/pricing to
    // /pricing everywhere else.
    const es = localizedMetadata({
      locale: "es",
      path: "/pricing",
      title: "Precios",
      review: SIGNED_OFF,
    });
    expect(es.robots).toEqual({ index: false, follow: true });
    expect(es.alternates?.canonical).toBe(abs("/pricing"));
    expect(es.alternates?.languages).toBeUndefined();
  });
});

// The QR code generators in every language (owner decision, 23 Nov 2026),
// and the barcode generators the same way: the site zone serves them at
// /<lang>/qr-code-generator/... and /<lang>/barcode-generator/..., and their
// machine translations are indexed, unlike every other page's. This app's
// own copies stay English only (above).
describe("generator pages the site serves in every language", () => {
  it("are English-only pages here, listed once", () => {
    expect([...SITE_TRANSLATED_PATHS]).toEqual([
      "/qr-code-generator",
      "/qr-code-generator/[type]",
      "/barcode-generator",
      "/barcode-generator/[format]",
    ]);
    for (const path of SITE_TRANSLATED_PATHS) {
      expect(ENGLISH_ONLY_PATHS, path).toContain(path);
      expect(LOCALIZED_PATHS, path).not.toContain(path);
    }
    expect(isSiteTranslatedPath("/qr-code-generator")).toBe(true);
    expect(isSiteTranslatedPath("/qr-code-generator/wifi")).toBe(true);
    expect(isSiteTranslatedPath("/qr-code-generator/wifi/x")).toBe(false);
    expect(isSiteTranslatedPath("/barcode-generator")).toBe(true);
    expect(isSiteTranslatedPath("/barcode-generator/ean-13")).toBe(true);
    expect(isSiteTranslatedPath("/barcode-generator/ean-13/x")).toBe(false);
    expect(isSiteTranslatedPath("/qr-codes-for/restaurants")).toBe(false);
    expect(isSiteTranslatedPath("/playground")).toBe(false);
  });

  it("get the language's prefix in the site's links, English none", () => {
    expect(localizeSitePath("/qr-code-generator/wifi", "es")).toBe(
      "/es/qr-code-generator/wifi",
    );
    expect(localizeSitePath("/qr-code-generator", "zh-Hans")).toBe(
      "/zh-hans/qr-code-generator",
    );
    expect(localizeSitePath("/qr-code-generator/wifi", "en")).toBe(
      "/qr-code-generator/wifi",
    );
    expect(localizeSitePath("/barcode-generator/ean-13", "ja")).toBe(
      "/ja/barcode-generator/ean-13",
    );
    expect(localizeSitePath("/barcode-generator", "pt-BR")).toBe(
      "/pt-br/barcode-generator",
    );
    // Any other page keeps its one URL, and this app's own links don't change.
    expect(localizeSitePath("/pricing", "es")).toBe("/pricing");
    expect(localizeSitePath("/playground", "es")).toBe("/playground");
    expect(localizePath("/qr-code-generator/wifi", "es")).toBe(
      "/qr-code-generator/wifi",
    );
    expect(localizeHref("/qr-code-generator", "ja")).toBe("/qr-code-generator");
  });

  it("are indexed in every language while every locale is machine-made: the QR code generators", () => {
    expect([...INDEXED_MACHINE_PATHS]).toEqual([
      "/qr-code-generator",
      "/qr-code-generator/[type]",
    ]);
    for (const path of INDEXED_MACHINE_PATHS) {
      expect(SITE_TRANSLATED_PATHS, path).toContain(path);
    }
    for (const path of ["/qr-code-generator", "/qr-code-generator/wifi"]) {
      expect(isIndexedWhenMachine(path), path).toBe(true);
      expect(publishedLocales(path, MACHINE), path).toEqual([...LOCALES]);
      for (const locale of TRANSLATED_LOCALES) {
        expect(isPublished(locale, path, MACHINE), locale).toBe(true);
      }
    }
  });

  // Owner decision, 25 Nov 2026 (tiered indexing): their translated URLs
  // redirected to English while the site's sitemap and hreflang listed
  // them, so they follow their languages' review state instead.
  it("leave the barcode generators' translations to the review state", () => {
    for (const path of ["/barcode-generator", "/barcode-generator/ean-13"]) {
      expect(isIndexedWhenMachine(path), path).toBe(false);
      expect(publishedLocales(path, MACHINE), path).toEqual(["en"]);
      for (const locale of TRANSLATED_LOCALES) {
        expect(isPublished(locale, path, MACHINE), locale).toBe(false);
      }
    }
    // A language a native speaker signs off is indexed, as on any page.
    expect(publishedLocales("/barcode-generator/ean-13", SIGNED_OFF)).toEqual([
      "en",
      "es",
      "zh-Hans",
    ]);
  });

  it("leave every other page's review state alone", () => {
    for (const path of [...LOCALIZED_PATHS, "/pricing", "/qr-codes-for"]) {
      expect(isIndexedWhenMachine(path), path).toBe(false);
      expect(publishedLocales(path, MACHINE), path).toEqual(["en"]);
    }
    expect(publishedLocales("/playground", SIGNED_OFF)).toEqual([
      "en",
      "es",
      "zh-Hans",
    ]);
    // The playground, AI, MCP and scanner pages stay noindex in Spanish.
    for (const path of LOCALIZED_PATHS) {
      const es = localizedMetadata({ locale: "es", path, title: "x" });
      expect(es.robots, path).toEqual({ index: false, follow: true });
    }
  });
});

describe("next.config.ts routing", () => {
  const matches = (source: string, path: string) =>
    pathToRegexp(source, [], { strict: true }).test(path);

  it("rewrites English URLs to [lang]=en, translated or English only", () => {
    expect(englishRewrites()).toEqual(
      [...LOCALIZED_PATHS, ...ENGLISH_ONLY_PATHS].map((path) => {
        const source = rewriteSource(path);
        const target = source.replace(/\([^)]*\)/g, "");
        return {
          source,
          destination: target === "/" ? "/en" : `/en${target}`,
        };
      }),
    );
    // Dynamic routes are one rule each, in next.config.ts syntax.
    expect(englishRewrites()).toContainEqual({
      source: "/qr-code-generator/:type([^/.]+)",
      destination: "/en/qr-code-generator/:type",
    });
    for (const rule of englishRewrites()) {
      expect(
        matches(rule.source, "/integrations/slack/link"),
        rule.source,
      ).toBe(false);
    }
  });

  it("matches dynamic segments the way the folders name them", () => {
    expect(rewriteSource("/compare/[slug]")).toBe("/compare/:slug([^/.]+)");
    expect(rewriteSource("/docs/[...slug]")).toBe("/docs/:slug+");
    expect(rewriteSource("/docs/[[...slug]]")).toBe("/docs/:slug*");
    const one = routeMatcher("/compare/[slug]");
    expect(one("/compare/qr-tiger")).toBe(true);
    expect(one("/compare")).toBe(false);
    expect(one("/compare/a/b")).toBe(false);
    expect(one("/compare/logo.svg")).toBe(false);
    const some = routeMatcher("/docs/[...slug]");
    expect(some("/docs/a/b")).toBe(true);
    expect(some("/docs")).toBe(false);
    const any = routeMatcher("/docs/[[...slug]]");
    expect(any("/docs")).toBe(true);
    expect(any("/docs/a/b")).toBe(true);
    expect(any("/docsx")).toBe(false);
    expect(routeMatcher("/pricing")("/pricing/x")).toBe(false);
    // Generator pages are English only; links to them keep that URL.
    expect(isLocalizedPath("/qr-code-generator/wifi")).toBe(false);
    expect(isEnglishOnlyPath("/qr-code-generator/wifi")).toBe(true);
    expect(isEnglishOnlyPath("/qr-code-generator/wifi/x")).toBe(false);
    expect(localizeHref("/qr-codes-on/menus#sizing", "ja")).toBe(
      "/qr-codes-on/menus#sizing",
    );
    expect(localizeHref("/ai/art#examples", "ja")).toBe("/ja/ai/art#examples");
    // Short links and app routes never are.
    for (const path of ["/q/abc", "/p/abc", "/m/abc", "/dashboard", "/docs"]) {
      expect(isLocalizedPath(path), path).toBe(false);
    }
  });

  it("redirects /en and /en/... to the unprefixed URL on QRdx hosts only", () => {
    const [home, pages] = englishRedirects("(?:qrdx\\.dev)");
    expect(home).toMatchObject({
      source: "/en",
      destination: "/",
      permanent: true,
    });
    expect(pages?.permanent).toBe(true);
    expect(home?.has).toEqual([{ type: "host", value: "(?:qrdx\\.dev)" }]);
    expect(matches(pages?.source ?? "", "/en/pricing")).toBe(true);
    // The English pages' Open Graph images live under /en/... and stay put.
    expect(
      matches(pages?.source ?? "", "/en/pricing/opengraph-image-whxmcp"),
    ).toBe(false);
    expect(matches(pages?.source ?? "", "/en/pricing/twitter-image")).toBe(
      false,
    );
  });

  it("leaves out the pages the site serves in every language, when told to", () => {
    const rules = englishOnlyRedirects("(?:qrdx\\.dev)", {
      except: SITE_TRANSLATED_PATHS,
    });
    expect(rules).toHaveLength(
      ENGLISH_ONLY_PATHS.length -
        SITE_TRANSLATED_PATHS.length +
        ENGLISH_ONLY_OUTSIDE_PATHS.length +
        1,
    );
    const target = (path: string) =>
      rules.find((rule) => matches(rule.source, path))?.destination;
    expect(target("/es/qr-code-generator")).toBeUndefined();
    expect(target("/es/qr-code-generator/wifi")).toBeUndefined();
    expect(target("/ja/barcode-generator/ean-13")).toBeUndefined();
    // One group's pages alone: the other's still redirect.
    const generatorsOnly = englishOnlyRedirects("(?:qrdx\\.dev)", {
      except: ["/qr-code-generator", "/qr-code-generator/[type]"],
    });
    expect(
      generatorsOnly.find((rule) =>
        matches(rule.source, "/ja/barcode-generator/ean-13"),
      )?.destination,
    ).toBe("/barcode-generator/:format");
    expect(target("/es/pricing")).toBe("/pricing");
    expect(target("/es")).toBe("/");
    // Only English-only pages, named as they're listed.
    expect(() =>
      englishOnlyRedirects("(?:qrdx\\.dev)", { except: ["/playground"] }),
    ).toThrow("/playground");
    expect(() =>
      englishOnlyRedirects("(?:qrdx\\.dev)", {
        except: ["/qr-code-generator/wifi"],
      }),
    ).toThrow("/qr-code-generator/wifi");
  });

  it("redirects the English-only pages' translated URLs permanently, but the site-translated pages only for now", () => {
    const rules = englishOnlyRedirects("(?:qrdx\\.dev)");
    // One per page (under app/[lang] or not), and /<language>/home.
    expect(rules).toHaveLength(
      ENGLISH_ONLY_PATHS.length + ENGLISH_ONLY_OUTSIDE_PATHS.length + 1,
    );
    for (const rule of rules) {
      expect(rule.has).toEqual([{ type: "host", value: "(?:qrdx\\.dev)" }]);
    }
    const permanent = (path: string) =>
      rules.find((rule) => matches(rule.source, path))?.permanent;
    // 308: nobody asks for these URLs back, the pages outside app/[lang]
    // (never translated) included.
    for (const path of [
      "/es",
      "/es/home",
      "/es/pricing",
      "/it/qr-codes-for/restaurants",
      "/fr/compare",
      "/es/compare/uniqode",
      "/ja/blog",
      "/de/blog/rss.xml",
      "/hi/legal/privacy-policy",
      "/ko/qr-code-tracking",
    ]) {
      expect(permanent(path), path).toBe(true);
    }
    // 307: the site serves these in every language while its group is on,
    // so a redirect to English is only ever temporary: the QR code
    // generators and the barcode generators (barcodes-i18n).
    for (const path of [
      "/es/qr-code-generator",
      "/ja/qr-code-generator/wifi",
      "/es/barcode-generator",
      "/ja/barcode-generator/ean-13",
    ]) {
      expect(permanent(path), path).toBe(false);
    }
    expect(
      rules
        .filter((rule) => !rule.permanent)
        .map((rule) => rule.destination)
        .sort(),
    ).toEqual(
      SITE_TRANSLATED_PATHS.map((path) =>
        path.replace("[type]", ":type").replace("[format]", ":format"),
      ).sort(),
    );
    const target = (path: string) =>
      rules.find((rule) => matches(rule.source, path))?.destination;
    expect(target("/es")).toBe("/");
    expect(target("/es/home")).toBe("/home");
    expect(target("/pt-br/pricing")).toBe("/pricing");
    expect(target("/zh-hans/qr-code-generator/wifi")).toBe(
      "/qr-code-generator/:type",
    );
    // Every translated language, never English (englishRedirects, 308).
    for (const locale of TRANSLATED_LOCALES) {
      expect(target(`/${LOCALE_INFO[locale].segment}/tools`), locale).toBe(
        "/tools",
      );
    }
    expect(target("/en/pricing")).toBeUndefined();
    // Translated pages, other paths and files keep their URLs.
    for (const path of [
      "/es/playground",
      "/es/ai",
      "/es/ai/art",
      "/es/mcp",
      "/es/docs",
      "/es/community",
      "/es/pricing/opengraph-image-whxmcp",
      "/es/integrations/zapier.svg",
      "/esx/pricing",
    ]) {
      expect(target(path), path).toBeUndefined();
    }
  });
});
