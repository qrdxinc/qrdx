// /api/integrations/sync/<provider> (stream settings) and its /pages list for
// the form-response integrations: Pipedrive is one of them, with its own
// "also add a lead" setting; other providers never get it, and a provider
// that isn't a data-out integration is a 404. Segment has its own settings
// (a region and two streams), a test event and "Retry now" per stream. The
// database work is replaced by fakes that record their calls.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  saved: [] as Array<{ provider: string; input: Record<string, unknown> }>,
  listed: [] as string[],
  retried: [] as unknown[][],
  tested: [] as unknown[][],
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
  retrySync: async (...args: unknown[]) => {
    state.retried.push(args);
    return {};
  },
  setSheetSync: async () => undefined,
  saveSegmentSink: async (_scope: unknown, input: Record<string, unknown>) => {
    state.saved.push({ provider: "segment", input });
  },
  sendSegmentTest: async (...args: unknown[]) => {
    state.tested.push(args);
  },
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

const post = (provider: string, body: unknown) =>
  sync.POST(
    new Request(`http://localhost/api/integrations/sync/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(provider),
  );

const SETTINGS = { enabled: true, pageIds: null, forms: {} };

beforeEach(() => {
  state.saved.length = 0;
  state.listed.length = 0;
  state.retried.length = 0;
  state.tested.length = 0;
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

describe("Segment on /api/integrations/sync/segment", () => {
  const SEGMENT = {
    region: "eu",
    scans: { enabled: true, event: "Menu Scanned" },
    responses: { enabled: false, event: "Form Submitted" },
  };

  it("saves the region and both streams", async () => {
    const response = await put("segment", SEGMENT);
    expect(response.status).toBe(200);
    expect(state.saved).toEqual([{ provider: "segment", input: SEGMENT }]);
  });

  it.each([
    ["an unknown region", { ...SEGMENT, region: "apac" }],
    [
      "an event name over 200 characters",
      { ...SEGMENT, scans: { enabled: true, event: "x".repeat(201) } },
    ],
    ["a missing stream", { region: "us", scans: SEGMENT.scans }],
    ["the form-response settings", SETTINGS],
  ])("refuses %s, and saves nothing", async (_case, body) => {
    expect((await put("segment", body)).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("sends a test event, to the region picked", async () => {
    const response = await post("segment", { action: "test", region: "us" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(state.tested).toEqual([["user_1", "us"]]);
  });

  it("sends no test event for another provider", async () => {
    expect((await post("hubspot", { action: "test" })).status).toBe(400);
    expect(state.tested).toEqual([]);
  });

  it("retries the stream asked for", async () => {
    expect(
      (await post("segment", { action: "retry", stream: "responses" })).status,
    ).toBe(200);
    expect((await post("hubspot", { action: "retry" })).status).toBe(200);
    expect(state.retried).toEqual([
      ["user_1", "segment", "responses"],
      ["user_1", "hubspot", undefined],
    ]);
  });

  it("refuses an unknown stream or action", async () => {
    expect(
      (await post("segment", { action: "retry", stream: "clicks" })).status,
    ).toBe(400);
    expect((await post("segment", { action: "delete" })).status).toBe(400);
    expect(state.retried).toEqual([]);
  });
});

describe("the other integrations on these routes", () => {
  it("still save HubSpot's settings", async () => {
    expect((await put("hubspot", SETTINGS)).status).toBe(200);
    expect(state.saved[0]?.provider).toBe("hubspot");
  });

  it("save Zoho CRM's pages and mapping, like HubSpot's", async () => {
    const forms = {
      "page_1:form_1": { fields: { f1: "email", f2: "Last_Name" } },
    };
    const response = await put("zoho-crm", { ...SETTINGS, forms });
    expect(response.status).toBe(200);
    expect(state.saved).toEqual([
      { provider: "zoho-crm", input: { ...SETTINGS, forms } },
    ]);
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

  it("lists a workspace's form pages for Zoho CRM", async () => {
    const response = await list("zoho-crm");
    expect(response.status).toBe(200);
    expect(state.listed).toEqual([""]);
  });

  it("answers 404 for a provider that sends no form responses", async () => {
    expect((await list("google-sheets")).status).toBe(404);
    expect(state.listed).toEqual([]);
  });
});
