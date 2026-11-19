// The back-office console at its own address (ADMIN_CONSOLE_URL): the pure
// rules in @repo/next-config/console-zone and lib/admin-console/client that
// the redirects, the admin menu, /oauth/confirm and the OAuth routes share.
// Nothing here touches a database.
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_CONSOLE_SECTIONS,
  adminConsoleAddress,
  adminConsoleCancelUrl,
  adminConsoleHref,
  adminConsoleRedirects,
  adminConsoleReturnUrl,
  CONSOLE_ONLY_SECTIONS,
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

const URL_ = "https://console.qrdx.dev";
const KEY = "k".repeat(32);
const HOSTS = "(?:qrdx\\.dev|localhost)";
// RFC 7636 appendix B
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const ADMIN_DIR = path.resolve(import.meta.dirname, "../../app/(app)/admin");

describe("ADMIN_CONSOLE_SECTIONS", () => {
  it("is every section of this app's admin, once, except the old confirm page, and the console's own", () => {
    const folders = readdirSync(ADMIN_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name)
      .filter((name) => name !== "confirm")
      .sort();
    expect([...ADMIN_CONSOLE_SECTIONS].sort()).toEqual(
      [...folders, ...CONSOLE_ONLY_SECTIONS].sort(),
    );
    for (const section of CONSOLE_ONLY_SECTIONS) {
      expect(folders, section).not.toContain(section);
    }
    expect(new Set(ADMIN_CONSOLE_SECTIONS).size).toBe(
      ADMIN_CONSOLE_SECTIONS.length,
    );
  });

  it("covers every entry of the admin menu", () => {
    for (const { href } of adminNavLinks(false)) {
      expect(adminConsoleHref(href, URL_), href).not.toBeNull();
    }
  });

  it("lists the console's own sections in the menu only at the console's address", () => {
    const email = (links: { href: string; crossZone: boolean }[]) =>
      links.find((link) => link.href.endsWith("/email"));
    expect(email(adminNavLinks(false))).toBeUndefined();
    // The proxied console (CONSOLE_ORIGIN) serves its five sections only.
    expect(email(adminNavLinks(true))).toBeUndefined();
    expect(email(adminNavLinks(false, URL_))).toMatchObject({
      href: `${URL_}/email`,
      crossZone: true,
    });
  });
});

describe("adminConsoleRedirects", () => {
  it("adds nothing while ADMIN_CONSOLE_URL is unset or empty", () => {
    expect(adminConsoleRedirects(undefined, { hosts: HOSTS })).toEqual([]);
    expect(adminConsoleRedirects("", { hosts: HOSTS })).toEqual([]);
  });

  it("sends all of /admin to the console, each section to its lower-case path, for now temporarily", () => {
    const has = [{ type: "host", value: HOSTS }];
    const rule = (source: string, destination: string) => ({
      source,
      destination,
      permanent: false,
      has,
    });
    expect(adminConsoleRedirects(`${URL_}/`, { hosts: HOSTS })).toEqual([
      rule("/admin", `${URL_}/`),
      rule("/admin/confirm", "/oauth/confirm"),
      ...[
        "growth",
        "numbers",
        "subscriptions",
        "ai-usage",
        "affiliates",
        "users",
        "themes",
        "community",
        "codes",
        "abuse",
        "integrations",
        "audit-log",
        "health",
        "search",
        "email",
      ].flatMap((section) => [
        rule(`/admin/${section}`, `${URL_}/${section}`),
        rule(`/admin/${section}/:path+`, `${URL_}/${section}/:path+`),
      ]),
      rule("/admin/:path+", `${URL_}/:path+`),
    ]);
  });

  it("uses the origin alone, whatever else the value has", () => {
    for (const value of [`${URL_}/x`, `${URL_}?a=1`, `${URL_}#h`]) {
      for (const { destination } of adminConsoleRedirects(value, {
        hosts: HOSTS,
      })) {
        expect(
          destination.startsWith(`${URL_}/`) ||
            destination === "/oauth/confirm",
          destination,
        ).toBe(true);
        expect(destination).not.toMatch(/[?#]|\/x\//);
      }
    }
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

describe("adminConsoleHref (the admin menus and the overview's cards)", () => {
  it.each([
    ["/admin", `${URL_}/`],
    ["/admin?x=1", `${URL_}/?x=1`],
    ["/admin/growth", `${URL_}/growth`],
    [
      "/admin/subscriptions?status=active",
      `${URL_}/subscriptions?status=active`,
    ],
    ["/admin/affiliates/abc?page=2", `${URL_}/affiliates/abc?page=2`],
    ["/admin/ai-usage", `${URL_}/ai-usage`],
    ["/admin/users", `${URL_}/users`],
    ["/admin/users/u_1/export", `${URL_}/users/u_1/export`],
    ["/admin/search?q=maria", `${URL_}/search?q=maria`],
    ["/admin/codes?kind=page", `${URL_}/codes?kind=page`],
    ["/admin/audit-log", `${URL_}/audit-log`],
    ["/admin/Users/AbC", `${URL_}/users/AbC`],
  ])("turns %s into %s", (href, expected) => {
    expect(adminConsoleHref(href, URL_)).toBe(expected);
    expect(adminConsoleHref(href, `${URL_}/`)).toBe(expected);
  });

  it("leaves anything else, and everything while unset", () => {
    for (const href of [
      "/admin/confirm",
      "/admin/growthx",
      "/admin/userss",
      "/administrator",
      "/x",
      "https://evil.example/admin/users",
      "//evil.example/admin/users",
    ]) {
      expect(adminConsoleHref(href, URL_), href).toBeNull();
    }
    expect(adminConsoleHref("/admin/growth", undefined)).toBeNull();
    expect(adminConsoleHref("/admin", undefined)).toBeNull();
  });
});

describe("adminConsoleReturnUrl (/oauth/confirm's ?next=)", () => {
  it.each([
    [`${URL_}`, `${URL_}/`],
    [`${URL_}/`, `${URL_}/`],
    [`${URL_}/growth`, `${URL_}/growth`],
    [
      `${URL_}/affiliates/abc?page=2&confirmed=1`,
      `${URL_}/affiliates/abc?page=2&confirmed=1`,
    ],
    [`${URL_}/users/u_1?confirmed=1`, `${URL_}/users/u_1?confirmed=1`],
    [`${URL_}/numbers#x`, `${URL_}/numbers`],
    // Anything in the query, encoded or not.
    [
      `${URL_}/search?q=caf%C3%A9&next=%2F%2Fx&confirmed=1`,
      `${URL_}/search?q=caf%C3%A9&next=%2F%2Fx&confirmed=1`,
    ],
    // The same origin, written differently: given back as the URL parser has it.
    ["HTTPS://CONSOLE.QRDX.DEV/growth", `${URL_}/growth`],
    ["https://console.qrdx.dev:443/growth", `${URL_}/growth`],
  ])("accepts %s", (next, expected) => {
    expect(adminConsoleReturnUrl(next, URL_)).toBe(expected);
    expect(adminConsoleReturnUrl(next, `${URL_}/`)).toBe(expected);
  });

  it.each([
    // Other hosts, look-alikes and other schemes or ports.
    "https://evil.example/growth",
    "https://console.qrdx.dev.evil.example/growth",
    "https://evilconsole.qrdx.dev/growth",
    "https://console.qrdx.dev./growth",
    "https://xn--cnsole-8sf.qrdx.dev/growth",
    "https://cоnsole.qrdx.dev/growth",
    "http://console.qrdx.dev/growth",
    "https://console.qrdx.dev:8443/growth",
    "https://console.qrdx.dev:80/growth",
    "wss://console.qrdx.dev/growth",
    "https://qrdx.dev/admin/users",
    "https://api.qrdx.dev/growth",
    // Userinfo, and userinfo that hides another host.
    "https://user@console.qrdx.dev/growth",
    "https://user:pass@console.qrdx.dev/growth",
    "https://console.qrdx.dev@evil.example/growth",
    "https://console.qrdx.dev%40evil.example/growth",
    // Relative and protocol-relative.
    "//console.qrdx.dev/growth",
    "//evil.example/growth",
    "///evil.example/growth",
    "/growth",
    "growth",
    // Backslashes, whitespace and control characters browsers rewrite.
    "https:\\\\evil.example/growth",
    "https://console.qrdx.dev\\@evil.example/",
    `${URL_}/growth\\x`,
    " https://evil.example/",
    "https://console.qrdx.dev/\tgrowth",
    "\nhttps://evil.example/",
    "https://console.qrdx.dev/\u0000growth",
    // Dot segments, encoded or not, and the console's sign-in routes,
    // however the path hides them: an empty segment, an encoded letter or
    // an encoded slash.
    `${URL_}/growth/../auth/login`,
    `${URL_}/growth/%2e%2e/auth`,
    `${URL_}/auth`,
    `${URL_}/auth/login`,
    `${URL_}/auth/logout`,
    `${URL_}/auth/callback?code=x`,
    `${URL_}/AUTH`,
    `${URL_}//auth/logout`,
    `${URL_}///auth/login`,
    `${URL_}/%61uth/login`,
    `${URL_}/%41UTH/login`,
    `${URL_}/auth%2flogin`,
    `${URL_}/auth%2Flogout`,
    `${URL_}/%2fauth/login`,
    // Any empty segment or encoding in the path, which the console's own
    // pages never need.
    `${URL_}/growth//x`,
    `${URL_}/users/%75_1`,
    `${URL_}/users/café`,
    // Not a web page at all.
    "javascript:alert(1)",
    "data:text/html,hi",
    `${URL_}/${"x".repeat(2048)}`,
    "",
    null,
    undefined,
  ])("refuses %j", (next) => {
    expect(adminConsoleReturnUrl(next, URL_)).toBeNull();
  });

  it("never lets a hidden /auth path through, however it's written", () => {
    for (const path of [
      "//auth/logout",
      "/%61uth/login",
      "/auth%2flogin",
      "/a%75th",
      "/./auth/login",
      "/x/../auth/login",
    ]) {
      expect(adminConsoleReturnUrl(`${URL_}${path}`, URL_), path).toBeNull();
    }
  });

  it("refuses everything while the console isn't set up", () => {
    expect(adminConsoleReturnUrl(`${URL_}/growth`, undefined)).toBeNull();
    expect(adminConsoleReturnUrl(`${URL_}/growth`, "")).toBeNull();
  });
});

describe("adminConsoleCancelUrl (/oauth/confirm's Go back)", () => {
  it.each([
    [`${URL_}/affiliates/a?page=2&confirmed=1`, `${URL_}/affiliates/a?page=2`],
    [`${URL_}/growth?confirmed=1`, `${URL_}/growth`],
    [`${URL_}/users/u_1?confirmed=0&x=1`, `${URL_}/users/u_1?x=1`],
    [`${URL_}/`, `${URL_}/`],
    [`${URL_}/search?q=a`, `${URL_}/search?q=a`],
  ])("turns %s into %s", (back, expected) => {
    expect(adminConsoleCancelUrl(back)).toBe(expected);
  });
});

describe("the admin menu with the console at its own address", () => {
  it("links every entry there as a new page", () => {
    const links = adminNavLinks(false, URL_);
    expect(links.every((link) => link.crossZone)).toBe(true);
    expect(links.map((link) => link.href)).toEqual([
      `${URL_}/`,
      `${URL_}/growth`,
      `${URL_}/users`,
      `${URL_}/themes`,
      `${URL_}/community`,
      `${URL_}/codes`,
      `${URL_}/abuse`,
      `${URL_}/ai-usage`,
      `${URL_}/subscriptions`,
      `${URL_}/numbers`,
      `${URL_}/affiliates`,
      `${URL_}/integrations`,
      `${URL_}/audit-log`,
      `${URL_}/health`,
      `${URL_}/email`,
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
