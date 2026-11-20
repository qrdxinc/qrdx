// A code's path aliases over the REST API (/v1/codes/{id}/aliases), called
// through the real route handlers with real API keys: list, add and remove
// with a key that may write, every refusal of the edit dialog with its
// reason and sentence (checked against actions/path-aliases.ts itself), the
// plan, domain and role checks, and a deployment that hasn't applied
// manual-sql/2026-11-18-path-aliases.sql yet (a 503, never a 500).
//
// Real: the route handlers, Bearer parsing, lib/api-keys, resolveApiCaller,
// lib/code-path-aliases (shared with the dialog), assertBindableDomains and
// lib/path-alias-store. Mocked: the database (in-memory tables,
// tests/support/fake-db), the rate limiter, the plan lookup and the
// dialog's browser session.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  /** The owner's browser session (for the dialog's actions) */
  signedIn: true,
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
  // No browser session in these requests: only the Bearer key counts.
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
// The edit dialog's actions, signed in as the workspace's owner, to compare
// their answers with the API's.
vi.mock("@/lib/scope", async (importOriginal) => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    ...(await importOriginal<typeof import("@/lib/scope")>()),
    getActiveScope: async () => {
      if (!state.signedIn) throw new UnauthorizedError();
      return { userId: "u_owner", organizationId: "org_acme", role: "owner" };
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const aliases = await import("@/app/api/v1/codes/[id]/aliases/route");
const oneAlias = await import(
  "@/app/api/v1/codes/[id]/aliases/[aliasId]/route"
);
const dialog = await import("@/actions/path-aliases");
const { PATH_ALIAS_MESSAGES } = await import("@/lib/path-aliases");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-20T12:00:00Z");
const FULL = ["themes:read", "profile:read", "codes:read", "codes:write"];
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const keyFor = (label: string) => `qrdx_${label.padEnd(40, "0").slice(0, 40)}`;

const ROLES = ["owner", "admin", "member", "billing", "viewer"] as const;
type Role = (typeof ROLES)[number];
const KEY: Record<Role | "readOnly", string> = {
  owner: keyFor("ownerKey"),
  admin: keyFor("adminKey"),
  member: keyFor("memberKey"),
  billing: keyFor("billingKey"),
  viewer: keyFor("viewerKey"),
  readOnly: keyFor("readOnlyKey"),
};
const USER = (role: Role) => `u_${role}`;

function apiKey(id: string, role: Role, key: string, scopes: string[]) {
  return {
    id,
    name: id,
    keyHash: sha256(key),
    start: key.slice(0, 11),
    userId: USER(role),
    organizationId: "org_acme",
    scopes,
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function code(id: string, slug: string, overrides: Record<string, unknown>) {
  return {
    id,
    userId: USER("owner"),
    organizationId: "org_acme",
    slug,
    destinationUrl: `https://example.com/${id}`,
    domainId: "dom_acme",
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  state.plan = "pro";
  state.signedIn = true;
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
    createdAt: NOW,
    updatedAt: NOW,
  }));
  fakeDb.unique("apiKey", "keyHash");
  fakeDb.unique("linkPathAlias", "domainId", "path");
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed(
    "user",
    ROLES.map((role) => ({
      id: USER(role),
      name: role,
      email: `${role}@example.com`,
      banned: false,
      banExpires: null,
    })),
  );
  fakeDb.seed(
    "member",
    ROLES.map((role) => ({
      id: `m_${role}`,
      organizationId: "org_acme",
      userId: USER(role),
      role,
      createdAt: NOW,
    })),
  );
  fakeDb.seed("apiKey", [
    ...ROLES.map((role) => apiKey(`key_${role}`, role, KEY[role], FULL)),
    apiKey("key_read", "owner", KEY.readOnly, ["codes:read"]),
  ]);
  fakeDb.seed("customDomain", [
    {
      id: "dom_acme",
      userId: USER("owner"),
      organizationId: "org_acme",
      hostname: "qr.acme.com",
      verified: true,
    },
    {
      id: "dom_pending",
      userId: USER("owner"),
      organizationId: "org_acme",
      hostname: "qr.pending.com",
      verified: false,
    },
    {
      id: "dom_bob",
      userId: "u_bob",
      organizationId: "org_bob",
      hostname: "qr.bob.com",
      verified: true,
    },
  ]);
  fakeDb.seed("qrCode", [
    code("code_menu", "Acme001", {}),
    code("code_other", "Acme002", {}),
    code("code_plain", "Acme003", { domainId: null }),
    code("code_pending", "Acme004", { domainId: "dom_pending" }),
    code("code_bob", "BobCode", {
      userId: "u_bob",
      organizationId: "org_bob",
      domainId: "dom_bob",
    }),
  ]);
});

function request(method: string, path: string, token: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const list = (codeId: string, token = KEY.owner) =>
  aliases.GET(request("GET", `/api/v1/codes/${codeId}/aliases`, token), {
    params: Promise.resolve({ id: codeId }),
  });
const add = (codeId: string, path: unknown, token = KEY.owner) =>
  aliases.POST(
    request("POST", `/api/v1/codes/${codeId}/aliases`, token, { path }),
    { params: Promise.resolve({ id: codeId }) },
  );
const remove = (codeId: string, aliasId: string, token = KEY.owner) =>
  oneAlias.DELETE(
    request("DELETE", `/api/v1/codes/${codeId}/aliases/${aliasId}`, token),
    { params: Promise.resolve({ id: codeId, aliasId }) },
  );

interface ErrorBody {
  code: string;
  message: string;
  status: number;
  data?: { reason?: string };
}
const errorOf = async (response: Response) =>
  (await response.json()) as ErrorBody;
const aliasRows = () => fakeDb.rows("linkPathAlias");

describe("path aliases over the API", () => {
  it("adds, lists and removes a code's aliases with a key that may write", async () => {
    const added = await add("code_menu", "/r/NBDX");
    expect(added.status).toBe(201);
    expect(added.headers.get("cache-control")).toBe("no-store");
    const { data: alias } = (await added.json()) as {
      data: { id: string; path: string; url: string; createdAt: string };
    };
    expect(alias).toEqual({
      id: expect.any(String),
      path: "/r/NBDX",
      url: "https://qr.acme.com/r/NBDX",
      createdAt: expect.any(String),
    });

    // The whole old link, on the code's domain, as the dialog takes it: the
    // path the code already has gives its alias back, with a 200.
    const again = await add("code_menu", "https://qr.acme.com/r/NBDX/?utm=x");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ data: alias });
    expect(aliasRows()).toHaveLength(1);

    const listed = await list("code_menu");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ data: [alias] });

    const removed = await remove("code_menu", alias.id);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      data: { id: alias.id, deleted: true },
    });
    expect(aliasRows()).toHaveLength(0);
    expect(await (await list("code_menu")).json()).toEqual({ data: [] });

    const gone = await remove("code_menu", alias.id);
    expect(gone.status).toBe(404);
    expect(await errorOf(gone)).toMatchObject({
      code: "NOT_FOUND",
      message: "Path alias not found",
    });
  });

  it("lets owners, admins and members add, and anyone in the workspace list", async () => {
    for (const [role, path] of [
      ["owner", "/r/one"],
      ["admin", "/r/two"],
      ["member", "/r/three"],
    ] as const) {
      expect((await add("code_menu", path, KEY[role])).status, role).toBe(201);
    }
    for (const role of ROLES) {
      const response = await list("code_menu", KEY[role]);
      expect(response.status, role).toBe(200);
      expect(
        ((await response.json()) as { data: unknown[] }).data,
      ).toHaveLength(3);
    }
  });
});

describe("refusals, with the edit dialog's reasons", () => {
  beforeEach(async () => {
    expect((await add("code_other", "/r/taken")).status).toBe(201);
  });

  const cases: [path: string, status: number, code: string, reason: string][] =
    [
      ["", 400, "INVALID_PATH_ALIAS", "empty"],
      [`/r/${"a".repeat(200)}`, 400, "INVALID_PATH_ALIAS", "length"],
      ["/a/b/c/d/e/f/g/h/i", 400, "INVALID_PATH_ALIAS", "segments"],
      ["/r//abc", 400, "INVALID_PATH_ALIAS", "characters"],
      ["/r/.env", 400, "INVALID_PATH_ALIAS", "characters"],
      ["spring-menu", 400, "INVALID_PATH_ALIAS", "backHalf"],
      ["/api/x", 400, "INVALID_PATH_ALIAS", "reserved"],
      ["/STATS/abc", 400, "INVALID_PATH_ALIAS", "reserved"],
      ["https://qr.other.com/r/abc", 400, "INVALID_PATH_ALIAS", "otherDomain"],
      ["/r/taken", 409, "PATH_ALIAS_TAKEN", "taken"],
      ["/p/Acme002", 409, "PATH_ALIAS_TAKEN", "hostedPage"],
    ];

  for (const [path, status, code, reason] of cases) {
    it(`refuses ${JSON.stringify(path)} as ${reason}, as the dialog does`, async () => {
      const before = JSON.stringify(aliasRows());
      const response = await add("code_menu", path);
      expect(response.status).toBe(status);
      const body = await errorOf(response);
      expect(body).toMatchObject({
        code,
        status,
        message:
          PATH_ALIAS_MESSAGES[reason as keyof typeof PATH_ALIAS_MESSAGES],
        data: { reason },
      });

      // The dashboard refuses the same path for the same reason, in the same words.
      const fromDialog = await dialog.addPathAlias({
        codeId: "code_menu",
        path,
      });
      expect(fromDialog).toEqual({
        success: false,
        error: { code: reason, message: body.message },
      });
      expect(JSON.stringify(aliasRows())).toBe(before);
    });
  }

  it("stops at the per-code limit, with the dialog's sentence", async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect((await add("code_menu", `/r/${n}`)).status).toBe(201);
    }
    const response = await add("code_menu", "/r/6");
    expect(response.status).toBe(409);
    const body = await errorOf(response);
    expect(body).toMatchObject({
      code: "PATH_ALIAS_LIMIT",
      message: "A code can have up to 5 path aliases.",
    });
    expect(
      await dialog.addPathAlias({ codeId: "code_menu", path: "/r/6" }),
    ).toEqual({
      success: false,
      error: { code: "limit", message: body.message },
    });
    expect(aliasRows()).toHaveLength(6);
  });

  it("takes only JSON with a string path", async () => {
    expect((await add("code_menu", 42)).status).toBe(400);
    const plain = await aliases.POST(
      new NextRequest(new URL("/api/v1/codes/code_menu/aliases", ORIGIN), {
        method: "POST",
        headers: { authorization: `Bearer ${KEY.owner}` },
        body: "/r/abc",
      }),
      { params: Promise.resolve({ id: "code_menu" }) },
    );
    expect(plain.status).toBe(415);
    expect(aliasRows()).toHaveLength(1);
  });
});

describe("the code's domain and the plan", () => {
  it("is only for codes on a custom domain", async () => {
    for (const response of [
      await list("code_plain"),
      await add("code_plain", "/r/abc"),
    ]) {
      expect(response.status).toBe(409);
      expect(await errorOf(response)).toMatchObject({
        code: "NO_CUSTOM_DOMAIN",
        message: expect.stringMatching(
          /^Path aliases are for codes on a custom domain\./,
        ),
      });
    }
    expect(await dialog.getPathAliases("code_plain")).toMatchObject({
      success: false,
      error: { code: "noDomain" },
    });
  });

  it("needs the domain verified", async () => {
    const response = await add("code_pending", "/r/abc");
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body).toMatchObject({
      code: "DOMAIN_NOT_VERIFIED",
      message:
        "Verify qr.pending.com on the Domains page before using it for codes.",
    });
    expect(
      await dialog.addPathAlias({ codeId: "code_pending", path: "/r/abc" }),
    ).toEqual({
      success: false,
      error: { code: "domain", message: body.message },
    });
    expect(aliasRows()).toHaveLength(0);
  });

  it("needs custom domains on the plan", async () => {
    state.plan = "free";
    const response = await add("code_menu", "/r/abc");
    expect(response.status).toBe(402);
    const body = await errorOf(response);
    expect(body.code).toBe("PLAN_REQUIRED");
    expect(
      await dialog.addPathAlias({ codeId: "code_menu", path: "/r/abc" }),
    ).toEqual({
      success: false,
      error: { code: "domain", message: body.message },
    });
    expect(aliasRows()).toHaveLength(0);
  });
});

describe("roles, scopes and workspaces", () => {
  it("refuses adding and removing with a viewer's or a billing member's key", async () => {
    expect((await add("code_menu", "/r/keep")).status).toBe(201);
    const [kept] = aliasRows();
    for (const role of ["viewer", "billing"] as const) {
      const adding = await add("code_menu", "/r/abc", KEY[role]);
      expect(adding.status, role).toBe(403);
      expect((await errorOf(adding)).code).toBe("FORBIDDEN");
      const removing = await remove("code_menu", kept?.id as string, KEY[role]);
      expect(removing.status, role).toBe(403);
    }
    expect(aliasRows()).toMatchObject([{ path: "/r/keep" }]);
  });

  it("refuses writes with a key that has only codes:read", async () => {
    const response = await add("code_menu", "/r/abc", KEY.readOnly);
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("INSUFFICIENT_SCOPE");
    expect((await list("code_menu", KEY.readOnly)).status).toBe(200);
    expect(aliasRows()).toHaveLength(0);
  });

  it("refuses requests without a key or a session", async () => {
    state.signedIn = false;
    const response = await aliases.GET(
      new NextRequest(new URL("/api/v1/codes/code_menu/aliases", ORIGIN)),
      { params: Promise.resolve({ id: "code_menu" }) },
    );
    expect(response.status).toBe(401);
  });

  it("never reads or changes another workspace's code or its aliases", async () => {
    fakeDb.seed("linkPathAlias", [
      {
        id: "pa_bob",
        domainId: "dom_bob",
        qrCodeId: "code_bob",
        path: "/r/bob",
        createdAt: NOW,
      },
    ]);
    for (const response of [
      await list("code_bob"),
      await add("code_bob", "/r/abc"),
      await remove("code_bob", "pa_bob"),
    ]) {
      expect(response.status).toBe(404);
      expect(await errorOf(response)).toMatchObject({
        code: "NOT_FOUND",
        message: "QR code not found",
      });
    }
    // Through one of its own codes, another code's alias isn't there.
    const response = await remove("code_menu", "pa_bob");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("Path alias not found");
    expect(aliasRows()).toMatchObject([{ id: "pa_bob" }]);
  });
});

describe("a deployment without the alias table", () => {
  it("answers 503 with the dialog's sentence, never a 500", async () => {
    fakeDb.missing("linkPathAlias");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const response of [
      await list("code_menu"),
      await add("code_menu", "/r/abc"),
      await remove("code_menu", "pa_any"),
    ]) {
      expect(response.status).toBe(503);
      expect(await errorOf(response)).toMatchObject({
        code: "PATH_ALIASES_UNAVAILABLE",
        message: "Path aliases aren't available on this server yet.",
      });
    }
    expect(
      await dialog.addPathAlias({ codeId: "code_menu", path: "/r/abc" }),
    ).toEqual({
      success: false,
      error: {
        code: "unavailable",
        message: "Path aliases aren't available on this server yet.",
      },
    });
  });
});
