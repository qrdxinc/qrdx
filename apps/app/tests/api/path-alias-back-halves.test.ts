// A path alias at /p/<x> on a custom domain (lib/path-aliases.ts) answers
// only while no hosted page there has the back-half x, so no code may take
// the back-half x on that domain while another code's live alias holds
// /p/x: not when it's created, edited, or moved onto the domain, nor in an
// import, with a message that says why. Runs the real codes service and
// REST routes against in-memory tables, as apps/docs/content/docs/migrate.mdx
// ("Path aliases") describes it.

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  /** Custom domains of the workspace by id */
  domains: new Map<string, { hostname: string; verified: boolean }>(),
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
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "u_alice" },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
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
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", async () => {
  const { HttpError } = await import("@/lib/error-response");
  return {
    getDomainRefs: async (ids: (string | null)[]) =>
      new Map(
        ids.flatMap((id) => {
          const domain = id ? state.domains.get(id) : undefined;
          return id && domain ? [[id, { id, ...domain }] as const] : [];
        }),
      ),
    assertBindableDomains: async (_scope: unknown, ids: string[]) => {
      for (const id of ids) {
        if (!state.domains.get(id)?.verified) {
          throw new HttpError(404, "NOT_FOUND", "Custom domain not found.");
        }
      }
    },
  };
});
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");
const { checkSlugAvailability } = await import(
  "@/app/(app)/dashboard/codes/_lib/qr-codes"
);
const { aliasBlockedSlugs, findTakenSlugs } = await import("@/lib/slug-claims");

const ORIGIN = "http://localhost:3000";
// Alice's own workspace.
const SCOPE = {
  userId: "u_alice",
  organizationId: ownWorkspaceId("u_alice"),
  role: "owner" as const,
};

/** qr_code's slug indexes; `afterContract` = without the old global slug unique. */
function indexes({ afterContract = false } = {}) {
  if (!afterContract) fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
}

beforeEach(() => {
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
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
  state.plan = "pro";
  state.domains = new Map([
    ["dom_brand", { hostname: "go.brand.com", verified: true }],
    ["dom_other", { hostname: "go.other.com", verified: true }],
  ]);
});

let seq = 0;
function seedCode(overrides: Record<string, unknown>) {
  seq += 1;
  const userId = (overrides.userId as string | undefined) ?? "u_someone";
  fakeDb.seed("qrCode", [
    {
      id: `seed_${seq}`,
      userId,
      // In its creator's own workspace unless a test says otherwise.
      organizationId: ownWorkspaceId(userId),
      destinationUrl: "https://example.com/theirs",
      ...overrides,
    },
  ]);
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN },
  body: JSON.stringify(body),
});
const create = (body: unknown) =>
  list.POST(new NextRequest(new URL("/api/v1/codes", ORIGIN), json(body)));
const patch = (id: string, body: unknown) =>
  one.PATCH(
    new NextRequest(new URL(`/api/v1/codes/${id}`, ORIGIN), {
      ...json(body),
      method: "PATCH",
    }),
    { params: Promise.resolve({ id }) },
  );

const errorOf = async (response: Response) =>
  (await response.json()) as { code: string; message: string };

/** Alias /p/menu-page on go.brand.com, held by a code that's still there. */
function seedAlias({ codeDomainId = "dom_brand" } = {}) {
  seedCode({ id: "code_alias", slug: "AliasHolder", domainId: codeDomainId });
  fakeDb.seed("linkPathAlias", [
    {
      id: "pa_menu",
      domainId: "dom_brand",
      qrCodeId: "code_alias",
      path: "/p/menu-page",
      createdAt: new Date(),
    },
  ]);
}

const ALIAS_MESSAGE = /\/p\/menu-page is another code's path alias/;

describe("back-halves on a domain with /p/ path aliases", () => {
  // The indexes production has (the global slug index is gone).
  beforeEach(() => {
    indexes({ afterContract: true });
    seedAlias();
  });

  it("refuses the back-half on create, with the reason", async () => {
    const response = await create({
      destinationUrl: "https://example.com/menu",
      slug: "menu-page",
      domainId: "dom_brand",
    });
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("SLUG_TAKEN");
    expect(JSON.stringify(error)).toMatch(ALIAS_MESSAGE);
    // Other domains and qrdx.dev are unaffected.
    for (const domainId of ["dom_other", undefined]) {
      const elsewhere = await create({
        destinationUrl: "https://example.com/menu",
        slug: "menu-page",
        ...(domainId && { domainId }),
      });
      expect(elsewhere.status, String(domainId)).toBe(201);
    }
  });

  it("says why in the dialog's live check", async () => {
    expect(
      await checkSlugAvailability(SCOPE, {
        slug: "menu-page",
        domainId: "dom_brand",
      }),
    ).toEqual({
      status: "taken",
      message:
        "/p/menu-page on this domain is another code's path alias. Try another one.",
    });
    expect(
      (
        await checkSlugAvailability(SCOPE, {
          slug: "menu-page",
          domainId: "dom_other",
        })
      ).status,
    ).toBe("available");
  });

  it("refuses it when a code on the domain changes to it", async () => {
    seedCode({
      id: "code_mine",
      userId: "u_alice",
      slug: "spring-menu",
      slugScope: "dom_brand",
      domainId: "dom_brand",
    });
    const response = await patch("code_mine", { slug: "menu-page" });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toMatch(ALIAS_MESSAGE);
    expect(fakeDb.find("qrCode", { id: "code_mine" })?.slug).toBe(
      "spring-menu",
    );
  });

  it("refuses moving a code with that back-half onto the domain", async () => {
    seedCode({ id: "code_shared", userId: "u_alice", slug: "menu-page" });
    const response = await patch("code_shared", { domainId: "dom_brand" });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toMatch(ALIAS_MESSAGE);
    expect(fakeDb.find("qrCode", { id: "code_shared" })?.domainId).toBeNull();
    // Onto another domain it moves.
    expect((await patch("code_shared", { domainId: "dom_other" })).status).toBe(
      200,
    );
  });

  it("counts as taken for imports and suggestions (findTakenSlugs)", async () => {
    expect([
      ...(await findTakenSlugs(["menu-page", "free-one"], "dom_brand")),
    ]).toEqual(["menu-page"]);
    // The alias's own code may take it (its page and alias open the same code).
    expect(
      (
        await findTakenSlugs(["menu-page"], "dom_brand", {
          exceptCodeId: "code_alias",
        })
      ).size,
    ).toBe(0);
    expect(
      (await findTakenSlugs(["menu-page"], "dom_brand", { aliases: false }))
        .size,
    ).toBe(0);
  });
});

describe("aliases that don't answer don't block", () => {
  beforeEach(() => indexes({ afterContract: true }));

  it("frees the back-half once the alias's code has left the domain", async () => {
    seedAlias({ codeDomainId: "dom_other" });
    expect((await aliasBlockedSlugs(["menu-page"], "dom_brand")).size).toBe(0);
    const response = await create({
      destinationUrl: "https://example.com/menu",
      slug: "menu-page",
      domainId: "dom_brand",
    });
    expect(response.status).toBe(201);
  });

  it("keeps back-halves working before link_path_alias exists", async () => {
    fakeDb.missing("linkPathAlias");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await create({
      destinationUrl: "https://example.com/menu",
      slug: "menu-page",
      domainId: "dom_brand",
    });
    expect(response.status).toBe(201);
    expect(
      (
        await checkSlugAvailability(SCOPE, {
          slug: "other-page",
          domainId: "dom_brand",
        })
      ).status,
    ).toBe("available");
  });
});
