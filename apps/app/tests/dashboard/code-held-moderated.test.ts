// A new account's code held for a safety check, against one QRdx switched
// off after a review (lib/safety/holds.ts):
// - a hold's report is written before the answer is built, so the create or
//   save answer (and the page refreshed with it) already says held;
// - an owner can't change what a moderated code opens (dashboard, kind
//   switch, version restore, REST API), so no fresh hold can bring it back;
// - a moderated code never reads as held, and /admin/abuse turns one back on
//   only with an override and a reason.
// The real codes service and URL screening run against in-memory tables;
// Web Risk, webhooks and the audit log's workspace events are stubbed.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// after() runs once the response has gone: never before the test's checks.
const afterResponse = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterResponse.push(task);
  },
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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
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
  getPlanForScope: async () => "free",
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/code-versions")>()),
  snapshotCodeVersion: async () => {},
}));
vi.mock("@/lib/safety/web-risk", () => ({
  lookupWebRisk: async () => ({ status: "safe" }),
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/app/(app)/admin/_lib/guard", () => ({
  assertAdmin: async () => ({ id: "admin_1", email: "admin@example.com" }),
}));

const { fakeDb } = await import("../support/fake-db");
const { createCodes, getCode, updateCode } = await import(
  "@/app/(app)/dashboard/codes/_lib/qr-codes"
);
const { switchCodeKind } = await import(
  "@/app/(app)/dashboard/codes/_lib/code-kind"
);
const { restoreCodeVersion } = await import("@/lib/code-versions");
const { moderatedIds } = await import("@/lib/safety/holds");
const { restoreReportedCodeAction } = await import(
  "@/app/(app)/admin/abuse/actions"
);
const one = await import("@/app/api/v1/codes/[id]/route");

const NOW = new Date("2026-11-19T12:00:00Z");
const DAY = 24 * 3_600_000;
const scope = {
  userId: "u_alice",
  organizationId: null,
  role: "owner",
} as never;
const SHORTENER = "https://bit.ly/menu";
const MODERATED =
  "This code was switched off by QRdx after a review. Contact support@qrdx.dev.";

const reports = () =>
  fakeDb.rows("abuseReport") as {
    id: string;
    qrCodeId: string;
    reason: string;
    status: string;
  }[];
const codeRow = (id = "code_1") =>
  (fakeDb.rows("qrCode") as { id: string }[]).find((row) => row.id === id) as
    | Record<string, unknown>
    | undefined;

function seedCode(patch: Record<string, unknown> = {}) {
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_alice",
      organizationId: null,
      slug: "abc1234",
      destinationUrl: "https://example.com/menu",
      createdAt: NOW,
      updatedAt: NOW,
      ...patch,
    },
  ]);
}

function report(patch: Record<string, unknown>) {
  return {
    id: `rep_${Math.random().toString(36).slice(2)}`,
    qrCodeId: "code_1",
    pageId: null,
    url: SHORTENER,
    reason: "auto-hold",
    details: null,
    reporterEmail: null,
    status: "open",
    visitorHash: null,
    createdAt: NOW,
    ...patch,
  };
}

const audit = (action: string, minutesAgo: number) => ({
  id: `audit_${action}_${minutesAgo}`,
  actorUserId: "admin_1",
  action,
  targetType: "qr_code",
  targetId: "code_1",
  metadata: {},
  createdAt: new Date(NOW.getTime() - minutesAgo * 60_000),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  afterResponse.length = 0;
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
    fallbackUrl: null,
    deletedAt: null,
    webRiskRecheckAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "slugScope", "slug");
  // A new account: suspicious links are held (lib/safety/velocity.ts).
  fakeDb.seed("user", [
    {
      id: "u_alice",
      role: null,
      banned: false,
      banExpires: null,
      createdAt: new Date(NOW.getTime() - DAY),
    },
  ]);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a code held just now", () => {
  it("the create answer says held: the report is written first", async () => {
    const [code] = await createCodes(scope, [
      { destinationUrl: SHORTENER, title: null },
    ]);
    expect(code?.status).toBe("disabled");
    expect(code?.heldForReview).toBe(true);
    expect(reports()).toMatchObject([
      { qrCodeId: code?.id, reason: "auto-hold", status: "open" },
    ]);
  });

  it("the save answer, and the page refreshed with it, say held", async () => {
    seedCode();
    const view = await updateCode(scope, "code_1", {
      destinationUrl: SHORTENER,
    });
    expect(view.status).toBe("disabled");
    expect(view.heldForReview).toBe(true);
    expect((await getCode(scope, "code_1")).heldForReview).toBe(true);
  });

  it("a kind switch back to a flagged link says held too", async () => {
    seedCode({
      kind: "page",
      pageId: "page_1",
      destinationUrl: "https://qrdx.dev/p/abc1234",
    });
    fakeDb.seed("landingPage", []);
    const view = await switchCodeKind(scope, "code_1", {
      kind: "redirect",
      destinationUrl: SHORTENER,
    });
    expect(view.heldForReview).toBe(true);
  });

  it("an older account's code goes live with no report", async () => {
    Object.assign(fakeDb.find("user", { id: "u_alice" }) ?? {}, {
      createdAt: new Date(0),
    });
    const [code] = await createCodes(scope, [
      { destinationUrl: SHORTENER, title: null },
    ]);
    expect(code?.status).toBe("active");
    expect(reports()).toEqual([]);
  });
});

describe("what records moderation", () => {
  it("an actioned report, or an admin's latest Disable", async () => {
    fakeDb.seed("abuseReport", [
      report({ qrCodeId: "code_a", status: "actioned", reason: "phishing" }),
      report({ qrCodeId: "code_b", status: "dismissed" }),
      report({ qrCodeId: "code_c" }),
    ]);
    fakeDb.seed("adminAuditLog", [
      { ...audit("qr_code.disable", 5), targetId: "code_d" },
      { ...audit("qr_code.disable", 10), targetId: "code_e" },
      { ...audit("qr_code.enable", 5), targetId: "code_e" },
    ]);
    const ids = ["code_a", "code_b", "code_c", "code_d", "code_e"];
    expect(await moderatedIds(ids)).toEqual(new Set(["code_a", "code_d"]));
    expect(await moderatedIds([])).toEqual(new Set());
  });

  it("a newer auto-hold doesn't make a moderated code read as held", async () => {
    seedCode({ isActive: false });
    fakeDb.seed("abuseReport", [
      report({ status: "actioned", reason: "phishing" }),
      report({}),
    ]);
    const code = await getCode(scope, "code_1");
    expect(code.status).toBe("disabled");
    expect(code.heldForReview).toBeUndefined();
  });
});

describe("an owner can't change what a moderated code opens", () => {
  beforeEach(() => {
    seedCode({ isActive: false });
    fakeDb.seed("abuseReport", [
      report({ status: "actioned", reason: "phishing", url: null }),
    ]);
  });

  it("refuses a new destination, and files no hold", async () => {
    await expect(
      updateCode(scope, "code_1", { destinationUrl: SHORTENER }),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: MODERATED,
    });
    expect(codeRow()?.destinationUrl).toBe("https://example.com/menu");
    expect(reports()).toHaveLength(1);
  });

  it("still lets the owner rename it or keep the same address", async () => {
    const view = await updateCode(scope, "code_1", {
      title: "Old menu",
      destinationUrl: "https://example.com/menu",
    });
    expect(view.title).toBe("Old menu");
    expect(view.status).toBe("disabled");
  });

  it("refuses a switch to a hosted page", async () => {
    await expect(
      switchCodeKind(scope, "code_1", { kind: "page", pageId: "page_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: MODERATED });
  });

  it("refuses an older version", async () => {
    fakeDb.seed("qrCodeVersion", [
      {
        id: "ver_1",
        qrCodeId: "code_1",
        snapshot: { destinationUrl: "https://example.com/old" },
        createdAt: new Date(0),
      },
    ]);
    await expect(
      restoreCodeVersion(scope, "code_1", "ver_1"),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: MODERATED });
  });

  it("counts an admin's Disable without a report, until an Enable", async () => {
    fakeDb.rows("abuseReport").length = 0;
    fakeDb.seed("adminAuditLog", [audit("qr_code.disable", 10)]);
    await expect(
      updateCode(scope, "code_1", { destinationUrl: SHORTENER }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Turned back on since, and off again by a new hold: an ordinary hold.
    fakeDb.seed("adminAuditLog", [audit("qr_code.enable", 5)]);
    const view = await updateCode(scope, "code_1", {
      destinationUrl: SHORTENER,
    });
    expect(view.heldForReview).toBe(true);
  });

  it("answers the REST API with 403 FORBIDDEN", async () => {
    const token = "write-token";
    fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
    fakeDb.seed("oauthToken", [
      {
        id: "tok_1",
        accessTokenHash: createHash("sha256").update(token).digest("hex"),
        refreshTokenHash: "unused",
        appId: "app_1",
        userId: "u_alice",
        scopes: ["codes:write"],
        accessTokenExpiresAt: new Date(NOW.getTime() + DAY),
        refreshTokenExpiresAt: new Date(NOW.getTime() + DAY),
        revokedAt: null,
      },
    ]);
    const response = await one.PATCH(
      new NextRequest(new URL("/api/v1/codes/code_1", "http://localhost"), {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ destinationUrl: SHORTENER }),
      }),
      { params: Promise.resolve({ id: "code_1" }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "FORBIDDEN",
      message: MODERATED,
    });
  });
});

describe("restoring from /admin/abuse", () => {
  const isActive = () => codeRow()?.isActive;

  it("approves a plain hold", async () => {
    seedCode({ isActive: false });
    fakeDb.seed("abuseReport", [report({ id: "rep_hold" })]);
    expect(await restoreReportedCodeAction({ reportId: "rep_hold" })).toEqual({
      ok: true,
    });
    expect(isActive()).toBe(true);
    expect(reports()[0]?.status).toBe("dismissed");
  });

  it("won't turn a moderated code on without an override and a reason", async () => {
    seedCode({ isActive: false });
    fakeDb.seed("abuseReport", [
      report({ status: "actioned", reason: "phishing" }),
      report({ id: "rep_hold" }),
    ]);

    const refused = await restoreReportedCodeAction({ reportId: "rep_hold" });
    expect(refused.ok).toBe(false);
    expect(refused).toMatchObject({
      error: expect.stringContaining("switched this code off after a review"),
    });
    expect(
      await restoreReportedCodeAction({ reportId: "rep_hold", override: true }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("reason") });
    expect(isActive()).toBe(false);

    expect(
      await restoreReportedCodeAction({
        reportId: "rep_hold",
        override: true,
        reason: "Owner proved the shortener is theirs",
      }),
    ).toEqual({ ok: true });
    expect(isActive()).toBe(true);
    expect(fakeDb.rows("adminAuditLog")).toMatchObject([
      {
        action: "qr_code.enable",
        targetId: "code_1",
        metadata: {
          override: true,
          reason: "Owner proved the shortener is theirs",
        },
      },
    ]);
  });
});
