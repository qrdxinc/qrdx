// Salesforce: connect, reconnect and disconnect through the real route
// handlers. Enable (production or sandbox) → the callback exchanges the code
// on that same host and stores the tokens encrypted with the org's address
// and the host it signed in on → Disconnect revokes the refresh token on
// that host. Tables live in memory (tests/support/fake-db.ts) and Salesforce
// is a stubbed fetch, so nothing reaches a database or an org.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));

// Obviously fake app credentials, so the OAuth flow can start.
vi.stubEnv("SALESFORCE_CLIENT_ID", "sf_client_test");
vi.stubEnv("SALESFORCE_CLIENT_SECRET", "sf_secret_test");

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_sf" },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name)
        ? { name, value: state.cookies.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      state.cookies.set(name, value);
    },
    delete: (name: string) => {
      state.cookies.delete(name);
    },
  }),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/analytics/server", () => ({
  trackServer: () => {},
  hasAnalyticsConsent: async () => false,
}));
// "Confirm it's you" has its own suite (tests/lib/confirm-data-out-connect).
vi.mock("@/lib/data-connections/connect-confirmation", () => ({
  connectConfirmationNeeded: async () => null,
  connectSendsDataOut: () => true,
}));

const connect = await import("@/app/api/integrations/[provider]/route");
const callback = await import(
  "@/app/api/integrations/[provider]/callback/route"
);

const ORIGIN = "http://localhost:3000";
const ACCESS_TOKEN = "00Dxx!sf_access_token_test";
const REFRESH_TOKEN = "sf_refresh_token_test";
const INSTANCE = "https://acme--uat.sandbox.my.salesforce.com";
const params = { params: Promise.resolve({ provider: "salesforce" }) };

interface Call {
  method: string;
  url: URL;
  form: URLSearchParams;
}
let calls: Call[] = [];

function stubSalesforce() {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        method,
        url,
        form: new URLSearchParams(
          typeof init?.body === "string" ? init.body : "",
        ),
      });
      if (
        url.hostname !== "login.salesforce.com" &&
        url.hostname !== "test.salesforce.com"
      ) {
        throw new Error(`Unexpected request to ${url.origin}`);
      }
      if (method === "POST" && url.pathname === "/services/oauth2/token") {
        // Salesforce's token response has no expires_in.
        return Response.json({
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          signature: "sig",
          scope: "refresh_token api",
          instance_url: INSTANCE,
          id: `https://${url.hostname}/id/00D5g000004XyZaEAK/0055g00000AbCdEAAA`,
          token_type: "Bearer",
          issued_at: "1764000000000",
        });
      }
      if (method === "POST" && url.pathname === "/services/oauth2/revoke") {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected Salesforce call ${method} ${url.pathname}`);
    },
  );
}

beforeEach(() => {
  fakeDb.reset();
  state.cookies.clear();
  calls = [];
  stubSalesforce();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("SALESFORCE_CLIENT_ID", "sf_client_test");
  vi.stubEnv("SALESFORCE_CLIENT_SECRET", "sf_secret_test");
});

/** Enable → Salesforce's sign-in → back to the callback, as a browser would. */
async function connectSalesforce(query = "") {
  const start = await connect.GET(
    new Request(`${ORIGIN}/api/integrations/salesforce?action=connect${query}`),
    params,
  );
  expect(start.status).toBe(200);
  const authUrl = new URL((await start.json()).url);
  const back = await callback.GET(
    new Request(
      `${ORIGIN}/api/integrations/salesforce/callback?code=code_test&state=${authUrl.searchParams.get("state")}`,
    ),
    params,
  );
  return { authUrl, back };
}

describe("Salesforce: connect", () => {
  it("signs a sandbox in on test.salesforce.com and keeps the org's address", async () => {
    const { authUrl, back } = await connectSalesforce("&variant=sandbox");

    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://test.salesforce.com/services/oauth2/authorize",
    );
    expect(authUrl.searchParams.get("client_id")).toBe("sf_client_test");
    expect(authUrl.searchParams.get("scope")).toBe("api refresh_token");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");

    expect(new URL(back.headers.get("location") as string).search).toBe(
      "?success=salesforce_connected",
    );
    // The code goes back to the same host, with the PKCE verifier.
    const [token] = calls;
    expect(token?.url.href).toBe(
      "https://test.salesforce.com/services/oauth2/token",
    );
    expect(token?.form.get("code")).toBe("code_test");
    expect(token?.form.get("code_verifier")).toBeTruthy();
    expect([...state.cookies.keys()]).toEqual([]);

    const [row] = fakeDb.rows("integration");
    expect(row).toMatchObject({
      userId: "user_sf",
      provider: "salesforce",
      status: "active",
      expiresAt: null,
      metadata: {
        name: "acme--uat.sandbox.my.salesforce.com",
        instanceUrl: INSTANCE,
        orgId: "00D5g000004XyZaEAK",
        oauthVariant: "sandbox",
      },
    });
    // Tokens are stored encrypted and never in the metadata.
    expect(row?.accessToken).not.toContain(ACCESS_TOKEN);
    expect(row?.refreshToken).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(row?.metadata)).not.toContain("token_test");
  });

  it("uses login.salesforce.com by default and for unknown hosts", async () => {
    const { authUrl } = await connectSalesforce("&variant=https://evil.com");
    expect(authUrl.origin).toBe("https://login.salesforce.com");
    expect(calls[0]?.url.origin).toBe("https://login.salesforce.com");
    const [row] = fakeDb.rows("integration");
    expect(row?.metadata).toBeTruthy();
    expect(row?.metadata).not.toHaveProperty("oauthVariant");
  });

  it("revokes the refresh token on the org's sign-in host when disconnecting", async () => {
    await connectSalesforce("&variant=sandbox");
    calls = [];
    // Calls to connected tools are off outside production unless allowed.
    vi.stubEnv("QRDX_ALLOW_DEV_DELIVERY", "1");

    const res = await connect.DELETE(
      new Request(`${ORIGIN}/api/integrations/salesforce`, {
        method: "DELETE",
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.href).toBe(
      "https://test.salesforce.com/services/oauth2/revoke",
    );
    expect(calls[0]?.form.get("token")).toBe(REFRESH_TOKEN);
    expect(fakeDb.rows("integration")).toEqual([]);
  });
});
