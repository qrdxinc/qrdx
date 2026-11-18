// Links on translated pages keep the language: on /hi pages a link to
// /playground goes to /hi/playground (components/i18n/locale-link.tsx).
//
// Two checks, both fast enough for every push:
// 1. Source rules over everything app/[lang] imports (followed through the
//    import graph, so a component a translated page starts using is covered
//    the day it does, menus and dialogs included): no next/link or
//    next/navigation useRouter except through LocaleLink/useLocaleRouter,
//    and no plain <a href="/…"> or location change to a translated page.
// 2. The shared chrome and the home page's sections, rendered in Hindi: no
//    href to a page that exists in Hindi without the /hi prefix, and none
//    with the prefix to a page that's English only (the marketing pages,
//    since 17 Nov 2026), which would only redirect back. This catches hrefs
//    built from data, which the source rules can't see.
//
// A crawl of a production build found these bugs; a build-output scan was
// the alternative, but CI doesn't build the app (Vercel does) and closed
// menus aren't in the HTML.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  isEnglishOnlyPath,
  isLocalizedPath,
  localizeHref,
} from "@repo/i18n/paths";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const ROOT = resolve(import.meta.dirname, "../..");

// ─── 1. Source rules ─────────────────────────────────────────────────────────

/** The only files that may use next/link and useRouter directly. */
const WRAPPERS = new Set(["components/i18n/locale-link.tsx"]);

const EXTENSIONS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(tsx?|mdx)$/.test(name) ? [path] : [];
  });
}

const IMPORT =
  /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** Every source file app/[lang] reaches through its imports. */
function translatedPageGraph(): Map<string, string> {
  const sources = new Map<string, string>();
  const queue = filesIn(join(ROOT, "app/[lang]"));
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (sources.has(file)) continue;
    const source = readFileSync(file, "utf8");
    sources.set(file, source);
    for (const match of source.matchAll(IMPORT)) {
      const target = resolveImport(
        file,
        match[1] ?? match[2] ?? match[3] ?? "",
      );
      if (target && !sources.has(target)) queue.push(target);
    }
  }
  return sources;
}

/** A path a translated page has in some language ("/pricing"). */
const isTranslatedPath = (href: string) => {
  const path = href.split(/[?#]/)[0] ?? "";
  return (
    path.startsWith("/") && !path.startsWith("//") && isLocalizedPath(path)
  );
};

describe("links in code that translated pages import", () => {
  const graph = translatedPageGraph();
  const files = [...graph].filter(([file]) => !file.endsWith(".mdx"));
  const named = (file: string) => relative(ROOT, file);

  it("follows the import graph", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(graph.has(join(ROOT, "components/sections/navbar.tsx"))).toBe(true);
  });

  it("imports next/link only through LocaleLink", () => {
    const direct = files
      .filter(([, source]) => /from\s+["']next\/link["']/.test(source))
      .map(([file]) => named(file))
      .filter((file) => !WRAPPERS.has(file));
    expect(direct).toEqual([]);
  });

  it("navigates in code only through useLocaleRouter", () => {
    const direct = files
      .filter(([, source]) =>
        /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(
          source,
        ),
      )
      .map(([file]) => named(file))
      .filter((file) => !WRAPPERS.has(file));
    expect(direct).toEqual([]);
  });

  it("has no plain <a> or location change to a translated page", () => {
    const found: string[] = [];
    const patterns = [
      // <a href="/pricing">, <a href={"/pricing"}>, <a href={`/pricing?…`}>
      /<a\b[^>]*?\bhref=\{?\s*["'`](\/[^"'`$]*)/gs,
      // window.location.href = "/x", location.assign("/x"), location.replace("/x")
      /location(?:\.href)?\s*(?:=|\.assign\(|\.replace\()\s*["'`](\/[^"'`$]*)/g,
    ];
    for (const [file, source] of files) {
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          if (isTranslatedPath(match[1] ?? "")) {
            found.push(`${named(file)}: ${match[1]}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});

// ─── 2. Rendered in Hindi ────────────────────────────────────────────────────

/** The page the links render on: the Hindi home page unless a test moves it. */
const navigation = vi.hoisted(() => ({ pathname: "/hi" }));

/** Renders `run` as if on `pathname`, then back on the Hindi home page. */
async function onPage<T>(pathname: string, run: () => Promise<T>): Promise<T> {
  navigation.pathname = pathname;
  try {
    return await run();
  } finally {
    navigation.pathname = "/hi";
  }
}

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));

// next/link marks its anchors, so the docs-zone test below can tell them from
// plain <a> elements (both render as <a href>).
vi.mock("next/link", async (importOriginal) => {
  const { default: Link } = await importOriginal<typeof import("next/link")>();
  return {
    default: (props: ComponentProps<typeof Link>) => (
      <Link {...props} data-next-link="" />
    ),
  };
});

const hrefsIn = (html: string) =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );

/** Every internal href in `html` that should carry the /hi prefix but doesn't. */
function unprefixed(html: string): string[] {
  return hrefsIn(html).filter((href) => {
    const path = href.split(/[?#]/)[0] ?? "";
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    return localizeHref(href, "hi") !== href;
  });
}

/**
 * Every href in `html` to an English-only page with the /hi prefix, the home
 * page (/hi, /hi/home) included: each would redirect to the English URL.
 */
function redirecting(html: string): string[] {
  return hrefsIn(html).filter((href) => {
    const path = href.split(/[?#]/)[0] ?? "";
    const rest = /^\/hi(\/.*)?$/.exec(path);
    if (!rest) return false;
    const english = rest[1] ?? "/";
    return english === "/home" || isEnglishOnlyPath(english);
  });
}

const renderHindi = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="hi" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

describe("translated chrome and home sections, rendered in Hindi", () => {
  // Each section and links it must render as given (the owner's report and
  // the crawl of /hi: sample codes open /playground?type=…&sample=1, the
  // wall's generator pages, the use-case cards' tools). The marketing pages
  // are English only, so their links stay unprefixed; the logo goes to the
  // English home page's /home address.
  it.each([
    [
      "navbar",
      () => import("@/components/sections/navbar").then((m) => <m.Navbar />),
      ["/hi/playground", "/home", "/pricing"],
    ],
    [
      "footer",
      () =>
        import("@/components/sections/footer-section").then((m) => (
          <m.FooterSection />
        )),
      [
        "/hi/playground",
        "/hi/ai/art",
        "/hi/mcp",
        "/home",
        "/pricing",
        "/qr-codes-for/restaurants",
      ],
    ],
    [
      "call to action",
      () =>
        import("@/components/sections/cta-section").then((m) => (
          <m.CTASection />
        )),
      [],
    ],
    [
      "hero",
      () =>
        import("@/components/sections/hero-section").then((m) => (
          <m.HeroSection />
        )),
      ["/hi/playground"],
    ],
    [
      "feature rows",
      () =>
        import("@/components/sections/home/feature-rows-section").then((m) => (
          <m.FeatureRowsSection />
        )),
      ["/tools/bulk"],
    ],
    [
      "gallery wall",
      () =>
        import("@/components/sections/home/gallery-section").then((m) => (
          <m.GallerySection />
        )),
      [
        "/hi/playground?type=wifi&sample=1",
        "/qr-code-generator/wifi",
        "/hi/playground?tab=art",
      ],
    ],
    [
      "use cases",
      () =>
        import("@/components/sections/home/use-cases-section").then((m) => (
          <m.UseCasesSection />
        )),
      [
        "/hi/playground?type=vcard&sample=1&style=",
        "/tools/print-size",
        "/tools/bulk",
      ],
    ],
  ] as const)(
    "%s keeps /hi where the page has it",
    async (_name, load, expected) => {
      const html = renderHindi(await load()).replaceAll("&amp;", "&");
      for (const href of expected) expect(html).toContain(`href="${href}`);
      expect(unprefixed(html)).toEqual([]);
      expect(redirecting(html)).toEqual([]);
    },
  );

  it("prefixes query-string and hash links, and leaves pages hi doesn't have alone", () => {
    expect(
      localizeHref("/playground?type=url&sample=1&preset=orchid", "hi"),
    ).toBe("/hi/playground?type=url&sample=1&preset=orchid");
    expect(localizeHref("/ai/art#examples", "hi")).toBe("/hi/ai/art#examples");
    for (const href of [
      "/",
      "/pricing#faq",
      "/qr-code-generator/upi",
      "/community",
      "/legal/privacy-policy",
      "/templates/menu/cafe",
      "/playground/abc123",
    ]) {
      expect(localizeHref(href, "hi")).toBe(href);
    }
  });
});

// ─── 3. Into the docs zone ───────────────────────────────────────────────────

describe("links to the docs", () => {
  // The docs are moving to an app of their own behind the same URLs
  // (@repo/i18n/docs): a link into them loads the page in full.
  const render = async (href: string, props: object = {}) => {
    const { LocaleLink } = await import("@/components/i18n/locale-link");
    return renderHindi(
      <LocaleLink href={href} {...props}>
        x
      </LocaleLink>,
    );
  };

  it("are plain <a> elements to the English page, on a translated page too", async () => {
    // The docs are English only: the link goes straight to /docs/..., not
    // through the redirect from /hi/docs/....
    for (const href of [
      "/docs",
      "/docs/dynamic-qr-codes",
      "/docs/developers/rest-api#auth",
    ]) {
      const html = await render(href, { prefetch: false });
      expect(html).toBe(`<a href="${href}">x</a>`);
    }
  });

  it("leave every other page to next/link", async () => {
    expect(await render("/playground")).toContain("data-next-link");
    // The (app) layout's pages, linked from one of its own (a link from
    // app/[lang] into them is a plain <a>: below).
    await onPage("/customers", async () => {
      expect(await render("/customers/acme")).toContain("data-next-link");
      // A docs page's Markdown is a file, not a page of either app.
      expect(await render("/docs/dynamic-qr-codes.md")).toContain(
        "data-next-link",
      );
    });
  });
});

// ─── 4. Into the site zone ───────────────────────────────────────────────────

describe("links to the site's pages", () => {
  // The blog is moving to the marketing site behind the same URLs
  // (@repo/next-config/site-zone), and this app serves it until then: a link
  // into it loads the page in full in both modes.
  const render = async (href: string, props: object = {}) => {
    const { LocaleLink } = await import("@/components/i18n/locale-link");
    return renderHindi(
      <LocaleLink href={href} {...props}>
        x
      </LocaleLink>,
    );
  };

  /** The <a> tags in `html` whose href is a site page. */
  const siteAnchors = (html: string) =>
    [...html.matchAll(/<a\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => /\bhref="\/blog(?:[/"?#])/.test(tag));

  it("are plain <a> elements", async () => {
    for (const href of [
      "/blog",
      "/blog/dynamic-vs-static-qr-codes",
      "/blog/category/education?page=2#top",
      "/pricing",
      "/templates",
      "/integrations/zapier",
      // The home page, at either address (the home group).
      "/",
      "/?ref=x",
      "/home",
    ]) {
      expect(await render(href, { prefetch: false })).toBe(
        `<a href="${href}">x</a>`,
      );
    }
  });

  it("leave neighbouring pages to next/link", async () => {
    // Pages of the (app) layout, linked from one of its own.
    await onPage("/customers", async () => {
      expect(await render("/customers")).toContain("data-next-link");
      expect(await render("/blogx")).toContain("data-next-link");
      // The home group is / and /home exactly.
      expect(await render("/homepage")).toContain("data-next-link");
      expect(await render("/home/x")).toContain("data-next-link");
      // The templates' own pages and Slack's linking page stay in this app.
      expect(await render("/templates/wifi")).toContain("data-next-link");
      expect(await render("/integrations/slack/link")).toContain(
        "data-next-link",
      );
    });
  });

  it("hold for the header and footer entries that point at the blog", async () => {
    const { Navbar } = await import("@/components/sections/navbar");
    const { FooterSection } = await import(
      "@/components/sections/footer-section"
    );
    for (const [name, node] of [
      ["navbar", <Navbar key="navbar" />],
      ["footer", <FooterSection key="footer" />],
    ] as const) {
      const anchors = siteAnchors(renderHindi(node));
      expect(anchors.length, name).toBeGreaterThan(0);
      for (const tag of anchors) {
        expect(tag, `${name}: ${tag}`).not.toContain("data-next-link");
      }
    }
  });

  it("hold for the logo, which links to the home page's /home", async () => {
    const { Navbar } = await import("@/components/sections/navbar");
    const { FooterSection } = await import(
      "@/components/sections/footer-section"
    );
    for (const [name, node] of [
      ["navbar", <Navbar key="navbar" />],
      ["footer", <FooterSection key="footer" />],
    ] as const) {
      const logos = [...renderHindi(node).matchAll(/<a\b[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => /\bhref="\/home"/.test(tag));
      expect(logos.length, name).toBeGreaterThan(0);
      for (const tag of logos) {
        expect(tag, `${name}: ${tag}`).not.toContain("data-next-link");
      }
    }
  });
});

// ─── 5. Across this app's two root layouts ───────────────────────────────────

describe("links across this app's two root layouts", () => {
  // app/[lang] (translated and English-only pages) and app/(app) (sign-in,
  // the dashboard, shared themes …) are separate root layouts: Next loads a
  // page across them in full even through next/link, so the link is a plain
  // <a>, and the visit's start rides along (@repo/analytics/landing).
  const render = async (href: string, props: object = {}) => {
    const { LocaleLink } = await import("@/components/i18n/locale-link");
    return renderHindi(
      <LocaleLink href={href} {...props}>
        x
      </LocaleLink>,
    );
  };

  it("are plain <a> elements from app/[lang] into app/(app)", async () => {
    for (const pathname of ["/hi", "/hi/playground", "/en/scan", "/mcp"]) {
      await onPage(pathname, async () => {
        for (const href of [
          "/dashboard",
          "/sign-in?mode=signup&next=%2Fdashboard",
          "/settings/general",
          // A shared theme: /playground/<id> is app/(app)'s.
          "/playground/abc123",
          "/community",
        ]) {
          expect(
            await render(href, { prefetch: false }),
            `${pathname} → ${href}`,
          ).toBe(`<a href="${href.replaceAll("&", "&amp;")}">x</a>`);
        }
      });
    }
  });

  it("are plain <a> elements from app/(app) into app/[lang], in the page's language", async () => {
    for (const pathname of ["/dashboard/acme", "/sign-in", "/community"]) {
      await onPage(pathname, async () => {
        expect(await render("/playground", { prefetch: false })).toBe(
          '<a href="/hi/playground">x</a>',
        );
        expect(await render("/ai/art", { prefetch: false })).toBe(
          '<a href="/hi/ai/art">x</a>',
        );
      });
    }
  });

  it("leave links within one root layout to next/link", async () => {
    expect(await render("/ai")).toContain("data-next-link");
    expect(await render("/playground#editor")).toContain("data-next-link");
    await onPage("/dashboard/acme", async () => {
      expect(await render("/settings/general")).toContain("data-next-link");
      expect(await render("/dashboard/acme/codes")).toContain("data-next-link");
    });
    // In-page links and other sites aren't page loads into either layout.
    expect(await render("#top")).toContain("data-next-link");
  });

  it("tell the two layouts apart exactly as their route folders do", async () => {
    const { isLangRootPath } = await import("@repo/i18n/paths");
    /** Every page route under `dir`, route groups dropped, dynamic segments filled in. */
    const routes = (dir: string, at = ""): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory()) {
          return entry.name === "page.tsx" ? [at || "/"] : [];
        }
        const name = entry.name;
        // Parallel routes and private folders aren't URL segments of their own.
        if (name.startsWith("@") || name.startsWith("_")) return [];
        const segment = name.startsWith("(")
          ? ""
          : name.startsWith("[")
            ? "/x"
            : `/${name}`;
        return routes(join(dir, name), `${at}${segment}`);
      });
    const lang = routes(join(ROOT, "app/[lang]"));
    const app = routes(join(ROOT, "app/(app)"));
    expect(lang.length).toBeGreaterThan(20);
    expect(app.length).toBeGreaterThan(50);
    for (const route of lang) {
      expect(isLangRootPath(route), `app/[lang] ${route}`).toBe(true);
      expect(isLangRootPath(`/es${route === "/" ? "" : route}`), route).toBe(
        true,
      );
    }
    for (const route of app) {
      expect(isLangRootPath(route), `app/(app) ${route}`).toBe(false);
    }
  });
});
