// A new account's code held for a safety check is switched off ("disabled")
// with an open "auto-hold" report (lib/safety/velocity.ts). The dashboard
// says so instead of calling it moderation; a code an admin turned off keeps
// the moderation wording. The REST API never shows the difference.
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, pending: Promise.resolve() }),
  }),
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));

const { fakeDb } = await import("../support/fake-db");
const { getCode, toCodeView } = await import(
  "@/app/(app)/dashboard/codes/_lib/qr-codes"
);
const { heldForReviewIds } = await import("@/lib/safety/holds");
const { StatusBadge } = await import(
  "@/app/(app)/dashboard/codes/_components/status-badge"
);
const { renderIntl } = await import("../support/intl");
const { serializeCode } = await import("@/app/api/v1/codes/_lib/api");

type Row = Parameters<typeof toCodeView>[0];

const row = (patch: Partial<Row> = {}): Row =>
  ({
    id: "code_1",
    userId: "u_alice",
    organizationId: null,
    slug: "abc1234",
    slugScope: "",
    destinationUrl: "https://example.com/menu",
    title: null,
    contentType: "url",
    style: null,
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
    passwordHash: null,
    startsAt: null,
    expiresAt: null,
    scanLimit: null,
    pausedAt: null,
    fallbackUrl: null,
    routing: null,
    utm: null,
    pixels: null,
    deletedAt: null,
    webRiskRecheckAt: null,
    createdVia: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...patch,
  }) as Row;

const scope = {
  userId: "u_alice",
  organizationId: null,
  role: "owner",
} as never;

function report(patch: Record<string, unknown>) {
  return {
    id: `rep_${Math.random().toString(36).slice(2)}`,
    qrCodeId: "code_1",
    pageId: null,
    url: "https://bit.ly/x",
    reason: "auto-hold",
    details: null,
    reporterEmail: null,
    status: "open",
    visitorHash: null,
    createdAt: new Date(0),
    ...patch,
  };
}

/** Tables by their export name in packages/database/schema.ts (fake-db). */
const seed = (codes: Row[], reports: Record<string, unknown>[]) => {
  fakeDb.seed("qrCode", codes);
  fakeDb.seed("abuseReport", reports);
};

beforeEach(() => {
  fakeDb.reset();
});

describe("telling a safety hold from moderation", () => {
  it("an open auto-hold report marks the code held", async () => {
    seed([row({ isActive: false })], [report({})]);
    const code = await getCode(scope, "code_1");
    expect(code.status).toBe("disabled");
    expect(code.heldForReview).toBe(true);
  });

  it.each([
    ["an admin turned it off (actioned)", { status: "actioned" }],
    ["the report was dismissed", { status: "dismissed" }],
    ["a visitor's report", { reason: "phishing" }],
  ])("not held when %s", async (_, patch) => {
    seed([row({ isActive: false })], [report(patch)]);
    const code = await getCode(scope, "code_1");
    expect(code.status).toBe("disabled");
    expect(code.heldForReview).toBeUndefined();
  });

  it("a live code isn't looked up, and an empty list asks nothing", async () => {
    seed([row()], [report({})]);
    expect((await getCode(scope, "code_1")).heldForReview).toBeUndefined();
    expect(await heldForReviewIds([])).toEqual(new Set());
  });
});

describe("the dashboard's wording", () => {
  const badge = (props: Parameters<typeof StatusBadge>[0]) =>
    renderIntl(createElement(StatusBadge, props));

  it("held: a safety check with the support address, never moderation", () => {
    const html = badge({ status: "disabled", held: true });
    expect(html).toContain("Safety check");
    expect(html).toContain("quick safety check");
    expect(html).toContain("support@qrdx.dev");
    expect(html).not.toMatch(/moderation|abuse/i);
  });

  it("moderated: keeps the moderation wording", () => {
    const html = badge({ status: "disabled" });
    expect(html).toContain("Disabled");
    expect(html).toContain("Turned off by QRdx moderation");
  });

  it("held only matters while the code is off", () => {
    expect(badge({ status: "active", held: true })).toContain("Active");
  });
});

describe("the REST API", () => {
  it("doesn't show whether a code is held", () => {
    const view = {
      ...toCodeView(row({ isActive: false })),
      heldForReview: true,
    };
    const api = serializeCode(view);
    expect(api).not.toHaveProperty("heldForReview");
    expect(api.status).toBe("disabled");
  });
});
