// The data-out worker and Zoho CRM: a batch of form responses goes to the
// data centre the connection was made in, with the stream's mapping; a
// connection without a known data centre sends nothing and asks for a
// reconnect; a lead Zoho refuses for a field QRdx doesn't fill stops the
// stream with a reason the settings panel can show.
// The database, the connection and the response loader are fakes, and Zoho
// is a stubbed fetch; the worker loop and the Zoho client are the real ones.
// The fake `sql` keeps each statement's values, so the test can read what the
// worker wrote.
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface SqlFragment {
  text: string;
  values: unknown[];
}

const state = vi.hoisted(() => ({
  batches: [] as unknown[][],
  metadata: {} as Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>,
  requests: [] as Array<{ url: string; body: unknown; auth: string | null }>,
  answer: null as null | (() => Response),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => task() }));
vi.mock("drizzle-orm", () => {
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment => ({
      text: strings.join("?"),
      values,
    }),
    { raw: () => ({ text: "", values: [] }) },
  );
  return {
    and: () => ({}),
    eq: () => ({}),
    inArray: () => ({}),
    or: () => ({}),
    sql,
  };
});
vi.mock("@repo/database", () => {
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "int_1",
              userId: "user_1",
              provider: "zoho-crm",
              metadata: structuredClone(state.metadata),
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.writes.push(values);
          const done = Promise.resolve(undefined);
          return {
            // biome-ignore lint/suspicious/noThenProperty: an awaited query builder
            then: done.then.bind(done),
            // The stream is on throughout (a run's write reads its switch back)
            returning: async () => [{ id: "int_1", enabled: "true" }],
          };
        },
      }),
    }),
  };
  return { database, integration: {} };
});
vi.mock("@/lib/connected-accounts/server", () => ({
  getConnection: async () => ({
    status: "active",
    accessToken: "zoho-token",
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

function formResponse(index: number, answers: Array<[string, string, string]>) {
  return {
    id: `resp_${index}`,
    createdAt: new Date(Date.UTC(2026, 10, 28, 9, 0, index)).toISOString(),
    pageId: "page_1",
    pageTitle: "Open day",
    formId: "form_1",
    codeSlug: null,
    answers: answers.map(([id, label, text]) => ({
      id,
      label,
      type: id === "email" ? "email" : "text",
      value: text,
      text,
    })),
  };
}

/** Every value in a statement, its nested fragments included. */
function valuesOf(value: unknown): unknown[] {
  const fragment = value as SqlFragment | undefined;
  return Array.isArray(fragment?.values)
    ? fragment.values.flatMap(valuesOf)
    : [value];
}

/** The sync states the worker wrote, as JSON it merged into metadata.sync. */
const syncWrites = () =>
  state.writes.flatMap((values) =>
    valuesOf(values.metadata).flatMap((value) =>
      typeof value === "string" && value.includes('"lastAttemptAt"')
        ? [JSON.parse(value) as Record<string, unknown>]
        : [],
    ),
  );

beforeEach(() => {
  state.batches = [];
  state.writes = [];
  state.requests = [];
  state.answer = null;
  state.metadata = {
    name: "Zoho CRM (EU data centre)",
    apiDomain: "https://www.zohoapis.eu",
    dataCentre: "eu",
    oauthTokenOrigin: "https://accounts.zoho.eu",
    settings: {
      pageIds: null,
      forms: {
        "page_1:form_1": {
          fields: { email: "email", name: "__fullname", city: "City" },
        },
      },
    },
    sync: initialSyncState(null),
  };
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      state.requests.push({
        url: String(input),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        auth: new Headers(init?.headers).get("authorization"),
      });
      if (!state.answer) throw new Error(`Unexpected fetch: ${input}`);
      return state.answer();
    },
  );
});

describe("the data-out worker and Zoho CRM", () => {
  it("upserts the batch's leads on the connection's data centre, with the saved mapping", async () => {
    state.batches = [
      [
        formResponse(1, [
          ["email", "Email", "ada@example.com"],
          ["name", "Your name", "Ada Lovelace"],
          ["city", "Town", "London"],
        ]),
        formResponse(2, [
          ["email", "Email", "grace@example.com"],
          ["name", "Your name", "Grace Hopper"],
        ]),
      ],
    ];
    state.answer = () =>
      Response.json({
        data: [
          { code: "SUCCESS", action: "insert", status: "success", details: {} },
          { code: "SUCCESS", action: "update", status: "success", details: {} },
        ],
      });

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 1, ok: 1, failed: 0 });
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0]).toEqual({
      url: "https://www.zohoapis.eu/crm/v8/Leads/upsert",
      auth: "Zoho-oauthtoken zoho-token",
      body: {
        data: [
          {
            Email: "ada@example.com",
            First_Name: "Ada",
            Last_Name: "Lovelace",
            City: "London",
          },
          {
            Email: "grace@example.com",
            First_Name: "Grace",
            Last_Name: "Hopper",
          },
        ],
        duplicate_check_fields: ["Email"],
      },
    });
    expect(syncWrites().at(-1)).toMatchObject({
      status: "ok",
      delivered: 2,
      lastError: null,
      cursor: { id: "resp_2" },
    });
  });

  it("sends nothing without a known data centre, and asks for a reconnect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.metadata = { ...state.metadata, apiDomain: "https://evil.example" };
    state.batches = [
      [formResponse(1, [["email", "Email", "ada@example.com"]])],
    ];

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(state.requests).toEqual([]);
    expect(state.writes).toContainEqual(
      expect.objectContaining({ status: "error" }),
    );
    expect(syncWrites().at(-1)).toMatchObject({
      status: "failed",
      lastError:
        "the connection was rejected; reconnect the account (HTTP 401)",
    });
  });

  it("stops on a missing scope without sending the row to Reconnect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.batches = [
      [formResponse(1, [["email", "Email", "ada@example.com"]])],
    ];
    state.answer = () =>
      Response.json(
        { code: "OAUTH_SCOPE_MISMATCH", details: {}, status: "error" },
        { status: 401 },
      );

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(syncWrites().at(-1)).toMatchObject({
      status: "failed",
      lastError:
        "Zoho CRM: QRdx's access doesn't include this for leads (OAUTH_SCOPE_MISMATCH)",
    });
    // Reconnecting would get the same scope: the row stays active
    expect(state.writes).not.toContainEqual(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("stops the stream with Zoho's reason when a lead needs a field QRdx doesn't fill", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.batches = [
      [
        formResponse(1, [
          ["email", "Email", "ada@example.com"],
          ["name", "Your name", "Ada Lovelace"],
        ]),
      ],
    ];
    state.answer = () =>
      Response.json(
        {
          data: [
            {
              code: "MANDATORY_NOT_FOUND",
              details: { api_name: "Company", json_path: "$.data[0].Company" },
              message: "required field not found",
              status: "error",
            },
          ],
        },
        { status: 400 },
      );

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(syncWrites().at(-1)).toMatchObject({
      status: "failed",
      lastError:
        "Zoho CRM: a new lead needs a value for Company; map a question to it or make it optional in Zoho CRM, then retry (MANDATORY_NOT_FOUND)",
    });
    // A refused lead isn't a refused connection
    expect(state.writes).not.toContainEqual(
      expect.objectContaining({ status: "error" }),
    );
  });
});
