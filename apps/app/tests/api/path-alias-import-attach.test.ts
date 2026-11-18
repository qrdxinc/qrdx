// Attaching an import's codes to the customer's domain once it's verified
// (lib/migrate/server/repo.ts attachDomain) never moves a code whose hosted
// page (/p/<slug>) would hide another code's path alias there: that code
// stays on qrdx.dev/q/, like one whose back-half the domain already serves.

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
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

const { dbRepo } = await import("@/lib/migrate/server/repo");

const SCOPE = {
  userId: "u_alice",
  organizationId: ownWorkspaceId("u_alice"),
  role: "owner" as const,
};

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  state.plan = "pro";
  state.domains = new Map([
    ["dom_brand", { hostname: "go.brand.com", verified: true }],
  ]);
  const code = (id: string, slug: string, overrides = {}) => ({
    id,
    userId: "u_alice",
    organizationId: ownWorkspaceId("u_alice"),
    slug,
    slugScope: "",
    domainId: null,
    destinationUrl: "https://example.com",
    ...overrides,
  });
  fakeDb.seed("qrCode", [
    code("imported_page", "menu-page"),
    code("imported_other", "spring-menu"),
    code("alias_holder", "AliasHolder", {
      userId: "u_bob",
      organizationId: ownWorkspaceId("u_bob"),
      domainId: "dom_brand",
    }),
  ]);
  fakeDb.seed("linkPathAlias", [
    {
      id: "pa_menu",
      domainId: "dom_brand",
      qrCodeId: "alias_holder",
      path: "/p/menu-page",
      createdAt: new Date(),
    },
  ]);
});

describe("attaching imported codes to the domain", () => {
  it("leaves a code whose page path is another code's alias on qrdx.dev", async () => {
    const attached = await dbRepo.attachDomain(
      SCOPE,
      ["imported_page", "imported_other"],
      "dom_brand",
    );
    expect(attached).toBe(1);
    expect(fakeDb.find("qrCode", { id: "imported_page" })?.domainId).toBeNull();
    expect(fakeDb.find("qrCode", { id: "imported_other" })?.domainId).toBe(
      "dom_brand",
    );
  });

  it("attaches as before when link_path_alias doesn't exist yet", async () => {
    fakeDb.missing("linkPathAlias");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await dbRepo.attachDomain(
        SCOPE,
        ["imported_page", "imported_other"],
        "dom_brand",
      ),
    ).toBe(2);
  });
});
