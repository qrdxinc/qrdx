// The console at its own address, as next.config.ts sees it, through Next's
// own matcher: with ADMIN_CONSOLE_URL set, qrdx.dev's five console sections
// answer a 307 to the same lower-case section there (query kept), nothing
// else moves, and the value is inlined into server code; unset, nothing
// changes; set without a usable CONSOLE_ZONE_KEY, the build fails. Nothing
// here reaches a database or a service. (/admin/confirm:
// tests/admin/confirm-page.test.tsx.)
import { adminConsoleRedirects } from "@repo/next-config/console-zone";
import type { NextConfig } from "next";
import { getRedirectStatus } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
  matchHas,
  prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination";
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
  let failures: unknown[];

  beforeAll(async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    off = await loadConfig({});
    on = await loadConfig({
      ADMIN_CONSOLE_URL: `${CONSOLE}/`,
      CONSOLE_ZONE_KEY: "k".repeat(32),
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    // One at a time: loadConfig sets process.env.
    failures = [];
    for (const key of [undefined, "k".repeat(31)]) {
      failures.push(
        await loadConfig({
          ADMIN_CONSOLE_URL: CONSOLE,
          CONSOLE_ZONE_KEY: key,
        }).then(
          () => null,
          (error: unknown) => error,
        ),
      );
    }
  }, 60_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
  });

  const resolve = (nextConfig: NextConfig, url: string) =>
    unstable_getResponseFromNextConfig({ url, nextConfig, headers: {} });

  /**
   * The first redirect for `url` as Next's server picks it
   * (server/lib/router-utils: filesystem.js and resolve-routes.js), which
   * matches paths without regard to case while caseSensitiveRoutes is off.
   * The testing helper above extracts params case-sensitively, so it can't
   * show where /admin/Growth goes.
   */
  async function serverRedirect(nextConfig: NextConfig, url: string) {
    const parsed = new URL(url);
    const query = Object.fromEntries(parsed.searchParams);
    const request = { headers: { host: parsed.host } } as unknown as Parameters<
      typeof matchHas
    >[0];
    for (const route of (await nextConfig.redirects?.()) ?? []) {
      const match = getPathMatch(route.source, {
        strict: true,
        removeUnnamedParams: true,
        sensitive: false,
      });
      const params = match(parsed.pathname);
      if (!params) continue;
      if (
        (route.has || route.missing) &&
        !matchHas(request, query, route.has, route.missing)
      ) {
        continue;
      }
      const { parsedDestination } = prepareDestination({
        appendParamsToQuery: false,
        destination: route.destination,
        params,
        query,
      });
      const location = new URL(
        parsedDestination.pathname ?? "/",
        `${parsedDestination.protocol}//${parsedDestination.hostname}${parsedDestination.port ? `:${parsedDestination.port}` : ""}`,
      );
      for (const [name, value] of Object.entries(parsedDestination.query)) {
        location.searchParams.set(name, String(value));
      }
      return {
        status: getRedirectStatus(route),
        location: location.toString(),
      };
    }
    return null;
  }

  it.each([
    ["/admin/growth", "/growth"],
    ["/admin/numbers", "/numbers"],
    ["/admin/subscriptions?status=active", "/subscriptions?status=active"],
    ["/admin/ai-usage", "/ai-usage"],
    ["/admin/affiliates", "/affiliates"],
    ["/admin/affiliates/abc?page=2", "/affiliates/abc?page=2"],
  ])("sends %s to the console with a 307", async (pathname, target) => {
    const response = await resolve(on, `https://qrdx.dev${pathname}`);
    // Temporary until the seven-day watch, so a rollback isn't cached.
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`${CONSOLE}${target}`);
  });

  it.each([
    ["/admin/growth", "/growth"],
    ["/admin/Growth", "/growth"],
    ["/ADMIN/growth", "/growth"],
    ["/admin/AI-Usage", "/ai-usage"],
    ["/Admin/Affiliates/AbC?page=2", "/affiliates/AbC?page=2"],
  ])(
    "sends %s to the lower-case section, as the server matches it",
    async (pathname, target) => {
      expect(await serverRedirect(on, `https://qrdx.dev${pathname}`)).toEqual({
        status: 307,
        location: `${CONSOLE}${target}`,
      });
    },
  );

  it("matches nothing the server would send there while unset", async () => {
    expect(
      await serverRedirect(off, "https://qrdx.dev/admin/Growth"),
    ).toBeNull();
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

  it("fails the build when the client secret is missing or short", () => {
    // Without it the console can't sign anyone in: no redirects or menu
    // links that would strand admins there.
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toMatch(/ADMIN_CONSOLE_URL/);
      expect(String(failure)).toMatch(/CONSOLE_ZONE_KEY/);
    }
  });
});
