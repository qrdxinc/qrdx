// /api/integrations/sync/<provider> (stream settings) and its /pages list for
// the form-response integrations: Pipedrive is one of them, with its own
// "also add a lead" setting; other providers never get it, and a provider
// that isn't a data-out integration is a 404. The database work is replaced
// by fakes that record their calls.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  saved: [] as Array<{ provider: string; input: Record<string, unknown> }>,
  listed: [] as string[],
}));

vi.mock("@/lib/connected-accounts/server", () => ({
  connectLimiter: {},
  providerReadLimiter: {},
  getSessionUserId: async () => "user_1",
  providerErrorResponse: () => new Response(null, { status: 502 }),
}));
vi.mock("@/lib/data-connections/http", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/data-connections/http")>()),
  requireUser: async () => ({ userId: "user_1" }),
}));
vi.mock("@/lib/scope", () => ({
  getActiveScope: async () => ({ userId: "user_1", organizationId: null }),
}));
vi.mock("@/lib/data-connections/settings", () => ({
  getSinkView: async (_scope: unknown, provider: string) => ({ provider }),
  retrySync: async () => ({}),
  setSheetSync: async () => undefined,
  saveResponseSink: async (
    _scope: unknown,
    provider: string,
    input: Record<string, unknown>,
  ) => {
    state.saved.push({ provider, input });
  },
}));
vi.mock("@/lib/data-connections/data", () => ({
  listFormPages: async (_scope: unknown, options: { q?: string }) => {
    state.listed.push(options.q ?? "");
    return { items: [], nextCursor: null };
  },
}));

const sync = await import("@/app/api/integrations/sync/[provider]/route");
const pages = await import(
  "@/app/api/integrations/sync/[provider]/pages/route"
);

const context = (provider: string) => ({
  params: Promise.resolve({ provider }),
});
const put = (provider: string, body: unknown) =>
  sync.PUT(
    new Request(`http://localhost/api/integrations/sync/${provider}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(provider),
  );

const SETTINGS = { enabled: true, pageIds: null, forms: {} };

beforeEach(() => {
  state.saved.length = 0;
  state.listed.length = 0;
});

describe("PUT /api/integrations/sync/pipedrive", () => {
  it("saves the lead setting with the rest of the stream's settings", async () => {
    const response = await put("pipedrive", { ...SETTINGS, createLead: true });
    expect(response.status).toBe(200);
    expect(state.saved).toEqual([
      {
        provider: "pipedrive",
        input: { ...SETTINGS, createLead: true },
      },
    ]);
  });

  it("works without the lead setting", async () => {
    const response = await put("pipedrive", SETTINGS);
    expect(response.status).toBe(200);
    expect(state.saved[0]?.input).not.toHaveProperty("createLead");
  });

  it.each([["yes"], [1], [null], [{}]])(
    "refuses %j as the lead setting, and saves nothing",
    async (createLead) => {
      const response = await put("pipedrive", { ...SETTINGS, createLead });
      expect(response.status).toBe(400);
      expect(state.saved).toEqual([]);
    },
  );

  it("still checks the mapping it saves", async () => {
    const response = await put("pipedrive", {
      ...SETTINGS,
      forms: { "bad key": { fields: {} } },
    });
    expect(response.status).toBe(400);
    expect(state.saved).toEqual([]);
  });
});

describe("the other integrations on these routes", () => {
  it("still save HubSpot's settings", async () => {
    expect((await put("hubspot", SETTINGS)).status).toBe(200);
    expect(state.saved[0]?.provider).toBe("hubspot");
  });

  it.each(["stripe", "slack", "unknown"])(
    "answer 404 for %s, which isn't a data-out stream",
    async (provider) => {
      expect((await put(provider, SETTINGS)).status).toBe(404);
      expect(state.saved).toEqual([]);
    },
  );
});

describe("GET /api/integrations/sync/<provider>/pages", () => {
  const list = (provider: string, query = "") =>
    pages.GET(
      new Request(
        `http://localhost/api/integrations/sync/${provider}/pages${query}`,
      ),
      context(provider),
    );

  it("lists a workspace's form pages for Pipedrive", async () => {
    const response = await list("pipedrive", "?q=menu");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(state.listed).toEqual(["menu"]);
  });

  it("answers 404 for a provider that sends no form responses", async () => {
    expect((await list("google-sheets")).status).toBe(404);
    expect(state.listed).toEqual([]);
  });
});
