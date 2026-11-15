// The back-office console signing in through this app's OAuth provider as
// a first-party client (lib/admin-console), driven through the real route
// handlers on in-memory tables (tests/support/fake-db.ts). Unset, the client
// id is unknown. Set, only this deployment's admin, signed in and not held,
// gets a one-time code bound to the console's exact redirect URI and PKCE
// challenge; the console exchanges it with the shared secret for a one-time
// access token, and userinfo answers OpenID claims plus the session id.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const CONSOLE = "https://admin.qrdx.test";
const CALLBACK = `${CONSOLE}/auth/callback`;
const KEY = "test-zone-key-at-least-32-characters-long";
const CLIENT = "qrdx_admin_console";
// RFC 7636 appendix B
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STATE = "state-0123456789";
const ORIGIN = "http://localhost:3000";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  held: false,
  holdChecks: 0,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/lib/account/session-origin-server", () => ({
  getSessionAllowingHold: async () =>
    auth.userId
      ? {
          user: { id: auth.userId, email: `${auth.userId}@qrdx.test` },
          session: { id: `session_${auth.userId}`, createdAt: new Date() },
        }
      : null,
  isSessionHeld: async () => {
    auth.holdChecks++;
    return auth.held;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));

// The client exists: both variables set before anything reads @/env.
vi.stubEnv("ADMIN_CONSOLE_URL", CONSOLE);
vi.stubEnv("CONSOLE_ZONE_KEY", KEY);

const authorize = await import("@/app/api/oauth/authorize/route");
const token = await import("@/app/api/oauth/token/route");
const userinfo = await import("@/app/api/oauth/userinfo/route");
const { ticketIdentifier, CODE_IDENTIFIER_PREFIX } = await import(
  "@/lib/admin-console/tickets"
);

function seed() {
  fakeDb.reset();
  fakeDb.seed("user", [
    {
      id: "u_admin",
      name: "Owner",
      email: "owner@qrdx.test",
      emailVerified: true,
      image: "https://example.com/owner.png",
      role: "admin",
      banned: false,
      banExpires: null,
    },
    {
      id: "u_banned",
      name: "Banned",
      email: "banned@qrdx.test",
      emailVerified: true,
      image: null,
      role: "admin",
      banned: true,
      banExpires: null,
    },
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@example.com",
      emailVerified: true,
      image: null,
      role: "user",
      banned: false,
      banExpires: null,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
  auth.userId = null;
  auth.held = false;
  auth.holdChecks = 0;
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

type Query = Record<string, string | undefined>;

const baseQuery = (overrides: Query = {}): Query => ({
  response_type: "code",
  client_id: CLIENT,
  redirect_uri: CALLBACK,
  scope: "openid email profile",
  state: STATE,
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  ...overrides,
});

function getAuthorize(query: Query, handler = authorize.GET) {
  const url = new URL("/api/oauth/authorize", ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return handler(new NextRequest(url));
}

function form(fields: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, value);
  }
  return body;
}

const postToken = (
  fields: Record<string, string | undefined>,
  handler = token.POST,
) =>
  handler(
    new NextRequest(new URL("/api/oauth/token", ORIGIN), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(fields),
    }),
  );

const getUserinfo = (accessToken: string, handler = userinfo.GET) =>
  handler(
    new NextRequest(new URL("/api/oauth/userinfo", ORIGIN), {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );

const location = (response: Response) =>
  new URL(response.headers.get("location") as string);

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: string }).error;

/** Signs the admin in and gets a code for the console. */
async function codeFor(query: Query = baseQuery()): Promise<string> {
  auth.userId = "u_admin";
  const response = await getAuthorize(query);
  expect(response.status).toBe(302);
  const to = location(response);
  expect(`${to.origin}${to.pathname}`).toBe(CALLBACK);
  expect(to.searchParams.get("state")).toBe(STATE);
  const code = to.searchParams.get("code");
  expect(code).toBeTruthy();
  return code as string;
}

const exchange = (
  code: string,
  overrides: Record<string, string | undefined> = {},
) =>
  postToken({
    grant_type: "authorization_code",
    client_id: CLIENT,
    client_secret: KEY,
    code,
    redirect_uri: CALLBACK,
    code_verifier: VERIFIER,
    ...overrides,
  });

describe("GET /api/oauth/authorize for the console", () => {
  it("sends a signed-out admin to sign in, and back here afterwards", async () => {
    const response = await getAuthorize(baseQuery());
    expect(response.status).toBe(302);
    const to = location(response);
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe("/sign-in");
    const next = new URL(to.searchParams.get("next") as string, ORIGIN);
    expect(next.pathname).toBe("/api/oauth/authorize");
    expect(Object.fromEntries(next.searchParams)).toEqual(baseQuery());
    expect(fakeDb.rows("verification")).toEqual([]);
  });

  it("sends a held session to the check page, with its real headers", async () => {
    auth.userId = "u_admin";
    auth.held = true;
    const response = await getAuthorize(baseQuery());
    expect(response.status).toBe(302);
    const to = location(response);
    expect(to.pathname).toBe("/session-check");
    expect(to.searchParams.get("next")).toMatch(/^\/api\/oauth\/authorize\?/);
    expect(auth.holdChecks).toBe(1);
    expect(fakeDb.rows("verification")).toEqual([]);
  });

  it.each(["u_ana", "u_banned", "u_unknown"])(
    "sends %s back with access_denied, never a code",
    async (userId) => {
      auth.userId = userId;
      const response = await getAuthorize(baseQuery());
      expect(response.status).toBe(302);
      const to = location(response);
      expect(`${to.origin}${to.pathname}`).toBe(CALLBACK);
      expect(Object.fromEntries(to.searchParams)).toEqual({
        error: "access_denied",
        error_description: "This account can't use the console",
        state: STATE,
      });
      expect(fakeDb.rows("verification")).toEqual([]);
    },
  );

  it("gives an admin a one-time code bound to the request, stored hashed", async () => {
    const code = await codeFor();
    const rows = fakeDb.rows("verification");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).toBe(
      ticketIdentifier(CODE_IDENTIFIER_PREFIX, code),
    );
    expect(JSON.stringify(rows[0])).not.toContain(code);
    expect(JSON.parse(rows[0]?.value as string)).toEqual({
      userId: "u_admin",
      sessionId: "session_u_admin",
      redirectUri: CALLBACK,
      codeChallenge: CHALLENGE,
      scopes: ["openid", "email", "profile"],
    });
    expect(new Date(rows[0]?.expiresAt as Date).toISOString()).toBe(
      "2026-11-15T10:02:00.000Z",
    );
  });

  it.each([
    [{ redirect_uri: `${CONSOLE}/auth/callback/` }, "invalid_request"],
    [{ redirect_uri: "https://evil.example/auth/callback" }, "invalid_request"],
    [{ code_challenge: undefined }, "invalid_request"],
    [
      { code_challenge_method: "plain", code_challenge: VERIFIER },
      "invalid_request",
    ],
    [{ scope: "profile:read" }, "invalid_scope"],
    [{ scope: "email profile" }, "invalid_scope"],
    [{ state: undefined }, "invalid_request"],
    [{ response_type: "token" }, "unsupported_response_type"],
  ])(
    "answers %j with a JSON %s, never a redirect",
    async (overrides, error) => {
      auth.userId = "u_admin";
      const response = await getAuthorize(baseQuery(overrides));
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(await errorOf(response)).toBe(error);
      expect(fakeDb.rows("verification")).toEqual([]);
    },
  );

  it("has no consent page: a POST with its id is refused", async () => {
    auth.userId = "u_admin";
    const response = await authorize.POST(
      new NextRequest(new URL("/api/oauth/authorize", ORIGIN), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: ORIGIN,
        },
        body: form({ ...baseQuery(), decision: "allow" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_client");
  });
});

describe("POST /api/oauth/token for the console", () => {
  it("exchanges a code once for a one-time access token", async () => {
    const code = await codeFor();
    const response = await exchange(code);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      access_token: expect.stringMatching(/^qrdxc_[A-Za-z0-9_-]{43}$/),
      token_type: "Bearer",
      expires_in: 60,
      scope: "openid email profile",
    });
    // The code is gone; the token's row is there, hashed.
    const rows = fakeDb.rows("verification");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).toMatch(/^qrdx-console-token-/);
    expect(JSON.stringify(rows)).not.toContain(body.access_token);

    const again = await exchange(code);
    expect(again.status).toBe(400);
    expect(await errorOf(again)).toBe("invalid_grant");
  });

  it("checks the secret before touching the code", async () => {
    const code = await codeFor();
    for (const client_secret of ["", "nope", `${KEY}x`, KEY.slice(1)]) {
      const response = await exchange(code, { client_secret });
      expect(response.status).toBe(client_secret ? 401 : 400);
      expect(await errorOf(response)).toBe(
        client_secret ? "invalid_client" : "invalid_request",
      );
    }
    // Still good for the console itself.
    expect((await exchange(code)).status).toBe(200);
  });

  it.each([
    [
      { code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier-x" },
      "invalid_grant",
    ],
    [{ code_verifier: undefined }, "invalid_request"],
    [{ redirect_uri: `${CONSOLE}/auth/callback/` }, "invalid_grant"],
    [{ grant_type: "refresh_token" }, "unsupported_grant_type"],
  ])("refuses %j with %s", async (overrides, error) => {
    const code = await codeFor();
    const response = await exchange(code, overrides);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe(error);
  });

  it("refuses a code after two minutes", async () => {
    const code = await codeFor();
    vi.setSystemTime(new Date("2026-11-15T10:02:01Z"));
    const response = await exchange(code);
    expect(await errorOf(response)).toBe("invalid_grant");
    expect(fakeDb.rows("verification")).toEqual([]);
  });

  it("refuses a code for an account banned since", async () => {
    const code = await codeFor();
    const owner = fakeDb.find("user", { id: "u_admin" });
    if (owner) owner.banned = true;
    const response = await exchange(code);
    expect(await errorOf(response)).toBe("invalid_grant");
  });

  it("never issues a refresh token", async () => {
    const body = await (await exchange(await codeFor())).json();
    expect(body).not.toHaveProperty("refresh_token");
  });
});

describe("GET /api/oauth/userinfo for the console", () => {
  async function tokenFor(query?: Query): Promise<string> {
    const body = (await (await exchange(await codeFor(query))).json()) as {
      access_token: string;
    };
    return body.access_token;
  }

  it("answers OpenID claims and the session id, once", async () => {
    const accessToken = await tokenFor();
    const response = await getUserinfo(accessToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      sub: "u_admin",
      sid: "session_u_admin",
      email: "owner@qrdx.test",
      email_verified: true,
      name: "Owner",
      picture: "https://example.com/owner.png",
    });
    const again = await getUserinfo(accessToken);
    expect(again.status).toBe(401);
    expect(fakeDb.rows("verification")).toEqual([]);
  });

  it("answers only the claims of the scopes granted", async () => {
    const accessToken = await tokenFor(baseQuery({ scope: "openid" }));
    expect(await (await getUserinfo(accessToken)).json()).toEqual({
      sub: "u_admin",
      sid: "session_u_admin",
    });
  });

  it("refuses an expired, unknown or malformed token", async () => {
    const accessToken = await tokenFor();
    vi.setSystemTime(new Date("2026-11-15T10:01:01Z"));
    expect((await getUserinfo(accessToken)).status).toBe(401);
    expect((await getUserinfo("qrdxc_unknown")).status).toBe(401);
    expect((await getUserinfo("qrdxc_")).status).toBe(401);
  });

  it("refuses an account banned since", async () => {
    const accessToken = await tokenFor();
    const owner = fakeDb.find("user", { id: "u_admin" });
    if (owner) owner.banned = true;
    expect((await getUserinfo(accessToken)).status).toBe(401);
  });
});

describe("while ADMIN_CONSOLE_URL is unset", () => {
  async function unsetRoutes() {
    vi.resetModules();
    vi.stubEnv("ADMIN_CONSOLE_URL", "");
    vi.stubEnv("CONSOLE_ZONE_KEY", KEY);
    return {
      authorize: await import("@/app/api/oauth/authorize/route"),
      token: await import("@/app/api/oauth/token/route"),
      userinfo: await import("@/app/api/oauth/userinfo/route"),
    };
  }

  afterEach(() => {
    vi.stubEnv("ADMIN_CONSOLE_URL", CONSOLE);
  });

  it("knows no such client", async () => {
    const routes = await unsetRoutes();
    auth.userId = "u_admin";
    const authorized = await getAuthorize(baseQuery(), routes.authorize.GET);
    expect(authorized.status).toBe(400);
    expect(await errorOf(authorized)).toBe("invalid_client");

    const exchanged = await postToken(
      {
        grant_type: "authorization_code",
        client_id: CLIENT,
        client_secret: KEY,
        code: "x",
        redirect_uri: CALLBACK,
        code_verifier: VERIFIER,
      },
      routes.token.POST,
    );
    expect(exchanged.status).toBe(401);
    expect(await errorOf(exchanged)).toBe("invalid_client");

    expect(
      (await getUserinfo("qrdxc_anything", routes.userinfo.GET)).status,
    ).toBe(401);
    expect(fakeDb.rows("verification")).toEqual([]);
  });

  it("knows no such client without the secret either", async () => {
    vi.resetModules();
    vi.stubEnv("ADMIN_CONSOLE_URL", CONSOLE);
    vi.stubEnv("CONSOLE_ZONE_KEY", "");
    const routes = await import("@/app/api/oauth/authorize/route");
    auth.userId = "u_admin";
    const response = await getAuthorize(baseQuery(), routes.GET);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_client");
  });
});
