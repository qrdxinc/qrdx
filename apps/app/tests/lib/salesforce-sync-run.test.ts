// The data-out worker with Salesforce, end to end through the real worker
// loop, sink and client:
// - the batches of one run share one email → lead id map, so a response in
//   the next batch updates the lead the previous batch created; a new run
//   looks the email up again;
// - a 401 refreshes the token on the host the org signed in on, stores it
//   encrypted, and retries; a refused refresh marks the connection for
//   "Reconnect" with a readable reason;
// - a rejected record stops the stream with Salesforce's reason.
// The database is a recorder (no queries run), the response loader is a
// queue, and Salesforce is a stubbed fetch.
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Fragment {
  text: string;
  values: unknown[];
}

const state = vi.hoisted(() => ({
  batches: [] as unknown[][],
  metadata: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  connection: {} as Record<string, unknown>,
}));

vi.mock("next/server", () => ({ after: (task: () => unknown) => task() }));
vi.mock("drizzle-orm", () => ({
  and: () => ({}),
  eq: () => ({}),
  inArray: () => ({}),
  sql: (strings: TemplateStringsArray, ...values: unknown[]): Fragment => ({
    text: strings.join("?"),
    values,
  }),
}));
vi.mock("@repo/database", () => {
  const rows = () => [
    {
      id: "int_sf",
      userId: "user_1",
      provider: "salesforce",
      metadata: structuredClone(state.metadata),
    },
  ];
  const database = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => rows() }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push(values);
          const done = Promise.resolve(undefined);
          return {
            // biome-ignore lint/suspicious/noThenProperty: an awaitable query builder
            then: done.then.bind(done),
            returning: async () => [{ id: "int_sf" }],
          };
        },
      }),
    }),
  };
  return { database, integration: {} };
});
vi.mock("@/lib/connected-accounts/server", () => ({
  getConnection: async () => state.connection,
  getIntegrationConfig: () => ({
    clientId: "sf_client_test",
    clientSecret: "sf_secret_test",
  }),
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => undefined,
}));
vi.mock("@/lib/data-connections/server", () => ({
  dataCallsAllowed: () => true,
}));
vi.mock("@/lib/data-connections/data", () => ({
  loadScans: async () => [],
  syncPauseReason: async () => null,
  loadResponses: async () => state.batches.shift() ?? [],
}));

const { runIntegrationSyncs } = await import("@/lib/data-connections/sync");

const INSTANCE = "https://acme--uat.sandbox.my.salesforce.com";
const MOVED = "https://acme--uat2.sandbox.my.salesforce.com";
const LEAD = "00Q5g00000AbCdEAAA";

let seq = 0;
const response = (email: string | null, phone?: string) => {
  seq++;
  const answers = [
    ...(email
      ? [{ id: "e", label: "Email", type: "email", value: email, text: email }]
      : [{ id: "n", label: "Name", type: "text", value: "Ada", text: "Ada" }]),
    ...(phone
      ? [{ id: "p", label: "Phone", type: "phone", value: phone, text: phone }]
      : []),
  ];
  return {
    id: `resp_${seq}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, seq)).toISOString(),
    pageId: "page_1",
    pageTitle: "Spring",
    formId: "form_1",
    codeSlug: null,
    answers,
  };
};

interface Call {
  method: string;
  url: URL;
  auth: string | null;
  body: string;
}
let calls: Call[] = [];
let replies: Array<(call: Call) => Response> = [];

const json = (body: unknown, status = 200) => Response.json(body, { status });
const noLeads = () => json({ done: true, totalSize: 0, records: [] });
const created = () => json([{ id: LEAD, success: true, errors: [] }]);

beforeEach(() => {
  seq = 0;
  calls = [];
  replies = [];
  state.batches = [];
  state.updates = [];
  state.metadata = {
    name: "acme--uat.sandbox.my.salesforce.com",
    instanceUrl: INSTANCE,
    oauthVariant: "sandbox",
    settings: { pageIds: null, forms: {}, leadSource: "Web" },
    sync: initialSyncState(null, new Date("2026-10-31T00:00:00.000Z")),
  };
  state.connection = {
    id: "int_sf",
    status: "active",
    accessToken: "sf_access_old",
    refreshToken: "sf_refresh_old",
    metadata: state.metadata,
  };
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: (init?.method ?? "GET").toUpperCase(),
        url: new URL(String(input)),
        auth: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? init.body : "",
      };
      calls.push(call);
      const reply = replies.shift();
      if (!reply) throw new Error(`Unexpected ${call.method} ${call.url}`);
      return reply(call);
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every JSON sync state the worker wrote, oldest first. */
function syncStates(): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.startsWith('{"enabled"')) {
      found.push(JSON.parse(value));
    } else if (value && typeof value === "object" && "values" in value) {
      for (const inner of (value as Fragment).values) visit(inner);
    }
  };
  for (const update of state.updates) visit(update.metadata);
  return found;
}

describe("the data-out worker and Salesforce", () => {
  it("shares the email → lead map across a run's batches, and starts afresh each run", async () => {
    // A full batch (500 read: more may follow) with one email, then the same
    // email again in the next batch.
    state.batches = [
      [
        response("ada@example.com", "1"),
        ...Array.from({ length: 499 }, () => response(null)),
      ],
      [response("ada@example.com", "2")],
    ];
    replies = [noLeads, created, () => json([{ id: LEAD, success: true }])];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 1, ok: 1, failed: 0 });
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "PATCH"]);
    expect(JSON.parse(calls[2]?.body ?? "{}").records).toEqual([
      { attributes: { type: "Lead" }, id: LEAD, Phone: "2" },
    ]);
    expect(calls.every((call) => call.url.origin === INSTANCE)).toBe(true);
    expect(syncStates().at(-1)).toMatchObject({
      status: "ok",
      delivered: 2,
      skipped: 499,
    });

    // The next run looks the email up again before writing.
    calls = [];
    state.batches = [[response("ada@example.com", "3")]];
    replies = [
      () =>
        json({ done: true, records: [{ Id: LEAD, Email: "ada@example.com" }] }),
      () => json([{ id: LEAD, success: true }]),
    ];
    await runIntegrationSyncs();
    expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH"]);
  });

  it("refreshes an expired token on the sandbox host, stores it encrypted, and retries", async () => {
    state.batches = [[response("ada@example.com")]];
    replies = [
      () =>
        json(
          [
            {
              errorCode: "INVALID_SESSION_ID",
              message: "Session expired or invalid",
            },
          ],
          401,
        ),
      () =>
        json({
          access_token: "sf_access_fresh",
          refresh_token: "sf_refresh_rotated",
          instance_url: MOVED,
          token_type: "Bearer",
        }),
      noLeads,
      created,
    ];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ ok: 1, failed: 0 });
    expect(calls[1]?.url.href).toBe(
      "https://test.salesforce.com/services/oauth2/token",
    );
    const form = new URLSearchParams(calls[1]?.body);
    expect(form.get("refresh_token")).toBe("sf_refresh_old");
    expect(calls[2]?.auth).toBe("Bearer sf_access_fresh");
    expect(calls[2]?.url.origin).toBe(MOVED);

    const stored = state.updates.find((update) => "accessToken" in update);
    expect(stored?.accessToken).toEqual(expect.stringMatching(/^v2:/));
    expect(String(stored?.accessToken)).not.toContain("sf_access_fresh");
    expect(String(stored?.refreshToken)).not.toContain("sf_refresh_rotated");
    // Only metadata.instanceUrl is set, so the sync state is left alone.
    const metadata = stored?.metadata as Fragment;
    expect(metadata.text).toContain("'{instanceUrl}'");
    expect(metadata.values).toContain(MOVED);
  });

  it("asks for a reconnect when Salesforce refuses the refresh", async () => {
    state.batches = [[response("ada@example.com")]];
    replies = [
      () =>
        json([{ errorCode: "INVALID_SESSION_ID", message: "expired" }], 401),
      () =>
        json(
          {
            error: "invalid_grant",
            error_description: "expired access/refresh token",
          },
          400,
        ),
    ];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ ok: 0, failed: 1 });
    expect(state.updates).toContainEqual(
      expect.objectContaining({ status: "error" }),
    );
    expect(syncStates().at(-1)).toMatchObject({
      status: "failed",
      lastError:
        "Salesforce: the connection was revoked or expired; reconnect Salesforce",
    });
  });

  it("stops the stream with Salesforce's reason when a lead is rejected", async () => {
    state.batches = [[response("ada@example.com")]];
    replies = [
      noLeads,
      () =>
        json([
          {
            success: false,
            errors: [
              {
                statusCode: "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST",
                message:
                  "Lead Source: bad value for restricted picklist field: Web",
                fields: ["LeadSource"],
              },
            ],
          },
        ]),
    ];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    const last = syncStates().at(-1);
    expect(last).toMatchObject({ status: "failed", attempts: 1 });
    expect(last?.lastError).toContain(
      "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: LeadSource",
    );
    // The connection itself is fine: no Reconnect.
    expect(state.updates).not.toContainEqual(
      expect.objectContaining({ status: "error" }),
    );
  });
});
