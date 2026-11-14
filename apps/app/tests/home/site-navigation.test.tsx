// The site's chrome (config/navigation.ts): the header's menus, the mobile
// menu and the footer.
// 1. One name per destination: a page is called the same in the header, the
//    mobile menu and the footer, so visitors learn one word for it. Checked
//    on the config and on the rendered header and footer.
// 2. No dead links: every internal link leads to a page of this app (with a
//    real slug for the dynamic routes) or a page of the docs.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  headerLinks,
  isExternalHref,
  type LinkKey,
  MOBILE_ROWS,
  mobileGroups,
} from "@/config/navigation";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { HOSTED_TYPE_SLUGS } from "@/lib/qr-types-content-hosted";
import { industries, placements } from "@/lib/seo-content";
import en from "@/messages/en.json";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/",
}));

const ROOT = resolve(import.meta.dirname, "../..");
const DOCS = resolve(ROOT, "../docs/content/docs");

const names: Record<string, string> = en.footer.links;

/** Every link the chrome shows, with where it shows. */
const chrome: { where: string; href: string; key?: LinkKey; name?: string }[] =
  [
    ...headerLinks().map((link) => ({ where: "header", ...link })),
    ...mobileGroups().flatMap((group) =>
      group.links.map(({ key, href }) => ({ where: "mobile", key, href })),
    ),
    ...MOBILE_ROWS.map(({ key, href }) => ({ where: "mobile", key, href })),
    ...[
      ...FOOTER_COLUMNS.flatMap((column) => column.links),
      ...FOOTER_LEGAL,
    ].map((link) => ({
      where: "footer",
      href: link.href,
      key: link.key,
      name: link.label,
    })),
  ];

/** href → the names it goes by, and where. */
function namesByHref(entries: { href: string; name: string; where: string }[]) {
  const byHref = new Map<string, Set<string>>();
  for (const { href, name, where } of entries) {
    const set = byHref.get(href) ?? new Set();
    set.add(`${name} (${where})`);
    byHref.set(href, set);
  }
  return [...byHref].filter(
    ([, set]) =>
      new Set([...set].map((n) => n.replace(/ \(\w+\)$/, ""))).size > 1,
  );
}

describe("one name per destination", () => {
  it("has a name for every link", () => {
    for (const link of chrome) {
      const name = link.name ?? (link.key ? names[link.key] : undefined);
      expect(name, `${link.where} ${link.href}`).toBeTruthy();
    }
  });

  it("names a page the same in the header, the mobile menu and the footer", () => {
    const entries = chrome.map((link) => ({
      where: link.where,
      href: link.href,
      name: link.name ?? names[link.key ?? ""] ?? "",
    }));
    expect(namesByHref(entries)).toEqual([]);
    // And the other way round: one name never means two pages.
    const hrefsByName = new Map<string, Set<string>>();
    for (const { name, href } of entries) {
      hrefsByName.set(name, (hrefsByName.get(name) ?? new Set()).add(href));
    }
    const shared = [...hrefsByName].filter(([, hrefs]) => hrefs.size > 1);
    expect(shared).toEqual([]);
  });

  it("gives every header link a promise of at most 8 words, and 5 on phones", () => {
    const items: Record<string, { description: string; short: string }> =
      en.nav.items;
    for (const { key, href } of headerLinks()) {
      if (!(key in items)) continue;
      const item = items[key];
      // An ICU argument ("{max, number}") is one word once filled in.
      const words = (text = "") =>
        text
          .replace(/\{[^}]*\}/g, "N")
          .split(/\s+/)
          .filter(Boolean).length;
      expect(words(item?.description), href).toBeLessThanOrEqual(8);
      expect(words(item?.short), href).toBeLessThanOrEqual(5);
    }
  });

  it("renders the header and the footer with those names", async () => {
    const { HeaderNav } = await import("@/components/header-nav");
    const { FooterSection } = await import(
      "@/components/sections/footer-section"
    );
    const render = (node: ReactNode) =>
      renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
            {node}
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    const anchors = (html: string, where: string) =>
      [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>(.*?)<\/a>/gs)]
        .map(([, href = "", inner = ""]) => ({
          where,
          href: href.replaceAll("&amp;", "&"),
          name: inner
            .replace(/<[^>]+>/g, "")
            .replaceAll("&amp;", "&")
            .trim(),
        }))
        // Icon-only links (the logo's mark, the social glyphs) have no text.
        .filter((anchor) => anchor.name !== "");
    // The menus only: the bar's actions ("Create a QR code") are verbs, not
    // a page's name.
    const header = anchors(render(<HeaderNav />), "header");
    const footer = anchors(render(<FooterSection />), "footer");
    // Every menu link is in the header's HTML (closed menus included).
    for (const { href } of headerLinks()) {
      if (isExternalHref(href)) continue;
      expect(
        header.some((anchor) => anchor.href === href),
        href,
      ).toBe(true);
    }
    const logo = (anchor: { href: string }) => anchor.href === "/";
    expect(namesByHref([...header, ...footer.filter((a) => !logo(a))])).toEqual(
      [],
    );
  });
});

// ─── 2. Every link leads somewhere ───────────────────────────────────────────

const PAGE = /^page\.(tsx|ts|mdx)$/;

/** Every page of the app as its URL pattern's segments. */
function appRoutes(): { pattern: string; segments: string[] }[] {
  const out: { pattern: string; segments: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (PAGE.test(name)) {
        const segments = relative(join(ROOT, "app"), dir)
          .split(sep)
          .filter(
            (segment) =>
              segment !== "" &&
              !/^\(.*\)$/.test(segment) &&
              !segment.startsWith("@"),
          );
        if (segments[0] === "[lang]") segments.shift();
        out.push({ pattern: `/${segments.join("/")}`, segments });
      }
    }
  };
  walk(join(ROOT, "app"));
  return out;
}

const fileIn = (dir: string, slug: string) =>
  existsSync(join(ROOT, "content", dir, `${slug}.mdx`));

/** The values each dynamic route this chrome links into really has. */
const DYNAMIC: Record<string, (params: string[]) => boolean> = {
  "/qr-codes-for/[slug]": ([slug]) =>
    industries.items.some((item) => item.slug === slug),
  "/qr-codes-on/[slug]": ([slug]) =>
    placements.items.some((item) => item.slug === slug),
  "/qr-code-generator/[type]": ([type]) =>
    [...QR_TYPE_SLUGS, ...HOSTED_TYPE_SLUGS].some((slug) => slug === type),
  "/compare/[slug]": ([slug = ""]) => fileIn("compare", slug),
  "/legal/[[...slug]]": (slug) =>
    slug.length === 0 || fileIn("legal", slug.join("/")),
};

/** The dynamic params `path` fills in `segments`, or null if it doesn't fit. */
function match(segments: string[], path: string[]): string[] | null {
  const params: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] ?? "";
    if (segment.startsWith("[[...")) return [...params, ...path.slice(i)];
    if (segment.startsWith("[...")) {
      return path.length > i ? [...params, ...path.slice(i)] : null;
    }
    const part = path[i];
    if (part === undefined) return null;
    if (segment.startsWith("[")) params.push(part);
    else if (segment !== part) return null;
  }
  return path.length === segments.length ? params : null;
}

function resolves(href: string): string | true {
  const path = href.split(/[?#]/)[0] ?? "";
  if (path === "/docs" || path.startsWith("/docs/")) {
    const slug = path.slice("/docs".length).replace(/^\//, "");
    const base = join(DOCS, slug);
    return existsSync(`${base}.mdx`) || existsSync(join(base, "index.mdx"))
      ? true
      : `no docs page for ${href}`;
  }
  const parts = path.split("/").filter(Boolean);
  for (const route of appRoutes()) {
    const params = match(route.segments, parts);
    if (!params) continue;
    if (params.length === 0) return true;
    const check = DYNAMIC[route.pattern];
    if (!check) return `${href} lands on ${route.pattern}: add a check for it`;
    if (check(params)) return true;
  }
  return `no page for ${href}`;
}

describe("every chrome link leads to a page", () => {
  const internal = [...new Set(chrome.map((link) => link.href))].filter(
    (href) => !isExternalHref(href),
  );

  it("has internal links to check", () => {
    expect(internal.length).toBeGreaterThan(50);
  });

  it.each(internal)("%s", (href) => {
    expect(resolves(href)).toBe(true);
  });

  it("catches a dead link", () => {
    expect(resolves("/qr-codes-for/not-an-industry")).not.toBe(true);
    expect(resolves("/docs/not-a-page")).not.toBe(true);
    expect(resolves("/about")).not.toBe(true);
  });
});
