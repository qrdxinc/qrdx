// Signing in to QRdx from an MCP client, as apps/docs/content/docs/
// developers/mcp.mdx describes it, through the real route handlers:
// - discovery: protected resource metadata (RFC 9728) on the MCP host and
//   at /api/mcp, authorization server metadata (RFC 8414);
// - dynamic client registration (RFC 7591) and what it refuses;
// - the authorization code flow for a public client (PKCE, no secret, `iss`,
//   `resource`), and a confidential one over HTTP Basic;
// - the MCP route: keyless tools need nothing, sign-in tools answer 401/403
//   for Claude and other spec clients and a `_meta` challenge for ChatGPT;
// - the dynamic-code tools with a token: create (happy path, plan limit,
//   unsafe destination), list, stats, change destination.
// Tables live in memory (tests/support/fake-db.ts). Mocked: the session,
// rate limits, the plan (Free), custom domains, URL screening (refuses
// malware.example), events and scan analytics. Nothing touches a network.
import { createHash } from "node:crypto";
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  rateLimited: false,
  analyticsCalls: [] as { codeId: string; days: number }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.userId
          ? {
              user: { id: state.userId, email: `${state.userId}@qrdx.test` },
              session: {
                id: `session_${state.userId}`,
                createdAt: new Date(Date.now() - 60_000),
                activeOrganizationId: null,
              },
            }
          : null,
    },
  },
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 1000,
      remaining: state.rateLimited ? 0 : 999,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "free",
  getPlan: async () => "free",
}));
vi.mock(
  "@/app/(app)/dashboard/domains/_lib/domains",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/app/(app)/dashboard/domains/_lib/domains")
    >()),
    getDomainRefs: async () => new Map(),
    assertBindableDomains: async () => {},
  }),
);
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
// Link screening: Web Risk would flag this host; everything else passes.
vi.mock("@/lib/safety/destinations", async () => {
  const { HttpError } = await import("@/lib/error-response");
  const unsafe = (url: string) => new URL(url).hostname === "malware.example";
  return {
    screenNewCodes: async (
      _scope: unknown,
      rows: { destinationUrl: string }[],
    ) => {
      const blocked = rows.find((row) => unsafe(row.destinationUrl));
      if (blocked) {
        throw new HttpError(
          422,
          "UNSAFE_DESTINATION",
          "Google Web Risk flags the link to malware.example as malware, so it can't be used.",
        );
      }
      return rows;
    },
    screenUrlChange: async () => false,
  };
});
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/scans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scans")>()),
  getScanAnalytics: async (codeId: string, days: number) => {
    state.analyticsCalls.push({ codeId, days });
    return {
      from: new Date("2026-10-02T00:00:00Z"),
      days,
      total: 42,
      unique: 30,
      interval: "day",
      series: [{ date: "2026-10-31", count: 42 }],
      countries: [
        { value: "DE", count: 30 },
        { value: "FR", count: 12 },
      ],
      cities: [],
      devices: [{ value: "mobile", count: 40 }],
      os: [{ value: "iOS", count: 25 }],
      browsers: [],
      referrers: [],
      sources: { qr: 42, nfc: 0 },
    };
  },
}));

const register = await import("@/app/api/oauth/register/route");
const authorize = await import("@/app/api/oauth/authorize/route");
const token = await import("@/app/api/oauth/token/route");
const mcp = await import("@/app/api/mcp/route");
const prmRoot = await import(
  "@/app/.well-known/oauth-protected-resource/route"
);
const prmMcp = await import(
  "@/app/.well-known/oauth-protected-resource/mcp/route"
);
const prmApi = await import(
  "@/app/.well-known/oauth-protected-resource/api/mcp/route"
);
const asMetadata = await import(
  "@/app/.well-known/oauth-authorization-server/route"
);
const { baseUrl } = await import("@/lib/metadata");
const { SIGN_IN_MCP_TOOLS } = await import("@/app/api/mcp/auth");

const ORIGIN = "http://localhost:3000";
const ISSUER = baseUrl.origin;
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = `${ORIGIN}/api/mcp`;
// RFC 7636 appendix B
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ALICE = "u_alice";
const ALICE_WORKSPACE = ownWorkspaceId(ALICE);

function seed() {
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("oauthApp", "clientId");
  fakeDb.seed("user", [
    {
      id: ALICE,
      name: "Alice",
      email: "alice@example.com",
      image: null,
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("organization", [
    {
      id: ALICE_WORKSPACE,
      name: "Alice",
      slug: "alice",
      logo: null,
      createdAt: new Date(0),
    },
  ]);
  fakeDb.seed("member", [
    {
      id: "m_alice",
      organizationId: ALICE_WORKSPACE,
      userId: ALICE,
      role: "owner",
      createdAt: new Date(0),
    },
  ]);
  // Alice's browser confirmed it's her in the last 10 minutes.
  fakeDb.seed("verification", [
    {
      id: "confirmed_alice",
      identifier: `qrdx-confirmed-session_${ALICE}`,
      value: ALICE,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

beforeEach(() => {
  state.userId = null;
  state.rateLimited = false;
  state.analyticsCalls = [];
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function postRegister(
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return register.POST(
    new Request(new URL("/api/oauth/register", ORIGIN), {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const CLAUDE = {
  client_name: "Claude",
  redirect_uris: [CLAUDE_CALLBACK],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
};

async function registerClient(metadata: Record<string, unknown> = CLAUDE) {
  const response = await postRegister(metadata);
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body as {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
    scope: string;
  };
}

function authorizeQuery(clientId: string, extra: Record<string, string> = {}) {
  return {
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    scope: "codes:read codes:write",
    state: "st4te",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
    ...extra,
  };
}

function getAuthorize(query: Record<string, string>) {
  const url = new URL("/api/oauth/authorize", ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return authorize.GET(new NextRequest(url));
}

/** Alice signs in and approves the consent screen; the redirect. */
async function approve(query: Record<string, string>): Promise<URL> {
  state.userId = ALICE;
  const response = await authorize.POST(
    new NextRequest(new URL("/api/oauth/authorize", ORIGIN), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
      },
      body: new URLSearchParams({ ...query, decision: "allow" }),
    }),
  );
  expect(response.status).toBe(303);
  return new URL(response.headers.get("location") as string);
}

function postToken(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return token.POST(
    new NextRequest(new URL("/api/oauth/token", ORIGIN), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams(fields),
    }),
  );
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
}

/** Registers Claude, has Alice approve it and exchanges the code. */
async function signInClaude(): Promise<{ clientId: string; tokens: Tokens }> {
  const { client_id: clientId } = await registerClient();
  const redirect = await approve(authorizeQuery(clientId));
  const response = await postToken({
    grant_type: "authorization_code",
    client_id: clientId,
    code: redirect.searchParams.get("code") as string,
    redirect_uri: CLAUDE_CALLBACK,
    code_verifier: VERIFIER,
    resource: RESOURCE,
  });
  const tokens = (await response.json()) as Tokens;
  expect(response.status, JSON.stringify(tokens)).toBe(200);
  state.userId = null;
  return { clientId, tokens };
}

let rpcId = 0;
async function rpc(
  method: string,
  params: Record<string, unknown>,
  {
    authorization,
    url = `${ORIGIN}/api/mcp`,
  }: { authorization?: string; url?: string } = {},
) {
  const response = await mcp.POST(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return {
    response,
    message: JSON.parse(json || "{}") as {
      result?: {
        isError?: boolean;
        content: { type: string; text?: string; data?: string }[];
        structuredContent?: Record<string, unknown>;
        _meta?: Record<string, unknown>;
        tools?: { name: string; _meta?: Record<string, unknown> }[];
      };
      error?: { code: number; message: string };
      error_description?: string;
    },
  };
}

const callTool = (
  name: string,
  args: Record<string, unknown>,
  options: { authorization?: string; url?: string; meta?: object } = {},
) =>
  rpc(
    "tools/call",
    {
      name,
      arguments: args,
      ...(options.meta ? { _meta: options.meta } : {}),
    },
    options,
  );

// ─── Discovery ──────────────────────────────────────────────────────────────

describe("discovery documents", () => {
  it("describe https://mcp.qrdx.dev/mcp on the MCP host, path-suffixed and at the root", async () => {
    for (const response of [
      prmMcp.GET(
        new Request(
          "https://mcp.qrdx.dev/.well-known/oauth-protected-resource/mcp",
        ),
      ),
      prmRoot.GET(
        new Request(
          "https://mcp.qrdx.dev/.well-known/oauth-protected-resource",
        ),
      ),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(await response.json()).toEqual({
        resource: "https://mcp.qrdx.dev/mcp",
        authorization_servers: [ISSUER],
        scopes_supported: ["codes:read", "codes:write"],
        bearer_methods_supported: ["header"],
        resource_name: "QRdx",
        resource_documentation: `${ISSUER}/docs/developers/mcp`,
      });
    }
  });

  it("describe <origin>/api/mcp elsewhere, and /mcp is no server there", async () => {
    const api = prmApi.GET(
      new Request(
        "https://qrdx.dev/.well-known/oauth-protected-resource/api/mcp",
      ),
    );
    expect((await api.json()).resource).toBe("https://qrdx.dev/api/mcp");
    const local = prmRoot.GET(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource`),
    );
    expect((await local.json()).resource).toBe(RESOURCE);
    const page = prmMcp.GET(
      new Request("https://qrdx.dev/.well-known/oauth-protected-resource/mcp"),
    );
    expect(page.status).toBe(404);
  });

  it("publish the authorization server: S256, registration, iss, no client metadata documents", async () => {
    const response = asMetadata.GET(
      new Request(`${ORIGIN}/.well-known/oauth-authorization-server`),
    );
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      registration_endpoint: `${ISSUER}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    });
    expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    expect(metadata.client_id_metadata_document_supported).toBeUndefined();
    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(["codes:read", "codes:write"]),
    );
  });
});

// ─── Registration ───────────────────────────────────────────────────────────

describe("POST /api/oauth/register", () => {
  it("registers a public client: no secret, PKCE, never first-party", async () => {
    const client = await registerClient();
    expect(client).toMatchObject({
      client_name: "Claude",
      redirect_uris: [CLAUDE_CALLBACK],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "codes:read codes:write",
    });
    expect(client.client_secret).toBeUndefined();
    const row = fakeDb.find("oauthApp", { clientId: client.client_id });
    expect(row).toMatchObject({
      registrationType: "dynamic",
      tokenEndpointAuthMethod: "none",
      pkceRequired: true,
      ownerUserId: null,
      organizationId: null,
      verified: false,
      logoUrl: null,
      websiteUrl: null,
    });
  });

  it("gives a client that asks for client_secret_basic (the default) a secret", async () => {
    const { token_endpoint_auth_method: _method, ...rest } = CLAUDE;
    const client = await registerClient({
      ...rest,
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      client_name: "ChatGPT",
    });
    expect(client.client_secret).toMatch(/^qrdx_secret_/);
    const row = fakeDb.find("oauthApp", { clientId: client.client_id });
    expect(row?.clientSecretHash).not.toBe(client.client_secret);
  });

  it("keeps the name plain, and names a nameless client by its host", async () => {
    const plain = await registerClient({
      ...CLAUDE,
      client_name: "Cur‮sor\u0000  Agent",
    });
    expect((plain as { client_name?: string }).client_name).toBe(
      "Cursor Agent",
    );
    const { client_name: _name, ...nameless } = CLAUDE;
    const named = await registerClient(nameless);
    expect((named as { client_name?: string }).client_name).toBe("claude.ai");
  });

  it.each([
    ["no redirect URIs", { redirect_uris: [] }, "invalid_redirect_uri"],
    [
      "plain http off loopback",
      { redirect_uris: ["http://evil.example/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "a custom scheme",
      { redirect_uris: ["cursor://anysphere.cursor/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "javascript:",
      { redirect_uris: ["javascript:alert(1)"] },
      "invalid_redirect_uri",
    ],
    [
      "a fragment",
      { redirect_uris: ["https://app.example/cb#x"] },
      "invalid_redirect_uri",
    ],
    [
      "a wildcard",
      { redirect_uris: ["https://*.example.com/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "credentials in the URI",
      { redirect_uris: ["https://user:pass@app.example/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "a QRdx host, whose redirects could pass the code on",
      { redirect_uris: ["https://qrdx.dev/q/abc"] },
      "invalid_redirect_uri",
    ],
    [
      "another QRdx subdomain",
      { redirect_uris: ["https://mcp.qrdx.dev/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "six redirect URIs",
      {
        redirect_uris: Array.from(
          { length: 6 },
          (_, index) => `https://app.example/cb${index}`,
        ),
      },
      "invalid_redirect_uri",
    ],
    [
      "an oversized URI",
      { redirect_uris: [`https://app.example/${"a".repeat(2100)}`] },
      "invalid_redirect_uri",
    ],
    [
      "an implicit grant",
      { grant_types: ["implicit"] },
      "invalid_client_metadata",
    ],
    [
      "client credentials",
      { grant_types: ["authorization_code", "client_credentials"] },
      "invalid_client_metadata",
    ],
    [
      "a token response type",
      { response_types: ["token"] },
      "invalid_client_metadata",
    ],
    [
      "private_key_jwt",
      { token_endpoint_auth_method: "private_key_jwt" },
      "invalid_client_metadata",
    ],
    [
      "a name over 60 characters",
      { client_name: "x".repeat(61) },
      "invalid_client_metadata",
    ],
    [
      "a name that claims to be QRdx",
      { client_name: "QRdx Official" },
      "invalid_client_metadata",
    ],
  ])("refuses %s", async (_label, change, error) => {
    const response = await postRegister({ ...CLAUDE, ...change });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(fakeDb.rows("oauthApp")).toHaveLength(0);
  });

  it("refuses bodies that aren't a JSON object, or are too big", async () => {
    for (const response of [
      await postRegister("redirect_uris=https://a.example/cb", {
        "content-type": "application/x-www-form-urlencoded",
      }),
      await postRegister("[1,2]"),
      await postRegister("{nope"),
      await postRegister({ ...CLAUDE, padding: "x".repeat(17 * 1024) }),
    ]) {
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_client_metadata");
    }
    expect(fakeDb.rows("oauthApp")).toHaveLength(0);
  });

  it("answers 429 over the per-IP limit", async () => {
    state.rateLimited = true;
    const response = await postRegister(CLAUDE);
    expect(response.status).toBe(429);
    expect(fakeDb.rows("oauthApp")).toHaveLength(0);
  });

  it("only keeps the scopes the MCP tools use", async () => {
    const client = await registerClient({
      ...CLAUDE,
      scope: "codes:write profile:read openid",
    });
    expect(client.scope).toBe("codes:write");
  });
});

// ─── Authorization and tokens ───────────────────────────────────────────────

describe("signing in a registered client", () => {
  it("always shows the consent screen, then sends the code back with iss", async () => {
    const { client_id: clientId } = await registerClient();
    const query = authorizeQuery(clientId);

    const signedOut = await getAuthorize(query);
    expect(signedOut.status).toBe(302);
    const consent = new URL(signedOut.headers.get("location") as string);
    expect(consent.pathname).toBe("/oauth/authorize");
    expect(consent.searchParams.get("resource")).toBe(RESOURCE);

    const redirect = await approve(query);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(CLAUDE_CALLBACK);
    expect(redirect.searchParams.get("state")).toBe("st4te");
    expect(redirect.searchParams.get("iss")).toBe(ISSUER);
    const code = redirect.searchParams.get("code") as string;

    const response = await postToken({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: CLAUDE_CALLBACK,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const tokens = (await response.json()) as Tokens;
    expect(tokens.scope).toBe("codes:read codes:write");

    // Approved before, and still asked: anyone can register a client.
    state.userId = ALICE;
    const again = await getAuthorize(query);
    expect(new URL(again.headers.get("location") as string).pathname).toBe(
      "/oauth/authorize",
    );
  });

  it("refuses a resource that isn't this server's, at both endpoints", async () => {
    const { client_id: clientId } = await registerClient();
    const response = await getAuthorize(
      authorizeQuery(clientId, { resource: "https://evil.example/mcp" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_target");

    const redirect = await approve(authorizeQuery(clientId));
    const exchange = await postToken({
      grant_type: "authorization_code",
      client_id: clientId,
      code: redirect.searchParams.get("code") as string,
      redirect_uri: CLAUDE_CALLBACK,
      code_verifier: VERIFIER,
      resource: "https://evil.example/mcp",
    });
    expect(exchange.status).toBe(400);
    expect((await exchange.json()).error).toBe("invalid_target");
  });

  it("refuses an authorization request without PKCE", async () => {
    const { client_id: clientId } = await registerClient();
    const {
      code_challenge: _challenge,
      code_challenge_method: _method,
      ...query
    } = authorizeQuery(clientId);
    const response = await getAuthorize(query);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  it("a public client: no verifier, a wrong one, or a secret don't get a token", async () => {
    const { client_id: clientId } = await registerClient();
    const fresh = async () =>
      (await approve(authorizeQuery(clientId))).searchParams.get(
        "code",
      ) as string;
    const base = {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: CLAUDE_CALLBACK,
    };
    const missing = await postToken({ ...base, code: await fresh() });
    expect((await missing.json()).error).toBe("invalid_request");
    const wrong = await postToken({
      ...base,
      code: await fresh(),
      code_verifier: VERIFIER.replace("d", "e"),
    });
    expect((await wrong.json()).error).toBe("invalid_grant");
    const withSecret = await postToken({
      ...base,
      code: await fresh(),
      code_verifier: VERIFIER,
      client_secret: "qrdx_secret_guess",
    });
    expect(withSecret.status).toBe(401);
    expect((await withSecret.json()).error).toBe("invalid_client");
  });

  it("matches a desktop app's loopback redirect on any port", async () => {
    const { client_id: clientId } = await registerClient({
      ...CLAUDE,
      client_name: "Claude Code",
      redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
    });
    const redirect = await approve(
      authorizeQuery(clientId, {
        redirect_uri: "http://127.0.0.1:53682/callback",
      }),
    );
    expect(redirect.origin).toBe("http://127.0.0.1:53682");
    expect(redirect.searchParams.get("code")).toBeTruthy();
  });

  it("refreshes a public client's token with its client_id alone, once", async () => {
    const { clientId, tokens } = await signInClaude();
    const refresh = () =>
      postToken({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      });
    const first = await refresh();
    expect(first.status).toBe(200);
    const second = await refresh();
    expect((await second.json()).error).toBe("invalid_grant");
  });

  it("a confidential client authenticates with HTTP Basic, one way at a time", async () => {
    const { token_endpoint_auth_method: _method, ...rest } = CLAUDE;
    const client = await registerClient(rest);
    const secret = client.client_secret as string;
    const basic = `Basic ${Buffer.from(
      `${encodeURIComponent(client.client_id)}:${encodeURIComponent(secret)}`,
    ).toString("base64")}`;
    const code = async () =>
      (await approve(authorizeQuery(client.client_id))).searchParams.get(
        "code",
      ) as string;
    const fields = async () => ({
      grant_type: "authorization_code",
      code: await code(),
      redirect_uri: CLAUDE_CALLBACK,
      code_verifier: VERIFIER,
    });
    const ok = await postToken(await fields(), { authorization: basic });
    expect(ok.status).toBe(200);
    const both = await postToken(
      { ...(await fields()), client_secret: secret },
      { authorization: basic },
    );
    expect((await both.json()).error).toBe("invalid_request");
    const wrong = await postToken(await fields(), {
      authorization: `Basic ${Buffer.from(`${client.client_id}:nope`).toString("base64")}`,
    });
    expect(wrong.status).toBe(401);
  });
});

// ─── The MCP route ──────────────────────────────────────────────────────────

describe("the MCP server with sign-in", () => {
  it("lists the sign-in tools to everyone, declaring oauth2 for them and noauth for the rest", async () => {
    const { message } = await rpc("tools/list", {});
    const tools = message.result?.tools ?? [];
    for (const name of SIGN_IN_MCP_TOOLS) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?._meta?.securitySchemes, name).toEqual([
        { type: "oauth2", scopes: ["codes:read", "codes:write"] },
      ]);
    }
    const generate = tools.find((item) => item.name === "generate_qr_code");
    expect(generate?._meta?.securitySchemes).toEqual([{ type: "noauth" }]);
  });

  it("keyless tools need no token, and an expired one doesn't get in their way", async () => {
    for (const authorization of [undefined, "Bearer expired-or-made-up"]) {
      const { response, message } = await callTool(
        "generate_qr_code",
        { data: "https://example.com/menu" },
        { authorization },
      );
      expect(response.status).toBe(200);
      expect(message.result?.isError).toBeFalsy();
      // One line says a dynamic version exists.
      expect(message.result?.content[0]?.text).toContain(
        "use create_dynamic_code",
      );
    }
  });

  it("answers a sign-in tool without a token with 401 and where to sign in", async () => {
    const { response, message } = await callTool("create_dynamic_code", {
      destinationUrl: "https://example.com/menu",
    });
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(challenge).toContain('scope="codes:read codes:write"');
    expect(challenge).toContain('error="invalid_token"');
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "WWW-Authenticate",
    );
    expect((message as { error?: unknown }).error).toBe("invalid_token");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("points at the MCP host's own metadata on mcp.qrdx.dev", async () => {
    const { response } = await callTool(
      "list_codes",
      {},
      { url: "https://mcp.qrdx.dev/api/mcp" },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.qrdx.dev/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("refuses a made-up or revoked token with 401 invalid_token", async () => {
    const { tokens } = await signInClaude();
    for (const row of fakeDb.rows("oauthToken")) row.revokedAt = new Date();
    for (const value of ["made-up-token", tokens.access_token]) {
      const { response } = await callTool(
        "list_codes",
        {},
        { authorization: `Bearer ${value}` },
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        'error="invalid_token"',
      );
    }
  });

  it("asks for more scope (403) when a token can't manage codes", async () => {
    const { tokens } = await signInClaude();
    // As if granted for another app's purpose: no codes scope at all.
    for (const row of fakeDb.rows("oauthToken")) row.scopes = ["profile:read"];
    const { response } = await callTool(
      "list_codes",
      {},
      { authorization: `Bearer ${tokens.access_token}` },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"',
    );
    // Read-only grants can list but not write.
    for (const row of fakeDb.rows("oauthToken")) row.scopes = ["codes:read"];
    const read = await callTool(
      "list_codes",
      {},
      { authorization: `Bearer ${tokens.access_token}` },
    );
    expect(read.response.status).toBe(200);
    const write = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com" },
      { authorization: `Bearer ${tokens.access_token}` },
    );
    expect(write.response.status).toBe(403);
  });

  it("gives ChatGPT a tool error with the challenge in _meta instead", async () => {
    const { response, message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com/menu" },
      {
        meta: {
          "openai/subject": "v1/abc",
          "openai/locale": "en-US",
        },
      },
    );
    expect(response.status).toBe(200);
    expect(message.result?.isError).toBe(true);
    const challenges = message.result?._meta?.["mcp/www_authenticate"];
    expect(challenges).toEqual([expect.stringMatching(/^Bearer /)]);
    const [challenge] = challenges as string[];
    expect(challenge).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(challenge).toMatch(/error="[a-z_]+"/);
    expect(challenge).toMatch(/error_description="[^"]+"/);
    expect(message.result?.content[0]?.text).toContain("sign in to QRdx");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("leaves an API key's problems to the tool, in words", async () => {
    const { response, message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com/menu" },
      { authorization: `Bearer qrdx_${"z".repeat(40)}` },
    );
    expect(response.status).toBe(200);
    expect(message.result?.structuredContent).toMatchObject({
      code: "INVALID_TOKEN",
      status: 401,
    });
  });
});

// ─── The dynamic-code tools ─────────────────────────────────────────────────

describe("dynamic codes over MCP", () => {
  const bearer = (tokens: Tokens) => `Bearer ${tokens.access_token}`;

  it("create_dynamic_code makes a code in the person's own workspace, via mcp", async () => {
    const { tokens } = await signInClaude();
    const { response, message } = await callTool(
      "create_dynamic_code",
      {
        destinationUrl: "https://example.com/menu",
        title: "Spring menu",
        style: { fgColor: "#155dfc", bodyPattern: "rounded" },
      },
      { authorization: bearer(tokens) },
    );
    expect(response.status).toBe(200);
    const result = message.result;
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    const [row] = fakeDb.rows("qrCode");
    expect(row).toMatchObject({
      userId: ALICE,
      organizationId: ALICE_WORKSPACE,
      destinationUrl: "https://example.com/menu",
      title: "Spring menu",
      createdVia: "mcp",
    });
    expect((row?.style as Record<string, unknown> | undefined)?.fgColor).toBe(
      "#155dfc",
    );
    const summary = result?.content[0]?.text ?? "";
    expect(summary).toContain(`/q/${row?.slug}`);
    expect(summary).toContain("https://example.com/menu");
    expect(summary).toContain(`/dashboard/alice/codes/${row?.id}`);
    expect(summary).toMatch(/SVG URL: \S+\/v1\/qr\?data=/);
    const details = JSON.parse(result?.content[1]?.text ?? "{}");
    expect(details).toMatchObject({
      id: row?.id,
      title: "Spring menu",
      status: "active",
      scanCount: 0,
    });
    expect(result?.content[2]).toMatchObject({
      type: "image",
      mimeType: "image/png",
    });
    expect(result?._meta?.["dev.qrdx/qr-card"]).toMatchObject({
      encodes: expect.stringContaining("/q/"),
      editor: details.dashboardUrl,
    });
  });

  it("works with an API key too", async () => {
    const key = `qrdx_${"k".repeat(40)}`;
    fakeDb.seed("apiKey", [
      {
        id: "key_alice",
        name: "Alice's key",
        keyHash: createHash("sha256").update(key).digest("hex"),
        start: key.slice(0, 11),
        userId: ALICE,
        organizationId: ALICE_WORKSPACE,
        scopes: ["codes:read", "codes:write"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com/key" },
      { authorization: `Bearer ${key}` },
    );
    expect(message.result?.isError, JSON.stringify(message)).toBeFalsy();
    expect(fakeDb.rows("qrCode")).toHaveLength(1);
  });

  it("stops at the Free plan's active dynamic codes, like the dashboard", async () => {
    const { tokens } = await signInClaude();
    const { getPlanLimits } = await import("@/lib/plans");
    const limit = getPlanLimits("free").dynamicCodes;
    fakeDb.seed(
      "qrCode",
      Array.from({ length: limit }, (_, index) => ({
        id: `code_${index}`,
        userId: ALICE,
        organizationId: ALICE_WORKSPACE,
        slug: `Full${String(index).padStart(3, "0")}`,
        destinationUrl: `https://example.com/${index}`,
      })),
    );
    const { message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com/one-more" },
      { authorization: bearer(tokens) },
    );
    expect(message.result?.isError).toBe(true);
    expect(message.result?.structuredContent).toMatchObject({
      code: "LIMIT_REACHED",
      status: 402,
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(limit);
  });

  it("refuses an unsafe destination, as the REST API does", async () => {
    const { tokens } = await signInClaude();
    const { message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://malware.example/login" },
      { authorization: bearer(tokens) },
    );
    expect(message.result?.isError).toBe(true);
    expect(message.result?.structuredContent).toMatchObject({
      code: "UNSAFE_DESTINATION",
      status: 422,
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("refuses a destination that isn't an http(s) link", async () => {
    const { tokens } = await signInClaude();
    const { message } = await callTool(
      "create_dynamic_code",
      { destinationUrl: "javascript:alert(1)" },
      { authorization: bearer(tokens) },
    );
    expect(message.result?.isError).toBe(true);
    expect(message.result?.structuredContent).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("list_codes, get_code_stats and update_code_destination act on that code", async () => {
    const { tokens } = await signInClaude();
    await callTool(
      "create_dynamic_code",
      { destinationUrl: "https://example.com/menu", title: "Menu" },
      { authorization: bearer(tokens) },
    );
    const [row] = fakeDb.rows("qrCode");
    // Someone else's code never shows.
    fakeDb.seed("qrCode", [
      {
        id: "code_bob",
        userId: "u_bob",
        organizationId: ownWorkspaceId("u_bob"),
        slug: "Bob0001",
        destinationUrl: "https://bob.example",
      },
    ]);

    const list = await callTool(
      "list_codes",
      {},
      { authorization: bearer(tokens) },
    );
    const listed = JSON.parse(list.message.result?.content[1]?.text ?? "{}");
    expect(listed.total).toBe(1);
    expect(listed.codes).toEqual([
      expect.objectContaining({ id: row?.id, title: "Menu" }),
    ]);

    const stats = await callTool(
      "get_code_stats",
      { id: row?.id as string },
      { authorization: bearer(tokens) },
    );
    expect(stats.message.result?.isError).toBeFalsy();
    expect(stats.message.result?.content[0]?.text).toContain("42 scans");
    const body = JSON.parse(stats.message.result?.content[1]?.text ?? "{}");
    expect(body).toMatchObject({
      range: "30d",
      scans: 42,
      uniqueVisitors: 30,
      countries: [
        { value: "DE", count: 30 },
        { value: "FR", count: 12 },
      ],
    });
    expect(body).not.toHaveProperty("preciseLocations");
    expect(state.analyticsCalls).toEqual([{ codeId: row?.id, days: 30 }]);

    const other = await callTool(
      "get_code_stats",
      { id: "code_bob" },
      { authorization: bearer(tokens) },
    );
    expect(other.message.result?.structuredContent).toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    const update = await callTool(
      "update_code_destination",
      { id: row?.id as string, destinationUrl: "https://example.com/winter" },
      { authorization: bearer(tokens) },
    );
    expect(update.message.result?.isError).toBeFalsy();
    expect(update.message.result?.content[0]?.text).toContain(
      "now sends scans to https://example.com/winter",
    );
    expect(fakeDb.find("qrCode", { id: row?.id })?.destinationUrl).toBe(
      "https://example.com/winter",
    );
    const blocked = await callTool(
      "update_code_destination",
      { id: "code_bob", destinationUrl: "https://example.com/hijack" },
      { authorization: bearer(tokens) },
    );
    expect(blocked.message.result?.structuredContent).toMatchObject({
      status: 404,
    });
    expect(fakeDb.find("qrCode", { id: "code_bob" })?.destinationUrl).toBe(
      "https://bob.example",
    );
  });
});

// ─── Where the new account came from ────────────────────────────────────────

describe("a sign-up that starts in an MCP client's sign-in", () => {
  it("counts as the MCP channel, with the client's family as its source", async () => {
    const { mcpSignUpTags } = await import("@/lib/oauth-apps/mcp-sign-up");
    const { acquisitionChannel } = await import("@/lib/analytics/channel");
    const { cleanLanding } = await import("@/lib/analytics/landing");
    expect(mcpSignUpTags({ dynamic: true, name: "ChatGPT" })).toEqual({
      ref: "mcp",
      utm_source: "chatgpt",
    });
    expect(mcpSignUpTags({ dynamic: true, name: "Claude Code" })).toEqual({
      ref: "mcp",
      utm_source: "claude",
    });
    // A name outside the known families: the ref alone, never the name.
    expect(mcpSignUpTags({ dynamic: true, name: "My Agent 3000" })).toEqual({
      ref: "mcp",
    });
    // An app made in Settings → Developers adds nothing.
    expect(mcpSignUpTags({ dynamic: false, name: "Claude" })).toBeUndefined();

    // What the consent page's sign-in sends: the visit (the popup's
    // referrer) with the tags on top, cleaned again on the server.
    const landing = cleanLanding(
      {
        referrer_host: "chatgpt.com",
        landing_path: "/oauth/authorize",
        signup_path: "/oauth/authorize",
        ...mcpSignUpTags({ dynamic: true, name: "ChatGPT" }),
      },
      "qrdx.dev",
    );
    expect(landing).toMatchObject({ ref: "mcp", utm_source: "chatgpt" });
    expect(acquisitionChannel(landing, { affiliate: false })).toBe("mcp");
  });
});
