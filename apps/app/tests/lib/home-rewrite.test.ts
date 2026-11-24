// The home page also answers at /home (next.config.ts): the logo links there,
// and it never sends a signed-in visitor to the dashboard
// (tests/lib/home-redirect.test.ts covers the redirect at /). The home page
// is English only: /<language> redirects to / and /<language>/home to /home.

import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SEGMENTS = TRANSLATED_LOCALES.map(
  (locale) => LOCALE_INFO[locale].segment,
);

// The real next.config.ts.
describe("next.config.ts", () => {
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

  it("rewrites /home to the home page", async () => {
    const response = await respond("https://qrdx.dev/home");
    expect(getRedirectUrl(response)).toBeNull();
    expect(new URL(getRewrittenUrl(response) ?? "").pathname).toBe("/en");
  });

  it.each(SEGMENTS)("redirects /%s/home to /home", async (segment) => {
    const response = await respond(`https://qrdx.dev/${segment}/home`);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://qrdx.dev/home");
  });

  it.each(SEGMENTS)("redirects /%s to /", async (segment) => {
    // A signed-in visitor goes on from / to the dashboard (proxy.ts,
    // tests/lib/home-redirect.test.ts); this step leaves their language
    // cookie alone, so the app keeps its language.
    const response = await unstable_getResponseFromNextConfig({
      url: `https://qrdx.dev/${segment}`,
      nextConfig,
      cookies: { NEXT_LOCALE: "es" },
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://qrdx.dev/");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("redirects /en and /en/home permanently, as before", async () => {
    for (const [path, location] of [
      ["/en", "https://qrdx.dev/"],
      ["/en/home", "https://qrdx.dev/home"],
    ] as const) {
      const response = await respond(`https://qrdx.dev${path}`);
      expect(response.status, path).toBe(308);
      expect(getRedirectUrl(response), path).toBe(location);
    }
  });
});
