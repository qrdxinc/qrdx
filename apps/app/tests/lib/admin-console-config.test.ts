// The console at its own address, as next.config.ts sees it, through Next's
// own matcher: with ADMIN_CONSOLE_URL set, every qrdx.dev/admin URL answers
// a 307 to the console (/admin to its front page, each section to the same
// lower-case section there, the query kept), /admin/confirm goes to
// /oauth/confirm here, nothing outside /admin moves, no redirect leaves the
// console's origin, and the value is inlined into server code; unset,
// nothing changes; set without a usable CONSOLE_ZONE_KEY, the build fails.
// Nothing here reaches a database or a service. (/oauth/confirm:
// tests/oauth/console-confirm-page.test.tsx.)
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

const CONSOLE = "https://console.qrdx.dev";

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
      // A destination without a host stays on the request's.
      const location = new URL(
        parsedDestination.pathname ?? "/",
        parsedDestination.hostname
          ? `${parsedDestination.protocol}//${parsedDestination.hostname}${parsedDestination.port ? `:${parsedDestination.port}` : ""}`
          : parsed.origin,
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

  // Every section, its pages below it, and /admin itself.
  const SENT = [
    ["/admin", "/"],
    ["/admin?tab=x", "/?tab=x"],
    ["/admin/growth", "/growth"],
    ["/admin/numbers", "/numbers"],
    ["/admin/subscriptions?status=active", "/subscriptions?status=active"],
    ["/admin/ai-usage", "/ai-usage"],
    ["/admin/affiliates", "/affiliates"],
    ["/admin/affiliates/abc?page=2", "/affiliates/abc?page=2"],
    ["/admin/users", "/users"],
    ["/admin/users?q=maria&page=2", "/users?q=maria&page=2"],
    ["/admin/users/u_1", "/users/u_1"],
    ["/admin/users/u_1/export", "/users/u_1/export"],
    ["/admin/themes", "/themes"],
    ["/admin/community", "/community"],
    ["/admin/codes", "/codes"],
    ["/admin/codes?q=summer&kind=page", "/codes?q=summer&kind=page"],
    ["/admin/abuse", "/abuse"],
    ["/admin/integrations", "/integrations"],
    ["/admin/audit-log", "/audit-log"],
    ["/admin/health", "/health"],
    ["/admin/search?q=a", "/search?q=a"],
    // Not a section: the console's own 404.
    ["/admin/growthx", "/growthx"],
    ["/admin/a/b", "/a/b"],
  ] as const;

  it.each(SENT)(
    "sends %s to the console with a 307",
    async (pathname, target) => {
      const response = await resolve(on, `https://qrdx.dev${pathname}`);
      // Temporary until the seven-day watch, so a rollback isn't cached.
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response)).toBe(`${CONSOLE}${target}`);
    },
  );

  it.each(SENT)(
    "sends %s there as the server matches it too",
    async (pathname, target) => {
      expect(await serverRedirect(on, `https://qrdx.dev${pathname}`)).toEqual({
        status: 307,
        location: `${CONSOLE}${target}`,
      });
    },
  );

  it.each([
    ["/admin/Growth", "/growth"],
    ["/ADMIN/growth", "/growth"],
    ["/ADMIN", "/"],
    ["/admin/AI-Usage", "/ai-usage"],
    ["/Admin/Affiliates/AbC?page=2", "/affiliates/AbC?page=2"],
    ["/admin/Users/U_1/Export", "/users/U_1/Export"],
    ["/ADMIN/SEARCH?q=Maria", "/search?q=Maria"],
    ["/admin/Audit-Log", "/audit-log"],
  ])(
    "sends %s to the lower-case section, as the server matches it",
    async (pathname, target) => {
      expect(await serverRedirect(on, `https://qrdx.dev${pathname}`)).toEqual({
        status: 307,
        location: `${CONSOLE}${target}`,
      });
    },
  );

  it.each([
    ["/admin/confirm", "/oauth/confirm"],
    [
      `/admin/confirm?next=${encodeURIComponent(`${CONSOLE}/affiliates/a?confirmed=1`)}`,
      `/oauth/confirm?next=${encodeURIComponent(`${CONSOLE}/affiliates/a?confirmed=1`)}`,
    ],
    ["/admin/Confirm?next=x", "/oauth/confirm?next=x"],
  ])(
    "sends %s to this app's /oauth/confirm, query kept",
    async (pathname, target) => {
      const response = await resolve(on, `https://qrdx.dev${pathname}`);
      if (pathname === pathname.toLowerCase()) {
        expect(response.status).toBe(307);
        expect(
          new URL(
            getRedirectUrl(response) ?? "",
            "https://qrdx.dev",
          ).toString(),
        ).toBe(`https://qrdx.dev${target}`);
      }
      expect(await serverRedirect(on, `https://qrdx.dev${pathname}`)).toEqual({
        status: 307,
        location: `https://qrdx.dev${target}`,
      });
    },
  );

  it.each([
    "/admin//evil.example",
    "/admin/%2F%2Fevil.example",
    "/admin/users/%2F%2Fevil.example",
    "/admin/@evil.example",
    "/admin/users/@evil.example",
    "/admin/users/..%2F..%2Fx",
    "/admin/%5Cevil.example",
    "/admin/https:%2F%2Fevil.example",
    "/admin/users/x?next=https://evil.example",
    "/admin?redirect=//evil.example",
  ])(
    "never sends %s anywhere but the console or this site",
    async (pathname) => {
      for (const found of [
        getRedirectUrl(await resolve(on, `https://qrdx.dev${pathname}`)),
        (await serverRedirect(on, `https://qrdx.dev${pathname}`))?.location,
      ]) {
        if (found === null || found === undefined) continue;
        const { origin } = new URL(found, "https://qrdx.dev");
        expect(
          [CONSOLE, "https://qrdx.dev"],
          `${pathname} → ${found}`,
        ).toContain(origin);
      }
    },
  );

  it("matches nothing the server would send there while unset", async () => {
    for (const pathname of ["/admin", "/admin/Growth", "/admin/users/u_1"]) {
      expect(
        await serverRedirect(off, `https://qrdx.dev${pathname}`),
        pathname,
      ).toBeNull();
    }
  });

  it.each([
    "/administrator",
    "/adminx/growth",
    "/api/oauth/authorize?client_id=qrdx_admin_console",
    "/api/auth/get-session",
    "/api/auth/admin/list-users",
    "/oauth/confirm?next=https://console.qrdx.dev/growth",
    "/q/admin",
    "/q/x",
    "/p/x",
    "/docs",
    "/dashboard",
    "/dashboard/admin",
    "/settings/account",
    "/sign-in",
    "/",
  ])("leaves %s here", async (pathname) => {
    const response = await resolve(on, `https://qrdx.dev${pathname}`);
    const target = getRedirectUrl(response) ?? getRewrittenUrl(response);
    expect(target === null || !target.startsWith(`${CONSOLE}/`)).toBe(true);
    const served = await serverRedirect(on, `https://qrdx.dev${pathname}`);
    expect(served?.location ?? "").not.toContain(CONSOLE);
  });

  it("only on QRdx's own hosts", async () => {
    expect(
      getRedirectUrl(await resolve(on, "http://localhost:3000/admin/growth")),
    ).toBe(`${CONSOLE}/growth`);
    for (const pathname of ["/admin", "/admin/growth", "/admin/users/u_1"]) {
      const customer = await resolve(
        on,
        `https://links.customer.com${pathname}`,
      );
      expect(getRedirectUrl(customer) ?? "", pathname).not.toContain(CONSOLE);
      expect(
        await serverRedirect(on, `https://links.customer.com${pathname}`),
        pathname,
      ).toBeNull();
    }
  });

  it("changes nothing while unset", async () => {
    for (const pathname of [
      "/admin",
      "/admin/growth",
      "/admin/affiliates/abc?page=2",
      "/admin/users/u_1",
      "/admin/confirm?next=/admin/growth",
    ]) {
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
