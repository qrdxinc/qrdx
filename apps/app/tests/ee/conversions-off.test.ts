// Conversion tracking is in ee/ under the QRdx commercial licence: without
// QRDX_EE_LICENSE scans get no qrdx_sid, POST /api/v1/conversions answers 404
// (with CORS, so a browser can read it), /conversions.js isn't served, the
// code options leave it out and it can't be turned on. Codes keep
// redirecting. With the key and Business it all works as before.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedirectCode } from "@/lib/redirect/code";
import { testLicence } from "../support/ee-license";

const state = vi.hoisted(() => ({
  plan: "business" as "free" | "pro" | "business",
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
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 60,
      remaining: 59,
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
    organizationId: "org_acme",
    role: "owner",
  }),
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

const CODE = "ckanacode0001";
const SCAN = "ckscan0000001";

/** The app's modules, loaded with `license` as QRDX_EE_LICENSE. */
async function load(license: string | undefined) {
  vi.resetModules();
  vi.stubEnv("QRDX_EE_LICENSE", license);
  const availability = await import("@/lib/feature-availability");
  const route = await import("@/app/api/v1/conversions/route");
  const script = await import("@/app/conversions.js/route");
  const routing = await import("@/lib/redirect/routing");
  const marketing = await import("@/actions/code-marketing");
  const options = await import("@/app/(app)/dashboard/codes/_lib/code-options");
  const kinds = await import(
    "@/app/(app)/dashboard/codes/_lib/code-kind-shared"
  );
  // The in-memory database these freshly loaded modules use; its tables
  // outlive vi.resetModules, so each test starts from an empty one.
  const { database, qrCode, conversion, eq } = (await import(
    "@repo/database"
  )) as unknown as Tables;
  await database.delete(conversion).where(eq(conversion.qrCodeId, CODE));
  await database.delete(qrCode).where(eq(qrCode.id, CODE));
  await database.insert(qrCode).values({
    id: CODE,
    userId: "u_ana",
    organizationId: "org_acme",
    kind: "redirect",
    destinationUrl: "https://shop.example/",
    scanCount: 0,
    routing: null,
    utm: null,
    pixels: { consent: "auto", conversions: true },
  });
  const db = {
    setPixels: (pixels: unknown) =>
      database.update(qrCode).set({ pixels }).where(eq(qrCode.id, CODE)),
    conversions: async () => (await database.select().from(conversion)).length,
  };
  return {
    ...availability,
    route,
    script,
    routing,
    marketing,
    options,
    kinds,
    db,
  };
}

// The fake database's API, as much of drizzle's as these tests use.
interface Tables {
  database: {
    insert: (table: unknown) => { values: (row: unknown) => Promise<unknown> };
    update: (table: unknown) => {
      set: (values: unknown) => { where: (where: unknown) => Promise<unknown> };
    };
    select: () => { from: (table: unknown) => Promise<unknown[]> };
    delete: (table: unknown) => { where: (where: unknown) => Promise<unknown> };
  };
  qrCode: { id: unknown };
  conversion: { qrCodeId: unknown };
  eq: (column: unknown, value: unknown) => unknown;
}

type App = Awaited<ReturnType<typeof load>>;

const report = (app: App, body: unknown) =>
  app.route.POST(
    new NextRequest(new URL("/api/v1/conversions", "http://localhost:3000"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://shop.example",
      },
      body: JSON.stringify(body),
    }),
  );

const redirectCode = (pixels: unknown): RedirectCode => ({
  id: CODE,
  slug: "aB3dE5f",
  kind: "redirect",
  destinationUrl: "https://shop.example/",
  domainId: null,
  isActive: true,
  archivedAt: null,
  deletedAt: null,
  scanCount: 0,
  passwordHash: null,
  startsAt: null,
  expiresAt: null,
  scanLimit: null,
  pausedAt: null,
  fallbackUrl: null,
  routing: null,
  utm: null,
  pixels,
  userId: "u_ana",
  organizationId: "org_acme",
});

/** Where a scan of a code with conversion tracking on is sent. */
const scanDestination = async (app: App) =>
  new URL(
    await app.routing.resolveDestination(
      redirectCode({ conversions: true }),
      new Request("http://localhost:3000/q/aB3dE5f"),
      { scanId: SCAN, now: new Date() },
    ),
  );

beforeEach(() => {
  state.plan = "business";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("without a valid QRDX_EE_LICENSE", () => {
  it("isn't offered, and its API reference leaves the navigation", async () => {
    for (const key of [
      "local-dev",
      testLicence({}, { days: -15 }),
      testLicence({ features: ["sso"] }),
    ]) {
      expect((await load(key)).isFeatureAvailable("conversions"), key).toBe(
        false,
      );
    }
    const app = await load(undefined);
    expect(app.isFeatureAvailable("conversions")).toBe(false);
    expect(app.isPathAvailable("/docs/developers/api/create-conversion")).toBe(
      false,
    );
  });

  it("answers 404 to reports, with CORS, and records nothing", async () => {
    const app = await load(undefined);
    const sid = app.routing.signScanToken(SCAN, CODE, new Date());
    const response = await report(app, { sid, name: "purchase" });
    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toMatchObject({
      code: "NOT_FOUND",
      message: "Conversion tracking isn't available on this server.",
    });
    expect(await app.db.conversions()).toBe(0);
    // The preflight still answers, so the browser sees the 404.
    expect(app.route.OPTIONS().status).toBe(204);
  });

  it("doesn't serve /conversions.js", async () => {
    const app = await load(undefined);
    expect(app.script.GET().status).toBe(404);
  });

  it("still redirects scans, without a qrdx_sid", async () => {
    const app = await load(undefined);
    const url = await scanDestination(app);
    expect(url.href).toBe("https://shop.example/");
    expect(url.searchParams.has(app.routing.SCAN_TOKEN_PARAM)).toBe(false);
  });

  it("can't be turned on, only off, and leaves the code options", async () => {
    const app = await load(undefined);
    await app.db.setPixels({ consent: "auto" });
    const on = await app.marketing.saveCodePixels({
      id: CODE,
      pixels: { consent: "auto", conversions: true },
    });
    expect(on).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Conversion tracking isn't available on this server.",
      },
    });
    await app.db.setPixels({ consent: "auto", conversions: true });
    const off = await app.marketing.saveCodePixels({
      id: CODE,
      pixels: { consent: "auto", conversions: false },
    });
    expect(off.success).toBe(true);
    if (off.success) {
      expect(off.data.features.conversions).toBe(false);
      expect(off.data.pixels?.conversions).not.toBe(true);
    }

    const offered = { conversions: app.isFeatureAvailable("conversions") };
    expect(app.options.codeOptionsFor("redirect", offered)).not.toContain(
      "conversions",
    );
    expect(app.options.codeOptionsFor("page", offered)).toEqual([
      "password",
      "schedule",
      "pixels",
    ]);
    // Saved on a hosted page, it isn't named as an option kept for later.
    expect(
      app.kinds.inactiveOptions(
        "page",
        { routing: null, utm: null, pixels: { conversions: true } },
        offered,
      ),
    ).toEqual([]);
  });
});

describe("with a valid QRDX_EE_LICENSE", () => {
  it("records reports and appends qrdx_sid to scans", async () => {
    const app = await load(testLicence());
    expect(app.isFeatureAvailable("conversions")).toBe(true);
    const url = await scanDestination(app);
    const sid = url.searchParams.get(app.routing.SCAN_TOKEN_PARAM);
    expect(app.routing.verifyScanToken(sid)).toMatchObject({
      scanId: SCAN,
      codeId: CODE,
    });
    const response = await report(app, { sid, name: "purchase" });
    expect(response.status).toBe(201);
    expect(await app.db.conversions()).toBe(1);
  });

  it("serves /conversions.js", async () => {
    const app = await load(testLicence());
    const response = app.script.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/javascript; charset=utf-8",
    );
    const source = await response.text();
    expect(source).toContain('const KEY = "qrdx_sid";');
    expect(source).toContain("/api/v1/conversions");
  });

  it("is turned on with Business, and offered in the code options", async () => {
    const app = await load(testLicence());
    await app.db.setPixels({ consent: "auto" });
    state.plan = "pro";
    const pro = await app.marketing.saveCodePixels({
      id: CODE,
      pixels: { consent: "auto", conversions: true },
    });
    expect(pro.success ? null : pro.error.code).toBe("PLAN_REQUIRED");
    state.plan = "business";
    const business = await app.marketing.saveCodePixels({
      id: CODE,
      pixels: { consent: "auto", conversions: true },
    });
    expect(business.success).toBe(true);
    if (business.success) {
      expect(business.data.features.conversions).toBe(true);
      expect(business.data.pixels?.conversions).toBe(true);
    }
    expect(
      app.options.codeOptionsFor("redirect", {
        conversions: app.isFeatureAvailable("conversions"),
      }),
    ).toContain("conversions");
  });
});
