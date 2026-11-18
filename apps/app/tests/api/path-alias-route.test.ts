// Path aliases on a custom domain (app/path-alias/[...path]/route.ts, reached
// through proxy.ts): an old path another provider printed opens the alias's
// code with the same pipeline as its short link (scan counting, password,
// schedule, pause), only on its domain, and answers "not found" (never a
// 500) before manual-sql/2026-11-18-path-aliases.sql is applied. Runs the
// real pipeline against in-memory tables, as apps/docs/content/docs/migrate.mdx
// ("Path aliases") describes it.
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  afterQueue: [] as (() => unknown)[],
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
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.afterQueue.push(task);
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1,
      remaining: 1,
      reset: 0,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/lib/events/emit", () => ({ emitScanRecorded: async () => {} }));

const route = await import("@/app/path-alias/[...path]/route");

const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PASSWORD_HASH = bcrypt.hashSync("open sesame", 4);

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u_brand",
    organizationId: null,
    slug: `slug-${id}`,
    slugScope: "",
    kind: "redirect",
    pageId: null,
    destinationUrl: "https://cafe.example/menu",
    domainId: "dom_switch",
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    passwordHash: null,
    startsAt: null,
    expiresAt: null,
    scanLimit: null,
    pausedAt: null,
    fallbackUrl: null,
    routing: null,
    utm: null,
    pixels: null,
    title: "Menu",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

const alias = (id: string, qrCodeId: string, path: string) => ({
  id,
  domainId: "dom_switch",
  qrCodeId,
  path,
  createdAt: new Date("2026-11-18T00:00:00Z"),
});

beforeEach(() => {
  fakeDb.resetAll();
  state.afterQueue = [];
  fakeDb.seed("customDomain", [
    { id: "dom_switch", hostname: "qr.switch.com", verified: true },
    { id: "dom_other", hostname: "go.other.com", verified: true },
  ]);
  fakeDb.seed("qrCode", [
    code("code_menu"),
    code("code_page", { kind: "page", slug: "Pg12345", pageId: "page_1" }),
  ]);
  fakeDb.seed("linkPathAlias", [
    alias("pa_r", "code_menu", "/r/X"),
    alias("pa_batch", "code_menu", "/s/4f1c2a9e/code_batch-1/0b9e8d7c"),
    alias("pa_page", "code_page", "/a/cbey7J"),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What proxy.ts sends: the rewritten path, the domain tag, the real host. */
async function scan(
  path: string,
  {
    host = "qr.switch.com",
    domainId = "dom_switch" as string | null,
    method = "GET",
    body,
    cookie,
  }: {
    host?: string;
    domainId?: string | null;
    method?: string;
    body?: string;
    cookie?: string;
  } = {},
) {
  const url = new URL(`/path-alias${path}`, `https://${host}`);
  const request = new NextRequest(url, {
    method,
    body,
    headers: {
      host,
      "user-agent": PHONE,
      "x-real-ip": "203.0.113.9",
      ...(body && { "content-type": "application/x-www-form-urlencoded" }),
      ...(cookie && { cookie }),
      ...(domainId ? { "x-qrdx-custom-domain": domainId } : {}),
    },
  });
  const segments = url.pathname.split("/").filter(Boolean).slice(1);
  const handler = method === "POST" ? route.POST : route.GET;
  const response = await handler(request, {
    params: Promise.resolve({ path: segments.map(decodeURIComponent) }),
  });
  for (const task of state.afterQueue.splice(0)) await task();
  return response;
}

const scans = () => fakeDb.rows("qrScan");

describe("a path alias on a custom domain", () => {
  it("redirects to the code's destination and counts a scan", async () => {
    const response = await scan("/r/X");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cafe.example/menu");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).toMatchObject({ qrCodeId: "code_menu", source: "qr" });
    expect(fakeDb.find("qrCode", { id: "code_menu" })?.scanCount).toBe(1);
  });

  it("opens several-part paths, and counts NFC taps as taps", async () => {
    expect(
      (await scan("/s/4f1c2a9e/code_batch-1/0b9e8d7c")).headers.get("location"),
    ).toBe("https://cafe.example/menu");
    await scan("/r/X?nfc");
    expect(scans().map((row) => row.source)).toEqual(["qr", "nfc"]);
  });

  it("opens a hosted page through the page's own path", async () => {
    const response = await scan("/a/cbey7J");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/p/Pg12345");
  });

  it("matches exactly: case counts", async () => {
    expect((await scan("/r/x")).status).toBe(404);
    expect(scans()).toHaveLength(0);
  });

  it("applies the code's password like its short link", async () => {
    const menu = fakeDb.find("qrCode", { id: "code_menu" });
    if (menu) menu.passwordHash = PASSWORD_HASH;
    const gate = await scan("/r/X");
    expect(gate.status).toBe(200);
    expect(gate.headers.get("location")).toBeNull();
    expect(await gate.text()).toContain('<form method="post">');

    const wrong = await scan("/r/X", {
      method: "POST",
      body: "password=guess",
    });
    expect(wrong.status).toBe(401);
    const right = await scan("/r/X", {
      method: "POST",
      body: "password=open+sesame",
    });
    expect(right.status).toBe(303);
    expect(right.headers.get("location")).toBe("https://cafe.example/menu");
    // The GET that showed the form counted the visit; the POSTs didn't.
    expect(scans()).toHaveLength(1);
  });

  it("follows pause, expiry and archive like its short link", async () => {
    const menu = fakeDb.find("qrCode", { id: "code_menu" }) as Record<
      string,
      unknown
    >;
    menu.pausedAt = new Date("2026-11-01T00:00:00Z");
    menu.fallbackUrl = "https://cafe.example/closed";
    expect((await scan("/r/X")).headers.get("location")).toBe(
      "https://cafe.example/closed",
    );
    menu.pausedAt = null;
    menu.expiresAt = new Date("2026-01-01T00:00:00Z");
    expect((await scan("/r/X")).headers.get("location")).toBe(
      "https://cafe.example/closed",
    );
    menu.expiresAt = null;
    menu.archivedAt = new Date();
    expect((await scan("/r/X")).status).toBe(410);
  });

  it("stops answering once the code leaves the domain", async () => {
    const menu = fakeDb.find("qrCode", { id: "code_menu" });
    if (menu) menu.domainId = "dom_other";
    expect((await scan("/r/X")).status).toBe(404);
    expect(
      (await scan("/r/X", { host: "go.other.com", domainId: "dom_other" }))
        .status,
    ).toBe(404);
  });

  it("never resolves on another domain or QRdx's shared host", async () => {
    expect(
      (await scan("/r/X", { host: "go.other.com", domainId: "dom_other" }))
        .status,
    ).toBe(404);
    // No domain tag, and a QRdx host even when the header is forged.
    expect((await scan("/r/X", { domainId: null })).status).toBe(404);
    expect(
      (await scan("/r/X", { host: "qrdx.dev", domainId: "dom_switch" })).status,
    ).toBe(404);
    expect(scans()).toHaveLength(0);
  });

  it("answers 'not found' (not a 500) before link_path_alias exists", async () => {
    fakeDb.missing("linkPathAlias");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["/r/X", "/a/cbey7J", "/r/X"]) {
      const response = await scan(path);
      expect(response.status, path).toBe(404);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(scans()).toHaveLength(0);
  });
});
