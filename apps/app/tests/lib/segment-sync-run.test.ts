// The data-out worker and Segment, whose one connection carries two streams:
// scans (metadata.scansSync) and form responses (metadata.responsesSync).
// Each has its own lease, cursor, retries and event name, so one failing
// never holds the other back, and a trigger runs only the stream it's for.
// The database, the connection and the loaders are fakes; the worker loop
// and the Segment sink are the real ones, with fetch faked. The fake `sql`
// keeps each statement's text and values, so the test can read the writes.

import type { SyncState } from "@repo/integrations";
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SqlFragment {
  text: string;
  values: unknown[];
}

const KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

const state = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  scans: [] as unknown[][],
  responses: [] as unknown[][],
  scanReads: [] as unknown[],
  responseReads: [] as unknown[],
  writes: [] as SqlFragment[],
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
              id: "3f2b9c1e-7a4d-4e8b-9c0f-1d2e3f4a5b6c",
              userId: "user_1",
              provider: "segment",
              metadata: structuredClone(state.metadata),
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: { metadata?: SqlFragment }) => ({
        where: () => {
          if (values.metadata) state.writes.push(values.metadata);
          const done = Promise.resolve(undefined);
          return {
            // biome-ignore lint/suspicious/noThenProperty: an awaited query builder
            then: done.then.bind(done),
            returning: async () => [{ id: "int_1" }],
          };
        },
      }),
    }),
  };
  return { database, integration: {} };
});
vi.mock("@/lib/connected-accounts/server", () => ({
  getConnection: async () => ({ status: "active", accessToken: KEY }),
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => undefined,
}));
vi.mock("@/lib/data-connections/server", () => ({
  dataCallsAllowed: () => true,
}));
vi.mock("@/lib/data-connections/data", () => ({
  syncPauseReason: async () => null,
  loadScans: async (_scope: unknown, options: unknown) => {
    state.scanReads.push(options);
    return state.scans.shift() ?? [];
  },
  loadResponses: async (_scope: unknown, options: unknown) => {
    state.responseReads.push(options);
    return state.responses.shift() ?? [];
  },
}));

const { runIntegrationSyncs, nextIntegrationSyncDueAt } = await import(
  "@/lib/data-connections/sync"
);

const scan = (n: number) => ({
  id: `scan_${n}`,
  scannedAt: `2026-11-25T09:0${n}:00.000Z`,
  code: { id: "code_1", slug: "aB3dE5f", title: "Spring menu" },
  country: "DE",
  city: "Berlin",
  deviceType: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: null,
  language: "de-de",
  region: "BE",
  variant: null,
  source: "qr",
});
const response = (n: number) => ({
  id: `resp_${n}`,
  createdAt: `2026-11-25T10:0${n}:00.000Z`,
  pageId: "page_1",
  pageTitle: "Spring menu",
  formId: "form_1",
  codeSlug: null,
  answers: [
    {
      id: "f_email",
      label: "Email",
      type: "email",
      value: "ada@example.com",
      text: "ada@example.com",
    },
  ],
});

interface Call {
  url: string;
  authorization: string | null;
  body: { batch: Array<{ event: string; messageId: string }> };
}
let calls: Call[] = [];

/** Answers each Segment request in turn with these statuses. */
function segmentAnswers(...statuses: number[]) {
  const queue = [...statuses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init.headers).get("authorization"),
        body: JSON.parse(String(init.body)),
      });
      const status = queue.shift() ?? 200;
      return new Response(JSON.stringify({ success: status === 200 }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** A statement's string values, nested fragments included, in order. */
function strings(fragment: SqlFragment): string[] {
  return fragment.values.flatMap((value) =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object" && "values" in value
        ? strings(value as SqlFragment)
        : [],
  );
}

/** Each stream's last written state, by its metadata key. */
function lastStates(): Record<string, SyncState> {
  const out: Record<string, SyncState> = {};
  for (const write of state.writes) {
    const values = strings(write);
    const path = values.find((value) => /^\{\w+\}$/.test(value));
    const json = values.find((value) => value.startsWith('{"enabled"'));
    if (path && json) out[path.slice(1, -1)] = JSON.parse(json);
  }
  return out;
}

const claimedPaths = () =>
  state.writes.flatMap((write) =>
    strings(write).filter((value) => value.endsWith(",leaseUntil}")),
  );

const at = (iso: string) => initialSyncState(null, new Date(iso));

beforeEach(() => {
  calls = [];
  state.scans = [];
  state.responses = [];
  state.scanReads = [];
  state.responseReads = [];
  state.writes = [];
  state.metadata = {
    settings: {
      region: "eu",
      scanEvent: "Menu Scanned",
      responseEvent: "Lead Captured",
    },
    scansSync: at("2026-11-25T08:00:00.000Z"),
    responsesSync: at("2026-11-25T07:00:00.000Z"),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the data-out worker and Segment", () => {
  it("runs both streams, each from its own cursor with its own event name", async () => {
    state.scans = [[scan(1), scan(2)]];
    state.responses = [[response(1)]];
    segmentAnswers(200, 200);

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 2, ok: 2, failed: 0 });
    expect(state.scanReads).toEqual([
      {
        codeId: null,
        cursor: { at: "2026-11-25T08:00:00.000Z", id: "" },
        limit: 500,
      },
    ]);
    expect(state.responseReads).toEqual([
      {
        pageIds: null,
        cursor: { at: "2026-11-25T07:00:00.000Z", id: "" },
        limit: 500,
      },
    ]);
    // The workspace's region, the key as Basic auth
    expect(calls.map((call) => call.url)).toEqual([
      "https://events.eu1.segmentapis.com/v1/batch",
      "https://events.eu1.segmentapis.com/v1/batch",
    ]);
    expect(calls[0]?.authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`,
    );
    expect(calls[0]?.body.batch.map((event) => event.event)).toEqual([
      "Menu Scanned",
      "Menu Scanned",
    ]);
    expect(calls[1]?.body.batch.map((event) => event.event)).toEqual([
      "Lead Captured",
    ]);
    // Each cursor moves past its own stream's items only
    const states = lastStates();
    expect(states.scansSync?.cursor).toEqual({
      at: "2026-11-25T09:02:00.000Z",
      id: "scan_2",
    });
    expect(states.scansSync?.delivered).toBe(2);
    expect(states.responsesSync?.cursor).toEqual({
      at: "2026-11-25T10:01:00.000Z",
      id: "resp_1",
    });
    expect(states.responsesSync?.status).toBe("ok");
  });

  it("takes each stream's lease and writes its state under its own key", async () => {
    state.scans = [[scan(1)]];
    state.responses = [[response(1)]];
    segmentAnswers(200, 200);
    await runIntegrationSyncs();

    expect(claimedPaths()).toEqual([
      "{scansSync,leaseUntil}",
      "{responsesSync,leaseUntil}",
    ]);
    expect(Object.keys(lastStates()).sort()).toEqual([
      "responsesSync",
      "scansSync",
    ]);
    // metadata.sync, the other sinks' key, is never written
    expect(
      state.writes.some((write) =>
        strings(write).some((value) => value.startsWith("{sync")),
      ),
    ).toBe(false);
  });

  it("retries a failing stream on its own, without holding the other back", async () => {
    state.scans = [[scan(1)]];
    state.responses = [[response(1)]];
    segmentAnswers(503, 200);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 2, ok: 1, failed: 1 });
    const states = lastStates();
    expect(states.scansSync).toMatchObject({
      status: "retrying",
      attempts: 1,
      lastError: "the service had an error (HTTP 503)",
      cursor: { at: "2026-11-25T08:00:00.000Z", id: "" },
    });
    expect(states.scansSync?.nextAttemptAt).not.toBeNull();
    expect(states.responsesSync).toMatchObject({ status: "ok", delivered: 1 });
    // The failure is logged with its stream, and never with the key
    const logged = errors.mock.calls.flat().join("\n");
    expect(logged).toContain('"stream":"scans"');
    expect(logged).not.toContain(KEY);
    expect(JSON.stringify(state.writes)).not.toContain(KEY);
  });

  it("runs only the stream a trigger is for", async () => {
    state.scans = [[scan(1)]];
    state.responses = [[response(1)]];
    segmentAnswers(200);

    const summary = await runIntegrationSyncs({ stream: "responses" });

    expect(summary).toMatchObject({ streams: 1, ok: 1 });
    expect(state.scanReads).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(claimedPaths()).toEqual(["{responsesSync,leaseUntil}"]);
  });

  it("leaves a stream that is off alone", async () => {
    state.metadata.responsesSync = {
      ...at("2026-11-25T07:00:00.000Z"),
      enabled: false,
      status: "paused",
    };
    state.scans = [[scan(1)]];
    segmentAnswers(200);

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 1, ok: 1 });
    expect(state.responseReads).toEqual([]);
  });

  it("sends a retried batch with the same messageIds", async () => {
    state.scans = [
      [scan(1), scan(2)],
      [scan(1), scan(2)],
    ];
    state.metadata.responsesSync = undefined;
    segmentAnswers(503, 200);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runIntegrationSyncs();
    // As "Retry now" would: the same scans again
    state.metadata.scansSync = at("2026-11-25T08:00:00.000Z");
    await runIntegrationSyncs();

    const [first, second] = calls.map((call) =>
      call.body.batch.map((event) => event.messageId),
    );
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it("is due again at the earliest retry or lease of either stream", async () => {
    state.metadata.scansSync = {
      ...at("2026-11-25T08:00:00.000Z"),
      status: "retrying",
      nextAttemptAt: "2026-11-25T12:00:00.000Z",
    };
    state.metadata.responsesSync = {
      ...at("2026-11-25T07:00:00.000Z"),
      leaseUntil: "2026-11-25T11:00:00.000Z",
    };
    expect(await nextIntegrationSyncDueAt()).toBe(
      Date.parse("2026-11-25T11:00:00.000Z"),
    );
  });
});
