// The same-origin routes the public generator widgets call instead of server
// actions (lib/widget-routes): POST /api/playground/codes and PATCH
// /api/playground/codes/{id} (the Dynamic toggle), POST /api/barcodes
// (/barcode-generator's "Save to dashboard").
//
// They're cookie-authenticated, so only this origin may call them (Origin
// and Sec-Fetch-Site), with JSON bodies, and they send no CORS headers. Past
// those checks each runs its server action, so a signed-out visitor, a plan
// limit, a rate limit or bad input gets exactly what the action answers. The
// actions and the codes and barcode services run for real against in-memory
// tables; only side systems (URL safety, custom domains, version history,
// webhooks) are stubbed and audit events are recorded.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  plan: "free" as "free" | "pro" | "business",
  rateLimited: false,
  audit: [] as string[],
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
        state.session
          ? {
              user: { id: state.session.userId },
              session: { activeOrganizationId: state.session.organizationId },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
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
      success: !state.rateLimited,
      limit: 30,
      remaining: state.rateLimited ? 0 : 29,
      reset: Date.now() + 42_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
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
vi.mock("@/ee/audit-log/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ee/audit-log/record")>()),
  recordAuditEvent: (
    _scope: unknown,
    events: { action: string } | { action: string }[],
  ) => {
    for (const event of Array.isArray(events) ? events : [events]) {
      state.audit.push(event.action);
    }
  },
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const codes = await import("@/app/api/playground/codes/route");
const oneCode = await import("@/app/api/playground/codes/[id]/route");
const barcodes = await import("@/app/api/barcodes/route");
const { createQrCode } = await import("@/actions/qr-codes");
const { saveBarcode } = await import("@/actions/barcodes");
const { getPlanLimits } = await import("@/lib/plans");

const ORIGIN = "http://localhost:3000";
const SAME_ORIGIN = {
  host: "localhost:3000",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};

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
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  fakeDb.defaults("barcode", () => ({
    folderId: null,
    title: null,
    options: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
  state.session = null;
  state.plan = "free";
  state.rateLimited = false;
  state.audit = [];
});

function request(
  method: string,
  path: string,
  {
    body,
    rawBody,
    headers = SAME_ORIGIN,
  }: {
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(new URL(path, ORIGIN), {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const createCode = (body: unknown, headers?: Record<string, string>) =>
  codes.POST(request("POST", "/api/playground/codes", { body, headers }));
const patchCode = (
  id: string,
  body: unknown,
  headers?: Record<string, string>,
) =>
  oneCode.PATCH(
    request("PATCH", `/api/playground/codes/${id}`, { body, headers }),
    ctx(id),
  );
const saveOne = (body: unknown, headers?: Record<string, string>) =>
  barcodes.POST(request("POST", "/api/barcodes", { body, headers }));

const BARCODE = { format: "code128", value: "QRDX-1", title: null };

interface Result {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}
const json = async (response: Response) => (await response.json()) as Result;

const signIn = () => {
  state.session = { userId: "u_alice", organizationId: null };
};

describe("only this origin may call them", () => {
  const calls: [
    string,
    (headers: Record<string, string>) => Promise<Response>,
  ][] = [
    [
      "POST /api/playground/codes",
      (headers) =>
        createCode({ destinationUrl: "https://example.com" }, headers),
    ],
    [
      "PATCH /api/playground/codes/{id}",
      (headers) =>
        patchCode("code_1", { destinationUrl: "https://example.com" }, headers),
    ],
    ["POST /api/barcodes", (headers) => saveOne(BARCODE, headers)],
  ];

  const REFUSED: [string, Record<string, string>][] = [
    [
      "another site's Origin",
      { ...SAME_ORIGIN, origin: "https://evil.example" },
    ],
    [
      "a subdomain's Origin",
      { ...SAME_ORIGIN, origin: "https://evil.localhost:3000" },
    ],
    ['Origin "null"', { ...SAME_ORIGIN, origin: "null" }],
    [
      "no Origin",
      {
        host: SAME_ORIGIN.host,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
    ],
    [
      "Sec-Fetch-Site: cross-site",
      { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" },
    ],
    [
      "Sec-Fetch-Site: same-site",
      { ...SAME_ORIGIN, "sec-fetch-site": "same-site" },
    ],
    ["Sec-Fetch-Site: none", { ...SAME_ORIGIN, "sec-fetch-site": "none" }],
  ];

  for (const [route, call] of calls) {
    for (const [what, headers] of REFUSED) {
      it(`${route} refuses ${what} with 403, signed in, and writes nothing`, async () => {
        signIn();
        const response = await call(headers);
        expect(response.status).toBe(403);
        expect(await json(response)).toEqual({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Cross-origin request rejected.",
          },
        });
        expect(fakeDb.rows("qrCode")).toHaveLength(0);
        expect(fakeDb.rows("barcode")).toHaveLength(0);
      });
    }

    it(`${route} takes JSON only`, async () => {
      signIn();
      for (const type of [
        "text/plain",
        "text/plain; charset=application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
      ]) {
        const response = await call({ ...SAME_ORIGIN, "content-type": type });
        expect(response.status, type).toBe(415);
        expect((await json(response)).error?.code).toBe("VALIDATION_ERROR");
      }
      expect(fakeDb.rows("qrCode")).toHaveLength(0);
      expect(fakeDb.rows("barcode")).toHaveLength(0);
    });

    it(`${route} sends no CORS headers`, async () => {
      signIn();
      for (const headers of [SAME_ORIGIN, REFUSED[0][1]]) {
        const response = await call(headers);
        for (const name of response.headers.keys()) {
          expect(name.startsWith("access-control-")).toBe(false);
        }
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    });
  }

  it("allows a browser that sends no Sec-Fetch-Site when Origin is this app", async () => {
    signIn();
    const { "sec-fetch-site": _, ...older } = SAME_ORIGIN;
    expect(
      (await createCode({ destinationUrl: "https://example.com" }, older))
        .status,
    ).toBe(201);
  });
});

describe("POST /api/playground/codes (the Dynamic toggle)", () => {
  it("signed out: the action's UNAUTHORIZED, as a 401", async () => {
    const input = { destinationUrl: "https://example.com/menu" };
    const response = await createCode(input);
    expect(response.status).toBe(401);
    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage dynamic QR codes.",
      },
    });
    expect(body).toEqual(await createQrCode(input, { via: "playground" }));
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("signed in: makes the code via the playground, with its design", async () => {
    signIn();
    const style = { fgColor: "#111111", bgColor: "#ffffff" };
    const response = await createCode({
      destinationUrl: "https://example.com/menu",
      style,
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      destinationUrl: "https://example.com/menu",
      shortLink: expect.stringMatching(/^https?:\/\/.+\/q\/\w+$/),
    });
    const row = fakeDb.find("qrCode", { id: body.data?.id as string });
    expect(row?.createdVia).toBe("playground");
    expect(row?.userId).toBe("u_alice");
    expect(row?.style).toMatchObject(style);
    expect(state.audit.length).toBeGreaterThan(0);
  });

  it("the Free plan's 11th active code: the action's LIMIT_REACHED, as a 402", async () => {
    signIn();
    const limit = getPlanLimits("free").dynamicCodes;
    expect(limit).toBe(10);
    for (let index = 0; index < limit; index++) {
      const made = await createCode({
        destinationUrl: `https://example.com/${index}`,
      });
      expect(made.status).toBe(201);
    }
    const over = await createCode({ destinationUrl: "https://example.com/11" });
    expect(over.status).toBe(402);
    expect((await json(over)).error).toEqual({
      code: "LIMIT_REACHED",
      message: expect.stringContaining("10 active dynamic QR codes"),
      // Their own workspace, with invites still able to earn codes here
      // (lib/invites): the limit gate adds its invite line.
      invite: true,
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(limit);
  });

  it("keeps the action's validation and rate limit", async () => {
    signIn();
    const bad = { destinationUrl: "javascript:alert(1)" };
    const invalid = await createCode(bad);
    expect(invalid.status).toBe(400);
    expect(await json(invalid)).toEqual(
      await createQrCode(bad, { via: "playground" }),
    );
    expect((await json(await createCode(bad))).error?.message).toBe(
      "Only http:// and https:// links can be used",
    );

    for (const raw of ["[1,2]", "null", '"text"', "{not json"]) {
      const response = await codes.POST(
        request("POST", "/api/playground/codes", { rawBody: raw }),
      );
      expect(response.status, raw).toBe(400);
      expect((await json(response)).error?.code).toBe("VALIDATION_ERROR");
    }

    state.rateLimited = true;
    const limited = await createCode({ destinationUrl: "https://example.com" });
    expect(limited.status).toBe(429);
    expect((await json(limited)).error?.code).toBe("RATE_LIMITED");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("takes what the actions took (2 MB), and no more", async () => {
    signIn();
    const padding = "x".repeat(2 * 1024 * 1024);
    const response = await createCode({
      destinationUrl: "https://example.com",
      style: { padding },
    });
    expect(response.status).toBe(413);
    expect((await json(response)).error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/playground/codes/{id} (the linked code)", () => {
  const made = async () => {
    signIn();
    const body = await json(
      await createCode({ destinationUrl: "https://example.com/old" }),
    );
    return body.data?.id as string;
  };

  it("points the code at a new destination, and saves a design", async () => {
    const id = await made();
    const moved = await patchCode(id, {
      destinationUrl: "https://example.com/new",
    });
    expect(moved.status).toBe(200);
    expect((await json(moved)).data).toMatchObject({
      id,
      destinationUrl: "https://example.com/new",
    });
    expect(fakeDb.find("qrCode", { id })?.destinationUrl).toBe(
      "https://example.com/new",
    );

    const styled = await patchCode(id, { style: { fgColor: "#222222" } });
    expect(styled.status).toBe(200);
    expect(fakeDb.find("qrCode", { id })?.style).toMatchObject({
      fgColor: "#222222",
    });
  });

  it("the id comes from the path, not the body", async () => {
    const id = await made();
    const response = await patchCode(id, {
      id: "code_other",
      destinationUrl: "https://example.com/path-id",
    });
    expect(response.status).toBe(200);
    expect((await json(response)).data?.id).toBe(id);
  });

  it("signed out, someone else's code, or nothing to change", async () => {
    const id = await made();
    state.session = null;
    const signedOut = await patchCode(id, {
      destinationUrl: "https://example.com/x",
    });
    expect(signedOut.status).toBe(401);
    expect((await json(signedOut)).error?.code).toBe("UNAUTHORIZED");

    state.session = { userId: "u_bob", organizationId: null };
    fakeDb.seed("user", [{ id: "u_bob", banned: false, banExpires: null }]);
    const theirs = await patchCode(id, {
      destinationUrl: "https://example.com/x",
    });
    expect(theirs.status).toBe(404);
    expect((await json(theirs)).error?.code).toBe("NOT_FOUND");
    expect(fakeDb.find("qrCode", { id })?.destinationUrl).toBe(
      "https://example.com/old",
    );

    signIn();
    const empty = await patchCode(id, {});
    expect(empty.status).toBe(400);
    expect((await json(empty)).error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Nothing to update",
    });
  });
});

describe("POST /api/barcodes (Save to dashboard)", () => {
  it("signed out: the action's UNAUTHORIZED, as a 401", async () => {
    const response = await saveOne(BARCODE);
    expect(response.status).toBe(401);
    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to save barcodes." },
    });
    expect(body).toEqual(await saveBarcode(BARCODE as never));
    expect(fakeDb.rows("barcode")).toHaveLength(0);
  });

  it("signed in: saves it to the workspace and says which one", async () => {
    signIn();
    const response = await saveOne({
      ...BARCODE,
      options: { scale: 3 },
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: expect.any(String),
      title: null,
      workspace: { slug: expect.any(String), name: expect.any(String) },
    });
    const row = fakeDb.find("barcode", { id: body.data?.id as string });
    expect(row).toMatchObject({
      userId: "u_alice",
      organizationId: ownWorkspaceId("u_alice"),
      format: "code128",
      value: "QRDX-1",
    });
    expect(state.audit.length).toBeGreaterThan(0);
  });

  it("the plan's saved-barcode limit: the action's LIMIT_REACHED, as a 402", async () => {
    signIn();
    const limit = getPlanLimits("free").savedBarcodes;
    fakeDb.seed(
      "barcode",
      Array.from({ length: limit }, (_, index) => ({
        id: `bc_${index}`,
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        format: "code128",
        value: `V${index}`,
      })),
    );
    const over = await saveOne(BARCODE);
    expect(over.status).toBe(402);
    expect((await json(over)).error?.code).toBe("LIMIT_REACHED");
    expect(fakeDb.rows("barcode")).toHaveLength(limit);
  });

  it("keeps the action's validation and rate limit", async () => {
    signIn();
    const bad = { format: "ean13", value: "not a number", title: null };
    const invalid = await saveOne(bad);
    expect(invalid.status).toBe(400);
    expect(await json(invalid)).toEqual(await saveBarcode(bad as never));

    state.rateLimited = true;
    const limited = await saveOne(BARCODE);
    expect(limited.status).toBe(429);
    expect((await json(limited)).error?.code).toBe("RATE_LIMITED");
    expect(fakeDb.rows("barcode")).toHaveLength(0);
  });
});
