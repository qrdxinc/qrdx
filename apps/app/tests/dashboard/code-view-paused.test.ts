// A code its owner paused keeps status "active" (codeStatus reads only
// isActive and archivedAt); the view says `paused`, so the playground's
// Dynamic toggle can tell a paused code from a live one after an address
// change (components/editor/dynamic-link-toggle.tsx). The REST API picks its
// fields one by one (app/api/v1/codes/_lib/api.ts), so it doesn't change.
import { describe, expect, it, vi } from "vitest";

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

const { toCodeView } = await import(
  "@/app/(app)/dashboard/codes/_lib/qr-codes"
);
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

describe("a code's view: paused", () => {
  it("a paused code stays active and says it's paused", () => {
    const view = toCodeView(
      row({ pausedAt: new Date("2026-11-19T10:00:00Z") }),
    );
    expect(view.status).toBe("active");
    expect(view.paused).toBe(true);
  });

  it("a live code isn't paused; a switched-off one is disabled, not paused", () => {
    expect(toCodeView(row()).paused).toBe(false);
    const off = toCodeView(row({ isActive: false }));
    expect(off.status).toBe("disabled");
    expect(off.paused).toBe(false);
  });

  it("the REST API's code is unchanged", () => {
    const view = toCodeView(row({ pausedAt: new Date() }));
    expect(serializeCode(view)).not.toHaveProperty("paused");
  });
});
