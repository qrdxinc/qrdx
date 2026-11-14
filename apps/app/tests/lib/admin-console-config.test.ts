// The console at its own address, as next.config.ts sees it: with
// ADMIN_CONSOLE_URL set, qrdx.dev's five console sections answer a 308 to the
// same section there (query kept), nothing else moves, and the value is
// inlined into server code; unset, nothing changes. Nothing here reaches a
// database or a service. (/admin/confirm: tests/admin/confirm-page.test.tsx.)
import { adminConsoleRedirects } from "@repo/next-config/console-zone";
import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const CONSOLE = "https://admin.qrdx.dev";

describe("next.config.ts", () => {
  const saved = { ...process.env };

  /** The app's config with these variables set (or, undefined, unset). */
  async function loadConfig(
    values: Record<string, string | undefined>,
  ): Promise<NextConfig> {
    for (const name of [
      "ADMIN_CONSOLE_URL",
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
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    return (await import("@/next.config")).default as unknown as NextConfig;
  }

  let on: NextConfig;
  let off: NextConfig;
  let warned: string[];

  beforeAll(async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    off = await loadConfig({});
    expect(warn).not.toHaveBeenCalled();
    on = await loadConfig({
      ADMIN_CONSOLE_URL: `${CONSOLE}/`,
      CONSOLE_ZONE_KEY: "k".repeat(40),
    });
    expect(warn).not.toHaveBeenCalled();
    await loadConfig({ ADMIN_CONSOLE_URL: CONSOLE });
    warned = warn.mock.calls.map((call) => String(call[0]));
    warn.mockRestore();
  }, 60_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
  });

  const resolve = (nextConfig: NextConfig, url: string) =>
    unstable_getResponseFromNextConfig({ url, nextConfig, headers: {} });

  it.each([
    ["/admin/growth", "/growth"],
    ["/admin/numbers", "/numbers"],
    ["/admin/subscriptions?status=active", "/subscriptions?status=active"],
    ["/admin/ai-usage", "/ai-usage"],
    ["/admin/affiliates", "/affiliates"],
    ["/admin/affiliates/abc?page=2", "/affiliates/abc?page=2"],
  ])("sends %s to the console with a 308", async (pathname, target) => {
    const response = await resolve(on, `https://qrdx.dev${pathname}`);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`${CONSOLE}${target}`);
  });

  it.each([
    "/admin",
    "/admin/users",
    "/admin/users/x",
    "/admin/search?q=a",
    "/admin/confirm",
    "/admin/confirm?next=https://admin.qrdx.dev/growth",
    "/admin/growthx",
    "/admin/audit-log",
    "/admin/health",
    "/api/oauth/authorize?client_id=qrdx_admin_console",
    "/api/auth/get-session",
    "/q/x",
    "/p/x",
    "/docs",
    "/dashboard",
    "/sign-in",
    "/",
  ])("leaves %s here", async (pathname) => {
    const response = await resolve(on, `https://qrdx.dev${pathname}`);
    const target = getRedirectUrl(response) ?? getRewrittenUrl(response);
    expect(target === null || !target.startsWith(`${CONSOLE}/`)).toBe(true);
  });

  it("only on QRdx's own hosts", async () => {
    expect(
      getRedirectUrl(await resolve(on, "http://localhost:3000/admin/growth")),
    ).toBe(`${CONSOLE}/growth`);
    const customer = await resolve(
      on,
      "https://links.customer.com/admin/growth",
    );
    expect(getRedirectUrl(customer)).not.toBe(`${CONSOLE}/growth`);
  });

  it("changes nothing while unset", async () => {
    for (const pathname of ["/admin/growth", "/admin/affiliates/abc?page=2"]) {
      const response = await resolve(off, `https://qrdx.dev${pathname}`);
      expect(getRedirectUrl(response), pathname).toBeNull();
      expect(getRewrittenUrl(response), pathname).toBeNull();
    }
    expect(
      adminConsoleRedirects(undefined, { hosts: "(?:qrdx\\.dev)" }),
    ).toEqual([]);
  });

  it("inlines ADMIN_CONSOLE_URL into server code, empty while unset", () => {
    const inlined = (nextConfig: NextConfig) =>
      nextConfig.compiler?.defineServer?.["process.env.ADMIN_CONSOLE_URL"];
    expect(inlined(off)).toBe("");
    expect(inlined(on)).toBe(`${CONSOLE}/`);
  });

  it("warns at build time when the client secret is missing", () => {
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/ADMIN_CONSOLE_URL/);
    expect(warned[0]).toMatch(/CONSOLE_ZONE_KEY/);
  });
});
