// The marketing pages are English only (owner, 17 Nov 2026). Through the
// real next.config.ts, as Next matches it: their translated URLs redirect
// to the English page with the query kept (308; 307 for the generator pages
// the site can serve in every language), on QRdx's own hosts only, the
// English-only pages outside app/[lang] too; the English URLs still render
// the pages under app/[lang]; the
// playground, /ai, /ai/art, /mcp and (until the owner decides) the scanner
// stay translated. The home page cases
// are in tests/lib/home-redirect.test.ts and home-rewrite.test.ts.

import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("next.config.ts, English-only marketing pages", () => {
  let nextConfig: NextConfig;

  beforeAll(async () => {
    process.env.CSP_DEV = "1";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    nextConfig = (await import("@/next.config"))
      .default as unknown as NextConfig;
  }, 120_000);

  afterAll(() => {
    vi.doUnmock("fumadocs-mdx/next");
  });

  const respond = (url: string) =>
    unstable_getResponseFromNextConfig({ url, nextConfig });

  it.each([
    // Static pages, in several languages.
    ["https://qrdx.dev/es/pricing", "https://qrdx.dev/pricing"],
    ["https://qrdx.dev/pt-br/enterprise", "https://qrdx.dev/enterprise"],
    ["https://qrdx.dev/ja/tools/bulk", "https://qrdx.dev/tools/bulk"],
    ["https://qrdx.dev/zh-hans/compare", "https://qrdx.dev/compare"],
    ["https://qrdx.dev/de/qr-code-api", "https://qrdx.dev/qr-code-api"],
    // Dynamic segments.
    [
      "https://qrdx.dev/it/qr-codes-for/restaurants",
      "https://qrdx.dev/qr-codes-for/restaurants",
    ],
    [
      "https://qrdx.dev/ko/qr-codes-on/business-cards",
      "https://qrdx.dev/qr-codes-on/business-cards",
    ],
    [
      "https://qrdx.dev/id/integrations/zapier",
      "https://qrdx.dev/integrations/zapier",
    ],
    // The query is kept.
    [
      "https://qrdx.dev/es/pricing?currency=eur&utm_source=mail",
      "https://qrdx.dev/pricing?currency=eur&utm_source=mail",
    ],
    // The home page: / (signed-in visitors go on to the dashboard there),
    // and its /home address.
    ["https://qrdx.dev/es", "https://qrdx.dev/"],
    ["https://qrdx.dev/pt-br?ref=x", "https://qrdx.dev/?ref=x"],
    ["https://qrdx.dev/es/home", "https://qrdx.dev/home"],
    ["https://qrdx.dev/zh-hans/home", "https://qrdx.dev/home"],
    // Preview deployments and local development are QRdx's hosts too.
    [
      "https://qrdx-git-x.vercel.app/es/pricing",
      "https://qrdx-git-x.vercel.app/pricing",
    ],
    ["http://localhost:3000/es/pricing", "http://localhost:3000/pricing"],
    // The English-only pages outside app/[lang], never translated: the blog,
    // the comparisons' pages, the legal pages and the rest.
    ["https://qrdx.dev/es/compare/uniqode", "https://qrdx.dev/compare/uniqode"],
    ["https://qrdx.dev/ja/blog?ref=x", "https://qrdx.dev/blog?ref=x"],
    [
      "https://qrdx.dev/de/blog/do-qr-codes-expire",
      "https://qrdx.dev/blog/do-qr-codes-expire",
    ],
    ["https://qrdx.dev/fr/blog/rss.xml", "https://qrdx.dev/blog/rss.xml"],
    ["https://qrdx.dev/hi/legal", "https://qrdx.dev/legal"],
    [
      "https://qrdx.dev/it/legal/privacy-policy",
      "https://qrdx.dev/legal/privacy-policy",
    ],
    ["https://qrdx.dev/ko/changelogs", "https://qrdx.dev/changelogs"],
    [
      "https://qrdx.dev/id/qr-code-tracking",
      "https://qrdx.dev/qr-code-tracking",
    ],
  ])("redirects %s to %s with a 308", async (url, location) => {
    const response = await respond(url);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(location);
  });

  // The generator pages the site serves in every language while its group
  // is on (none is here): the QR code generators and the barcode
  // generators. Their redirect to English stays a 307, which nobody keeps,
  // so switching the group back on is never stuck behind it.
  it.each([
    [
      "https://qrdx.dev/ja/qr-code-generator",
      "https://qrdx.dev/qr-code-generator",
    ],
    [
      "https://qrdx.dev/ja/qr-code-generator/wifi",
      "https://qrdx.dev/qr-code-generator/wifi",
    ],
    [
      "https://qrdx.dev/ja/qr-code-generator/wifi?x=1",
      "https://qrdx.dev/qr-code-generator/wifi?x=1",
    ],
    [
      "https://qrdx.dev/ja/barcode-generator",
      "https://qrdx.dev/barcode-generator",
    ],
    [
      "https://qrdx.dev/ja/barcode-generator/ean-13",
      "https://qrdx.dev/barcode-generator/ean-13",
    ],
    [
      "https://qrdx.dev/fr/barcode-generator/ean-13?x=1",
      "https://qrdx.dev/barcode-generator/ean-13?x=1",
    ],
  ])("redirects %s to %s with a 307 only", async (url, location) => {
    const response = await respond(url);
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(location);
  });

  it("leaves a customer's domain alone: /es there is a short link", async () => {
    for (const url of [
      "https://go.example.com/es",
      "https://go.example.com/es/pricing",
      "https://go.example.com/ja/qr-code-generator/wifi?x=1",
      "https://go.example.com/es/home",
    ]) {
      const response = await respond(url);
      expect(getRedirectUrl(response), url).toBeNull();
    }
  });

  it.each([
    "https://qrdx.dev/es/playground",
    "https://qrdx.dev/es/ai",
    "https://qrdx.dev/ja/ai/art",
    "https://qrdx.dev/pt-br/mcp",
    // Each language's scanner is its own installed app (lib/scanner-app.ts):
    // translated until the owner decides otherwise.
    "https://qrdx.dev/hi/scan",
    "https://qrdx.dev/hi/scan/manifest.webmanifest",
  ])("keeps the translated page at %s", async (url) => {
    const response = await respond(url);
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBeNull();
  });

  it.each([
    ["https://qrdx.dev/pricing", "/en/pricing"],
    [
      "https://qrdx.dev/qr-code-generator/wifi?x=1",
      "/en/qr-code-generator/wifi",
    ],
    ["https://qrdx.dev/integrations/zapier", "/en/integrations/zapier"],
    ["https://qrdx.dev/tools/scan-checker", "/en/tools/scan-checker"],
    ["https://qrdx.dev/", "/en"],
    ["https://qrdx.dev/home", "/en"],
    ["https://qrdx.dev/playground", "/en/playground"],
  ])("still renders the English page at %s", async (url, path) => {
    const response = await respond(url);
    expect(getRedirectUrl(response)).toBeNull();
    expect(new URL(getRewrittenUrl(response) ?? "").pathname).toBe(path);
  });

  it("keeps /en/... a permanent redirect to the English URL", async () => {
    const response = await respond("https://qrdx.dev/en/pricing?x=1");
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://qrdx.dev/pricing?x=1");
  });
});
