// The back-office console at its own address (ADMIN_CONSOLE_URL): the pure
// rules in @repo/next-config/console-zone and lib/admin-console/client that
// the redirects, the admin menu, /admin/confirm and the OAuth routes share.
// Nothing here touches a database.
import {
  adminConsoleAddress,
  adminConsoleHref,
  adminConsoleRedirects,
  consoleReturnTarget,
} from "@repo/next-config/console-zone";
import { describe, expect, it } from "vitest";
import { adminNavLinks } from "@/app/(app)/admin/_lib/nav";
import {
  ADMIN_CONSOLE_CLIENT_ID,
  adminConsoleClient,
  checkAdminConsoleAuthorizeRequest,
  isAdminConsoleClientId,
  isAdminConsoleToken,
} from "@/lib/admin-console/client";
import { readAuthorizeParams } from "@/lib/oauth-apps/authorize";

const URL_ = "https://admin.qrdx.dev";
const KEY = "k".repeat(32);
const HOSTS = "(?:qrdx\\.dev|localhost)";
// RFC 7636 appendix B
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("adminConsoleRedirects", () => {
  it("adds nothing while ADMIN_CONSOLE_URL is unset or empty", () => {
    expect(adminConsoleRedirects(undefined, { hosts: HOSTS })).toEqual([]);
    expect(adminConsoleRedirects("", { hosts: HOSTS })).toEqual([]);
  });

  it("sends each section to its own lower-case section at the console, for now temporarily", () => {
    expect(adminConsoleRedirects(`${URL_}/`, { hosts: HOSTS })).toEqual(
      ["growth", "numbers", "subscriptions", "ai-usage", "affiliates"].map(
        (section) => ({
          source: `/admin/${section}/:path*`,
          destination: `${URL_}/${section}/:path*`,
          permanent: false,
          has: [{ type: "host", value: HOSTS }],
        }),
      ),
    );
  });
});

describe("adminConsoleAddress (what the redirects, the menu and /admin/confirm read)", () => {
  it("is the console's origin only with a client secret of 32 characters or more", () => {
    expect(
      adminConsoleAddress({ adminConsoleUrl: `${URL_}/`, secret: KEY }),
    ).toBe(URL_);
    for (const secret of [undefined, "", "k", "k".repeat(31)]) {
      expect(
        adminConsoleAddress({ adminConsoleUrl: URL_, secret }),
        String(secret),
      ).toBeUndefined();
    }
    expect(
      adminConsoleAddress({ adminConsoleUrl: undefined, secret: KEY }),
    ).toBeUndefined();
    expect(
      adminConsoleAddress({ adminConsoleUrl: "", secret: KEY }),
    ).toBeUndefined();
  });

  it("leaves the menu as before without a usable secret", () => {
    const address = adminConsoleAddress({ adminConsoleUrl: URL_, secret: "k" });
    expect(adminNavLinks(false, address)).toEqual(adminNavLinks(false));
  });
});

describe("adminConsoleHref (the admin menu and the overview's cards)", () => {
  it.each([
    ["/admin/growth", `${URL_}/growth`],
    [
      "/admin/subscriptions?status=active",
      `${URL_}/subscriptions?status=active`,
    ],
    ["/admin/affiliates/abc?page=2", `${URL_}/affiliates/abc?page=2`],
    ["/admin/ai-usage", `${URL_}/ai-usage`],
  ])("turns %s into %s", (href, expected) => {
    expect(adminConsoleHref(href, URL_)).toBe(expected);
    expect(adminConsoleHref(href, `${URL_}/`)).toBe(expected);
  });

  it("leaves this app's own pages, and everything while unset", () => {
    for (const href of ["/admin", "/admin/users", "/admin/growthx", "/x"]) {
      expect(adminConsoleHref(href, URL_), href).toBeNull();
    }
    expect(adminConsoleHref("/admin/growth", undefined)).toBeNull();
  });
});

describe("consoleReturnTarget (/admin/confirm's ?next=)", () => {
  it.each([
    [`${URL_}/growth`, `${URL_}/growth`],
    [`${URL_}/affiliates/abc?page=2`, `${URL_}/affiliates/abc?page=2`],
    [`${URL_}/numbers#x`, `${URL_}/numbers`],
    ["/admin/growth", "/admin/growth"],
  ])("accepts %s", (next, expected) => {
    expect(consoleReturnTarget(next, URL_)).toBe(expected);
  });

  it.each([
    `${URL_}`,
    `${URL_}/`,
    `${URL_}/users/u1`,
    `${URL_}/auth/login`,
    `${URL_}/Growth`,
    `${URL_}/growthx`,
    `${URL_}/growth/../auth/login`,
    `${URL_}/growth/%2e%2e/auth`,
    `${URL_}/growth\\x`,
    "https://admin.qrdx.dev.evil.example/growth",
    "https://evil.example/growth",
    "http://admin.qrdx.dev/growth",
    "https://admin.qrdx.dev:8443/growth",
    "https://user@admin.qrdx.dev/growth",
    "//admin.qrdx.dev/growth",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("refuses %s", (next) => {
    expect(consoleReturnTarget(next, URL_)).toBeNull();
  });

  it("accepts only this site's console paths while unset", () => {
    expect(consoleReturnTarget(`${URL_}/growth`, undefined)).toBeNull();
    expect(consoleReturnTarget("/admin/growth", undefined)).toBe(
      "/admin/growth",
    );
  });
});

describe("the admin menu with the console at its own address", () => {
  it("links its sections there as new pages, and keeps the rest", () => {
    const links = adminNavLinks(false, URL_);
    expect(links.filter((link) => link.crossZone).map((l) => l.href)).toEqual([
      `${URL_}/growth`,
      `${URL_}/ai-usage`,
      `${URL_}/subscriptions`,
      `${URL_}/numbers`,
      `${URL_}/affiliates`,
    ]);
    expect(links.filter((link) => !link.crossZone).map((l) => l.href)).toEqual([
      "/admin",
      "/admin/users",
      "/admin/themes",
      "/admin/community",
      "/admin/codes",
      "/admin/abuse",
      "/admin/integrations",
      "/admin/audit-log",
      "/admin/health",
    ]);
  });

  it("is the menu as before without it", () => {
    expect(adminNavLinks(false)).toEqual(adminNavLinks(false, undefined));
    expect(adminNavLinks(false).some((link) => link.crossZone)).toBe(false);
  });
});

describe("the console client", () => {
  const client = adminConsoleClient({ adminConsoleUrl: URL_, secret: KEY });

  it("exists only with both ADMIN_CONSOLE_URL and a long enough CONSOLE_ZONE_KEY", () => {
    expect(client).toEqual({
      clientId: "qrdx_admin_console",
      redirectUri: `${URL_}/auth/callback`,
      secret: KEY,
    });
    expect(
      adminConsoleClient({ adminConsoleUrl: `${URL_}/`, secret: KEY })
        ?.redirectUri,
    ).toBe(`${URL_}/auth/callback`);
    expect(
      adminConsoleClient({ adminConsoleUrl: undefined, secret: KEY }),
    ).toBeNull();
    expect(
      adminConsoleClient({ adminConsoleUrl: URL_, secret: undefined }),
    ).toBeNull();
    expect(
      adminConsoleClient({ adminConsoleUrl: URL_, secret: "k".repeat(31) }),
    ).toBeNull();
    expect(adminConsoleClient({ adminConsoleUrl: "", secret: "" })).toBeNull();
  });

  it("is told apart by its id and its tokens' prefix", () => {
    expect(isAdminConsoleClientId(ADMIN_CONSOLE_CLIENT_ID)).toBe(true);
    expect(isAdminConsoleClientId("qrdx_app_abc")).toBe(false);
    expect(isAdminConsoleClientId(null)).toBe(false);
    expect(isAdminConsoleToken("qrdxc_abc")).toBe(true);
    expect(isAdminConsoleToken("abc")).toBe(false);
  });

  const params = (overrides: Record<string, string | undefined> = {}) =>
    readAuthorizeParams((key) => {
      const base: Record<string, string> = {
        response_type: "code",
        client_id: ADMIN_CONSOLE_CLIENT_ID,
        redirect_uri: `${URL_}/auth/callback`,
        scope: "openid email profile",
        state: "s".repeat(32),
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
      };
      return key in overrides ? overrides[key] : base[key];
    });

  it("accepts exactly the console's request, scopes in a fixed order", () => {
    if (!client) throw new Error("no client");
    expect(checkAdminConsoleAuthorizeRequest(client, params())).toEqual({
      ok: true,
      scopes: ["openid", "email", "profile"],
    });
    expect(
      checkAdminConsoleAuthorizeRequest(
        client,
        params({ scope: "profile openid" }),
      ),
    ).toEqual({ ok: true, scopes: ["openid", "profile"] });
  });

  it.each([
    ["response_type", "token", "unsupported_response_type"],
    ["redirect_uri", `${URL_}/auth/callback/`, "invalid_request"],
    ["redirect_uri", `${URL_}/auth/callback?x=1`, "invalid_request"],
    ["redirect_uri", "https://evil.example/auth/callback", "invalid_request"],
    ["redirect_uri", `${URL_.toUpperCase()}/auth/callback`, "invalid_request"],
    ["scope", "email profile", "invalid_scope"],
    ["scope", "openid profile:read", "invalid_scope"],
    ["scope", "codes:write", "invalid_scope"],
    ["scope", "", "invalid_scope"],
    ["state", undefined, "invalid_request"],
    ["state", "x".repeat(1025), "invalid_request"],
    ["code_challenge", undefined, "invalid_request"],
    ["code_challenge", "short", "invalid_request"],
    ["code_challenge_method", "plain", "invalid_request"],
    ["code_challenge_method", "S512", "invalid_request"],
  ])("refuses %s = %s with %s", (key, value, error) => {
    if (!client) throw new Error("no client");
    const check = checkAdminConsoleAuthorizeRequest(
      client,
      params({ [key]: value }),
    );
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toBe(error);
  });
});
