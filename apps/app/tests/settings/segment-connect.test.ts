// Connecting Segment with a source's write key (connectWithApiKeyAction):
// Segment gets the account's scans and form answers, so it asks "Confirm it's
// you" first, like the data-out sign-ins. Segment answers 200 to any key, so
// QRdx checks the format and, where calls to connected tools are allowed,
// that the Tracking API answers (an empty batch); then the key is stored
// encrypted and never returned. A replaced key keeps the connection's
// settings and streams. The confirmation is the real one on
// in-memory tables (tests/support/fake-db.ts); fetch is faked.
import { decryptApiKey, initializeIntegrations } from "@repo/integrations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

const state = vi.hoisted(() => ({ callsAllowed: true }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { id: "session_1", createdAt: new Date() },
      }),
    },
  },
}));
// Codes can be emailed here, so a sign-in just now doesn't count on its own.
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/connected-accounts/server", () => ({
  connectLimiter: {},
  getConnection: async () => null,
  getSessionUserId: async () => "user_1",
}));
vi.mock("@/lib/data-connections/server", () => ({
  dataCallsAllowed: () => state.callsAllowed,
}));
vi.mock("@/lib/integration-oauth", () => ({
  isIntegrationConfigured: () => true,
}));
vi.mock("@/lib/i18n/settings-action-text", async () => {
  const { createTranslator } = await import("use-intl/core");
  const en = (await import("@/messages/en.json")).default;
  return {
    settingsActionText: (namespace: string) => async () =>
      createTranslator({ locale: "en", messages: en, namespace } as never),
  };
});

const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const { connectSendsDataOut } = await import(
  "@/lib/data-connections/connect-confirmation"
);
const { connectWithApiKeyAction } = await import(
  "@/app/(app)/settings/integrations/connected-account-actions"
);

// The app registers the integrations where connected-accounts/server loads.
initializeIntegrations();

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };
let fetched: Array<{ url: string; body: string }> = [];

const confirm = () =>
  recordConfirmation({ userId: "user_1", sessionId: "session_1" });

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: "user_1", email: "ada@qrdx.test", twoFactorEnabled: false },
  ]);
  state.callsAllowed = true;
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      fetched.push({ url: String(input), body: String(init.body) });
      return new Response('{"success":true}', { status: 200 });
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connecting Segment with a write key", () => {
  it("sends data out, so it asks Confirm it's you first", async () => {
    expect(connectSendsDataOut("segment")).toBe(true);
    expect(await connectWithApiKeyAction("segment", KEY)).toEqual(REQUIRED);
    expect(fetched).toEqual([]);
    expect(fakeDb.rows("integration")).toEqual([]);
  });

  it("then checks that Segment answers and stores the key encrypted", async () => {
    await confirm();
    expect(await connectWithApiKeyAction("segment", KEY)).toEqual({
      ok: true,
    });
    // An empty batch: nothing is recorded in the source
    expect(fetched).toEqual([
      { url: "https://api.segment.io/v1/batch", body: expect.any(String) },
    ]);
    expect(JSON.parse(fetched[0]?.body ?? "")).toMatchObject({ batch: [] });
    const [row] = fakeDb.rows("integration");
    expect(row).toMatchObject({
      userId: "user_1",
      provider: "segment",
      status: "active",
      refreshToken: null,
      metadata: {},
    });
    expect(row?.accessToken).not.toContain(KEY);
    expect(decryptApiKey(String(row?.accessToken))).toBe(KEY);
  });

  it("checks only the format where calls to connected tools are off", async () => {
    state.callsAllowed = false;
    await confirm();
    expect(await connectWithApiKeyAction("segment", KEY)).toEqual({
      ok: true,
    });
    expect(fetched).toEqual([]);
    expect(fakeDb.rows("integration")).toHaveLength(1);
  });

  it("refuses a key that can't be a write key, without quoting it", async () => {
    await confirm();
    const bad = "not:a-segment-write-key!!";
    const result = await connectWithApiKeyAction("segment", bad);
    expect(result).toEqual({
      ok: false,
      error:
        "That doesn't look like a Segment write key. Copy it from your source's Settings → API Keys.",
    });
    expect(JSON.stringify(result)).not.toContain(bad);
    expect(fetched).toEqual([]);
    expect(fakeDb.rows("integration")).toEqual([]);
  });

  it("replaces the key and keeps the region, event names and streams", async () => {
    const metadata = {
      settings: { region: "eu", scanEvent: "Menu Scanned" },
      scansSync: { enabled: true, status: "ok", delivered: 12 },
    };
    fakeDb.seed("integration", [
      {
        id: "int_1",
        userId: "user_1",
        provider: "segment",
        accessToken: "old",
        refreshToken: null,
        metadata,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await confirm();
    const replacement = "ZyXwVuTsRqPoNmLkJiHgFeDcBa987654";
    expect(await connectWithApiKeyAction("segment", replacement)).toEqual({
      ok: true,
    });
    const rows = fakeDb.rows("integration");
    expect(rows).toHaveLength(1);
    expect(decryptApiKey(String(rows[0]?.accessToken))).toBe(replacement);
    expect(rows[0]?.metadata).toEqual(metadata);
  });

  it("says so when Segment can't be reached, and stores nothing", async () => {
    await confirm();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await connectWithApiKeyAction("segment", KEY);
    expect(result).toEqual({
      ok: false,
      error:
        "Segment couldn't be reached. Check your connection and try again.",
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(fakeDb.rows("integration")).toEqual([]);
  });
});
