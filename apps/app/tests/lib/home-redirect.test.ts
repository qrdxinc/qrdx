// The home page sends signed-in visitors to their dashboard (proxy.ts, with
// lib/home-path.ts). Signed-out visitors and crawlers get the page without a
// session lookup; a stale cookie gets the page too.
//
// The home page is English only: /es, /pt-br and the other languages' roots
// redirect to / in next.config.ts before the proxy runs, so a signed-in
// visitor there still ends up on the dashboard, in the language the app
// already uses for them (their saved choice, else the language cookie,
// which no step on the way touches).

import { LOCALE_INFO, TRANSLATED_LOCALES } from "@repo/i18n/config";
import type { NextConfig } from "next";
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isHomePath, isLandingPath, LANDING_PATH } from "@/lib/home-path";

describe("isHomePath", () => {
  // "/en" is the route the home page prerenders as (and redirects to /).
  it.each(["/", "/en"])("is the home page: %s", (path) => {
    expect(isHomePath(path)).toBe(true);
  });

  it.each([
    // The languages' roots redirect to / before anything reads them.
    "/es",
    "/es/",
    "/pt-br",
    "/zh-hans",
    "/pricing",
    "/es/pricing",
    "/dashboard",
    "/blog",
    "/esx",
    "/community",
  ])("isn't the home page: %s", (path) => {
    expect(isHomePath(path)).toBe(false);
  });
});

describe("the /home address", () => {
  it.each(["/home", "/home/"])(
    "is the home page for Featurebase but never redirects: %s",
    (path) => {
      expect(isLandingPath(path)).toBe(true);
      expect(isHomePath(path)).toBe(false);
    },
  );

  it("is where the logo links, in every language", () => {
    expect(LANDING_PATH).toBe("/home");
    // /es/home redirects to /home (tests/lib/home-rewrite.test.ts).
    expect(isLandingPath("/es/home")).toBe(false);
  });
});

describe("the proxy's matcher", () => {
  it("covers the home page, and no language roots: they redirect first", async () => {
    vi.resetModules();
    const { config } = await import("@/proxy");
    const entries = config.matcher.filter(
      (entry): entry is string => typeof entry === "string",
    );
    expect(entries).toContain("/");
    expect(entries.some((entry) => entry.startsWith("/:locale("))).toBe(false);
  });
});

describe("signed-in visitors on the home page", () => {
  const state = { lookups: 0, signedIn: true };
  let proxy: (request: NextRequest) => Promise<Response>;
  let nextConfig: NextConfig;

  beforeAll(async () => {
    process.env.CSP_DEV = "1";
    vi.resetModules();
    vi.doMock("@/lib/account/session-origin-server", () => ({
      getSessionAllowingHold: async () => {
        state.lookups++;
        return state.signedIn
          ? { session: { id: "s" }, user: { id: "u" } }
          : null;
      },
      isSessionHeld: async () => false,
    }));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    vi.doMock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
      routeCustomDomain: async () => null,
    }));
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    proxy = (await import("@/proxy")).default;
    nextConfig = (await import("@/next.config"))
      .default as unknown as NextConfig;
  }, 120_000);

  afterAll(() => {
    vi.doUnmock("@/lib/account/session-origin-server");
    vi.doUnmock("next/headers");
    vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
    vi.doUnmock("fumadocs-mdx/next");
  });

  const request = (path: string, cookie?: string) =>
    new NextRequest(`https://qrdx.dev${path}`, {
      headers: { host: "qrdx.dev", ...(cookie ? { cookie } : {}) },
    });
  const SESSION = "__Secure-better-auth.session_token=abc.def";
  const SPANISH = `${SESSION}; NEXT_LOCALE=es`;

  it("go to /dashboard from /", async () => {
    state.signedIn = true;
    const response = await proxy(request("/", SESSION));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://qrdx.dev/dashboard");
  });

  it.each(
    TRANSLATED_LOCALES.map((locale) => `/${LOCALE_INFO[locale].segment}`),
  )("go to /dashboard from %s, by way of /", async (path) => {
    state.signedIn = true;
    // next.config.ts first (redirects run before the proxy)...
    const first = await unstable_getResponseFromNextConfig({
      url: `https://qrdx.dev${path}`,
      nextConfig,
      cookies: { NEXT_LOCALE: "es" },
    });
    expect(first.status).toBe(307);
    expect(getRedirectUrl(first)).toBe("https://qrdx.dev/");
    // ...then the proxy on /, with the visitor's cookies as they were.
    const second = await proxy(request("/", SPANISH));
    expect(second.status).toBe(307);
    expect(second.headers.get("location")).toBe("https://qrdx.dev/dashboard");
    // Neither step sets a cookie: the app's language (lib/i18n/app-locale.ts:
    // the saved choice, else NEXT_LOCALE) stays what it was.
    expect(first.headers.get("set-cookie")).toBeNull();
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("cost signed-out visitors no session lookup", async () => {
    state.lookups = 0;
    const response = await proxy(request("/", "theme=dark"));
    expect(response.headers.get("location")).toBeNull();
    expect(state.lookups).toBe(0);
  });

  it("leave a stale session cookie on the page", async () => {
    state.signedIn = false;
    const response = await proxy(request("/", SESSION));
    expect(response.headers.get("location")).toBeNull();
    state.signedIn = true;
  });

  it("let them open the home page at /home", async () => {
    state.lookups = 0;
    const response = await proxy(request("/home", SESSION));
    expect(response.headers.get("location")).toBeNull();
    expect(state.lookups).toBe(0);
  });

  it("leave other marketing pages alone", async () => {
    state.lookups = 0;
    const response = await proxy(request("/pricing", SESSION));
    expect(response.headers.get("location")).toBeNull();
    expect(state.lookups).toBe(0);
  });
});
