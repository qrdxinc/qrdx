// Zoho CRM: connect, the data centre and disconnect through the real route
// handlers. Enable → Zoho's sign-in on accounts.zoho.com → back to the
// callback with the person's own accounts server (`accounts-server`) → the
// code is exchanged there, and the row keeps that server and the CRM API
// domain → Disconnect revokes the refresh token on the same server. An
// accounts server off Zoho's list is refused before any code is sent.
// Tables live in memory (tests/support/fake-db.ts) and Zoho is a stubbed
// fetch with the shapes its docs describe, so nothing reaches a database or
// Zoho.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));

// Obviously fake app credentials, so the OAuth flow can start.
vi.stubEnv("ZOHO_CLIENT_ID", "zoho_client_test");
vi.stubEnv("ZOHO_CLIENT_SECRET", "zoho_secret_test");

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
        user: { id: "user_zoho" },
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
const ACCESS_TOKEN = "1000.zoho_access_token_test";
const REFRESH_TOKEN = "1000.zoho_refresh_token_test";
const params = { params: Promise.resolve({ provider: "zoho-crm" }) };

interface Call {
  method: string;
  url: URL;
  form: URLSearchParams;
  authorization: string | null;
}
let calls: Call[] = [];
/** What Zoho's token endpoint answers with, besides the tokens. */
let tokenExtra: Record<string, unknown> = {};

const ACCOUNTS_HOSTS = new Set([
  "accounts.zoho.com",
  "accounts.zoho.eu",
  "accounts.zoho.in",
]);

function stubZoho() {
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
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (!ACCOUNTS_HOSTS.has(url.hostname)) {
        throw new Error(`Unexpected request to ${url.origin}`);
      }
      if (method === "POST" && url.pathname === "/oauth/v2/token") {
        return Response.json({
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          api_domain: "https://www.zohoapis.in",
          token_type: "Bearer",
          expires_in: 3600,
          ...tokenExtra,
        });
      }
      if (method === "POST" && url.pathname === "/oauth/v2/revoke/token") {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected Zoho call ${method} ${url.pathname}`);
    },
  );
}

beforeEach(() => {
  fakeDb.reset();
  state.cookies.clear();
  calls = [];
  tokenExtra = {};
  stubZoho();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("ZOHO_CLIENT_ID", "zoho_client_test");
  vi.stubEnv("ZOHO_CLIENT_SECRET", "zoho_secret_test");
});

/** Enable → Zoho's sign-in → back to the callback, as a browser would. */
async function connectZoho(back: Record<string, string>) {
  const start = await connect.GET(
    new Request(`${ORIGIN}/api/integrations/zoho-crm?action=connect`),
    params,
  );
  expect(start.status).toBe(200);
  const authUrl = new URL((await start.json()).url);
  const query = new URLSearchParams({
    code: "1000.code_test",
    state: authUrl.searchParams.get("state") ?? "",
    ...back,
  });
  const response = await callback.GET(
    new Request(`${ORIGIN}/api/integrations/zoho-crm/callback?${query}`),
    params,
  );
  return { authUrl, response };
}

const locationOf = (response: Response) =>
  new URL(response.headers.get("location") as string);

describe("Zoho CRM: connect", () => {
  it("exchanges the code on the person's data centre and keeps it for later", async () => {
    const { authUrl, response } = await connectZoho({
      location: "in",
      "accounts-server": "https://accounts.zoho.in",
    });

    // Everyone signs in on accounts.zoho.com, with offline access
    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://accounts.zoho.com/oauth/v2/auth",
    );
    expect(authUrl.searchParams.get("client_id")).toBe("zoho_client_test");
    expect(authUrl.searchParams.get("scope")).toBe(
      "ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.UPDATE",
    );
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/integrations/zoho-crm/callback`,
    );

    const back = locationOf(response);
    expect(back.pathname).toBe("/settings/integrations/zoho-crm");
    expect(back.search).toBe("?success=zoho-crm_connected");

    // The code goes to the India accounts server, and nowhere else
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.href).toBe("https://accounts.zoho.in/oauth/v2/token");
    expect(calls[0]?.form.get("code")).toBe("1000.code_test");
    expect(calls[0]?.form.get("grant_type")).toBe("authorization_code");
    expect([...state.cookies.keys()]).toEqual([]);

    const [row] = fakeDb.rows("integration");
    expect(row).toMatchObject({
      userId: "user_zoho",
      provider: "zoho-crm",
      status: "active",
      metadata: {
        name: "Zoho CRM (India data centre)",
        apiDomain: "https://www.zohoapis.in",
        dataCentre: "in",
        oauthTokenOrigin: "https://accounts.zoho.in",
      },
    });
    expect(row?.expiresAt).toBeInstanceOf(Date);
    // Tokens are stored encrypted and never in the metadata.
    expect(row?.accessToken).not.toContain(ACCESS_TOKEN);
    expect(row?.refreshToken).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(row?.metadata)).not.toContain("token_test");
  });

  it("uses accounts.zoho.com when the callback names no data centre", async () => {
    tokenExtra = { api_domain: "https://www.zohoapis.com" };
    const { response } = await connectZoho({});
    expect(locationOf(response).search).toBe("?success=zoho-crm_connected");
    expect(calls[0]?.url.origin).toBe("https://accounts.zoho.com");
    const [row] = fakeDb.rows("integration");
    expect(row?.metadata).toMatchObject({ dataCentre: "us" });
    expect(row?.metadata).not.toHaveProperty("oauthTokenOrigin");
  });

  it.each([
    "https://evil.example",
    "http://accounts.zoho.in",
    "https://accounts.zoho.in.evil.example",
    "https://accounts.zoho.ae",
  ])(
    "refuses %s as a data centre, before sending the code anywhere",
    async (server) => {
      const { response } = await connectZoho({ "accounts-server": server });
      const back = locationOf(response);
      expect(back.pathname).toBe("/settings/integrations/zoho-crm");
      expect(back.searchParams.get("error")).toBe("unsupported_region");
      expect(calls).toEqual([]);
      expect(fakeDb.rows("integration")).toEqual([]);
    },
  );

  it("saves nothing when the token response names an API domain off Zoho's list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    tokenExtra = { api_domain: "https://evil.example" };
    const { response } = await connectZoho({
      "accounts-server": "https://accounts.zoho.eu",
    });
    expect(locationOf(response).searchParams.get("error")).toBe(
      "provider_rejected",
    );
    expect(fakeDb.rows("integration")).toEqual([]);
  });

  it("saves nothing when Zoho answers the code with an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "invalid_code" }),
    );
    const { response } = await connectZoho({
      "accounts-server": "https://accounts.zoho.eu",
    });
    expect(locationOf(response).search).toContain("unexpected_error");
    expect(fakeDb.rows("integration")).toEqual([]);
  });
});

describe("Zoho CRM: disconnect", () => {
  it("revokes the refresh token on the data centre it came from", async () => {
    await connectZoho({ "accounts-server": "https://accounts.zoho.eu" });
    calls = [];
    // Calls to connected tools are off outside production unless allowed.
    vi.stubEnv("QRDX_ALLOW_DEV_DELIVERY", "1");

    const res = await connect.DELETE(
      new Request(`${ORIGIN}/api/integrations/zoho-crm`, { method: "DELETE" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.href).toBe(
      "https://accounts.zoho.eu/oauth/v2/revoke/token",
    );
    expect(calls[0]?.form.get("token")).toBe(REFRESH_TOKEN);
    expect(calls[0]?.form.get("token_type")).toBe("refresh_token");
    expect(calls[0]?.authorization).toBe(
      `Basic ${Buffer.from("zoho_client_test:zoho_secret_test").toString("base64")}`,
    );
    expect(fakeDb.rows("integration")).toEqual([]);
  });
});
