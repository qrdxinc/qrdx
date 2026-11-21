// A code's path aliases in its edit dialog (actions/path-aliases.ts): the
// owner lists, adds and removes the old paths another provider printed on
// the code's custom domain, only for codes in their workspace, on a
// verified domain, with custom domains on the plan, and with a clear answer
// before the link_path_alias table exists. In memory.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  role: "owner" as "owner" | "viewer",
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
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
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
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scope")>()),
  getActiveScope: async () => ({
    userId: "u_ana",
    organizationId: null,
    role: state.role,
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const actions = await import("@/actions/path-aliases");

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u_ana",
    organizationId: null,
    slug: `slug-${id}`,
    slugScope: "",
    kind: "redirect",
    destinationUrl: "https://cafe.example/menu",
    domainId: "dom_ana",
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    scanCount: 0,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("linkPathAlias", "domainId", "path");
  state.plan = "pro";
  state.role = "owner";
  fakeDb.seed("customDomain", [
    { id: "dom_ana", userId: "u_ana", hostname: "qr.ana.com", verified: true },
    {
      id: "dom_new",
      userId: "u_ana",
      hostname: "qr.pending.com",
      verified: false,
    },
  ]);
  fakeDb.seed("qrCode", [
    code("code_menu"),
    code("code_other"),
    code("code_plain", { domainId: null }),
    code("code_pending", { domainId: "dom_new" }),
    code("code_someone", {
      userId: "u_bob",
      organizationId: "org_bob",
      domainId: "dom_ana",
    }),
  ]);
});

const add = (codeId: string, path: string) =>
  actions.addPathAlias({ codeId, path });

describe("path aliases in the edit dialog", () => {
  it("adds, lists and removes a code's aliases", async () => {
    const added = await add("code_menu", "https://qr.ana.com/r/NBDX?utm=x");
    expect(added).toMatchObject({ success: true, data: { path: "/r/NBDX" } });

    const listed = await actions.getPathAliases("code_menu");
    expect(listed).toMatchObject({
      success: true,
      data: {
        domain: { hostname: "qr.ana.com", verified: true },
        aliases: [{ path: "/r/NBDX" }],
        max: 5,
      },
    });

    const id = added.success ? added.data.id : "";
    expect(
      await actions.removePathAlias({ codeId: "code_menu", aliasId: id }),
    ).toEqual({ success: true, data: { id } });
    expect(fakeDb.rows("linkPathAlias")).toHaveLength(0);
  });

  it("explains why a path can't be added", async () => {
    await add("code_other", "/r/taken");
    const cases: [string, string][] = [
      ["/r/taken", "taken"],
      ["spring-menu", "backHalf"],
      ["/api/x", "reserved"],
      ["https://qr.other.com/r/abc", "otherDomain"],
      ["", "empty"],
      [`/p/slug-code_other`, "hostedPage"],
    ];
    for (const [path, problem] of cases) {
      const result = await add("code_menu", path);
      expect(result, path).toMatchObject({
        success: false,
        error: { code: problem },
      });
      expect(result.success ? "" : result.error.message, path).toMatch(/\.$/);
    }
  });

  it("is only for codes on a verified custom domain, with domains on the plan", async () => {
    expect(await actions.getPathAliases("code_plain")).toMatchObject({
      success: false,
      error: { code: "noDomain" },
    });
    expect(await add("code_pending", "/r/abc")).toMatchObject({
      success: false,
      error: { code: "domain", message: expect.stringMatching(/Verify/) },
    });
    state.plan = "free";
    expect(await add("code_menu", "/r/abc")).toMatchObject({
      success: false,
      error: { code: "domain" },
    });
    expect(fakeDb.rows("linkPathAlias")).toHaveLength(0);
  });

  it("never touches another workspace's code, and needs edit rights", async () => {
    expect(await add("code_someone", "/r/abc")).toMatchObject({
      success: false,
      error: { code: "failed", message: "QR code not found" },
    });
    state.role = "viewer";
    expect(await add("code_menu", "/r/abc")).toMatchObject({
      success: false,
      error: { code: "failed" },
    });
    expect(fakeDb.rows("linkPathAlias")).toHaveLength(0);
  });

  it("says aliases aren't available before the table exists", async () => {
    fakeDb.missing("linkPathAlias");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await actions.getPathAliases("code_menu")).toMatchObject({
      success: false,
      error: { code: "unavailable" },
    });
    expect(await add("code_menu", "/r/abc")).toMatchObject({
      success: false,
      error: {
        code: "unavailable",
        message: "Path aliases aren't available on this server yet.",
      },
    });
  });
});
