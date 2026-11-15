// The home page sends signed-in visitors to their dashboard (proxy.ts, with
// lib/home-path.ts). Signed-out visitors and crawlers get the page without a
// session lookup; a stale cookie gets the page too.

import { LOCALE_INFO, LOCALES } from "@repo/i18n/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isHomePath } from "@/lib/home-path";

describe("isHomePath", () => {
  it.each(["/", "/es", "/es/", "/pt-br", "/zh-hans", "/en"])(
    "is the home page: %s",
    (path) => {
      expect(isHomePath(path)).toBe(true);
    },
  );

  it.each([
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

describe("the proxy's matcher", () => {
  it("covers the home page in every language", async () => {
    vi.resetModules();
    const { config } = await import("@/proxy");
    const entries = config.matcher.filter(
      (entry): entry is string => typeof entry === "string",
    );
    expect(entries).toContain("/");
    const locales = entries.find((entry) => entry.startsWith("/:locale("));
    const listed = locales?.slice("/:locale(".length, -1).split("|") ?? [];
    for (const locale of LOCALES) {
      expect(listed).toContain(LOCALE_INFO[locale].segment);
    }
  });
});

describe("signed-in visitors on the home page", () => {
  const state = { lookups: 0, signedIn: true };
  let proxy: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
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
    proxy = (await import("@/proxy")).default;
  });

  afterAll(() => {
    vi.doUnmock("@/lib/account/session-origin-server");
    vi.doUnmock("next/headers");
    vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
  });

  const request = (path: string, cookie?: string) =>
    new NextRequest(`https://qrdx.dev${path}`, {
      headers: { host: "qrdx.dev", ...(cookie ? { cookie } : {}) },
    });
  const SESSION = "__Secure-better-auth.session_token=abc.def";

  it.each(["/", "/es", "/pt-br"])("go to /dashboard from %s", async (path) => {
    state.signedIn = true;
    const response = await proxy(request(path, SESSION));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://qrdx.dev/dashboard");
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

  it("leave other marketing pages alone", async () => {
    state.lookups = 0;
    const response = await proxy(request("/es/pricing", SESSION));
    expect(response.headers.get("location")).toBeNull();
    expect(state.lookups).toBe(0);
  });
});
