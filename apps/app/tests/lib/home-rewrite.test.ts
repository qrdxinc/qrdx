// The home page also answers at /home and /<language>/home (next.config.ts):
// the logo links there, and it never sends a signed-in visitor to the
// dashboard (tests/lib/home-redirect.test.ts covers the redirect at /).

import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The real next.config.ts: /home and /<language>/home serve the home page.
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

  it.each([
    ["https://qrdx.dev/home", "/en"],
    ["https://qrdx.dev/es/home", "/es"],
    ["https://qrdx.dev/zh-hans/home", "/zh-hans"],
  ])("rewrites %s to the home page", async (url, path) => {
    const response = await unstable_getResponseFromNextConfig({
      url,
      nextConfig,
    });
    expect(getRedirectUrl(response)).toBeNull();
    expect(new URL(getRewrittenUrl(response) ?? "").pathname).toBe(path);
  });
});
