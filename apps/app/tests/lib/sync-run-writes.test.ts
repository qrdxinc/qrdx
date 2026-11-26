// What a data-out run writes back (lib/data-connections/sync.ts): only what
// it owns of its stream's state (cursor, retries, lease, outcome), merged into
// the stored state. A stream someone turns off while a run is delivering
// stays off, keeps the run's cursor and gets no further batch; one turned on
// in another workspace meanwhile, or removed, isn't written over. And a
// Segment batch that went out in several requests, of which a later one
// failed, moves the cursor past what was delivered, so the retry doesn't send
// it again.
//
// The database is a fake that applies each statement to the row's metadata
// the way Postgres does (the claim sets its stream's lease; a run's write is
// `stored || fields`, not created when the stream is gone, and only where the
// stream's workspace is still the run's; `returning` reads the switch back).
// The connection and loaders are fakes; the worker loop and the Segment sink
// are the real ones, with fetch faked, and Google Sheets' append is a fake.

import type { SyncState } from "@repo/integrations";
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SqlFragment {
  text: string;
  values: unknown[];
}

const store = vi.hoisted(() => ({
  provider: "segment",
  metadata: {} as Record<string, unknown>,
  scans: [] as unknown[][],
  responses: [] as unknown[][],
  scanReads: [] as unknown[],
  responseReads: [] as unknown[],
  appends: [] as number[],
  pause: null as string | null,
  /** Runs while a batch is being delivered (a request made meanwhile) */
  duringDelivery: null as null | (() => void),
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
    and: (...conditions: unknown[]) => ({ conditions }),
    eq: () => ({}),
    inArray: () => ({}),
    or: () => ({}),
    sql,
  };
});
vi.mock("@repo/database", () => {
  const isFragment = (value: unknown): value is SqlFragment =>
    typeof value === "object" && value !== null && "values" in value;
  const strings = (fragment: SqlFragment): string[] =>
    fragment.values.flatMap((value) =>
      typeof value === "string"
        ? [value]
        : isFragment(value)
          ? strings(value)
          : [],
    );
  const texts = (fragment: SqlFragment): string =>
    [
      fragment.text,
      ...fragment.values.map((value) =>
        isFragment(value) ? texts(value) : "",
      ),
    ].join(" ");
  const streamOf = (key: string) =>
    store.metadata[key] as Record<string, unknown> | undefined;

  /** The workspace condition of a run's write, if it has one. */
  function workspaceHolds(where: unknown): boolean {
    const conditions =
      (where as { conditions?: unknown[] } | undefined)?.conditions ?? [];
    const guard = conditions.find(
      (condition): condition is SqlFragment =>
        isFragment(condition) &&
        condition.text.includes("is not distinct from"),
    );
    if (!guard) return true;
    const [, path, organizationId] = guard.values as [unknown, string, unknown];
    const key = path.slice(1, path.indexOf(","));
    return (streamOf(key)?.organizationId ?? null) === organizationId;
  }

  /** Applies a write to the stored metadata; the key of its stream. */
  function apply(fragment: SqlFragment, where: unknown): string | null {
    const values = strings(fragment);
    const lease = values.findIndex((value) =>
      /^\{\w+,leaseUntil\}$/.test(value),
    );
    if (lease >= 0) {
      const key = (values[lease] as string).slice(1, -12);
      const stream = streamOf(key);
      if (stream) stream.leaseUntil = values[lease + 1];
      return key;
    }
    const path = values.find((value) => /^\{\w+\}$/.test(value));
    if (!path) return null;
    const key = path.slice(1, -1);
    if (!workspaceHolds(where)) return null;
    const [fields, settings] = values
      .filter((value) => value.startsWith('{"'))
      .map((value) => JSON.parse(value) as Record<string, unknown>);
    const stream = streamOf(key);
    // jsonb_set(…, false) doesn't create a key that's gone; without it, it does
    const createMissing = !texts(fragment).includes("?::text[], ?, false)");
    if (fields && (stream || createMissing)) {
      store.metadata[key] = { ...stream, ...fields };
    }
    if (settings) {
      store.metadata.settings = {
        ...(store.metadata.settings as object),
        ...settings,
      };
    }
    return key;
  }

  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "3f2b9c1e-7a4d-4e8b-9c0f-1d2e3f4a5b6c",
              userId: "user_1",
              provider: store.provider,
              metadata: structuredClone(store.metadata),
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: { metadata?: SqlFragment }) => ({
        where: (where: unknown) => {
          const key = values.metadata ? apply(values.metadata, where) : null;
          const done = Promise.resolve(undefined);
          return {
            // biome-ignore lint/suspicious/noThenProperty: an awaited query builder
            then: done.then.bind(done),
            returning: async () => {
              const stream = key ? streamOf(key) : undefined;
              return stream && workspaceHolds(where)
                ? [{ id: "int_1", enabled: String(stream.enabled) }]
                : [];
            },
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
    accessToken: "AbCdEfGhIjKlMnOpQrStUvWxYz012345",
  }),
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => undefined,
}));
vi.mock("@/lib/data-connections/server", () => ({
  dataCallsAllowed: () => true,
}));
vi.mock("@/lib/data-connections/data", () => ({
  syncPauseReason: async () => store.pause,
  loadScans: async (_scope: unknown, options: unknown) => {
    store.scanReads.push(options);
    return store.scans.shift() ?? [];
  },
  loadResponses: async (_scope: unknown, options: unknown) => {
    store.responseReads.push(options);
    return store.responses.shift() ?? [];
  },
}));
vi.mock(
  "@repo/integrations/src/integrations/google-sheets",
  async (importActual) => ({
    ...(await importActual<
      typeof import("@repo/integrations/src/integrations/google-sheets")
    >()),
    createGoogleSheetsClient: () => ({}),
    appendScansToSheet: async (
      _client: unknown,
      target: { rowsWritten: number },
      scans: Array<{ id: string; scannedAt: string }>,
    ) => {
      store.appends.push(scans.length);
      store.duringDelivery?.();
      const last = scans.at(-1);
      return {
        delivered: scans.length,
        skipped: 0,
        cursor: last ? { at: last.scannedAt, id: last.id } : null,
        rowsWritten: target.rowsWritten + scans.length,
      };
    },
  }),
);

const { runIntegrationSyncs } = await import("@/lib/data-connections/sync");

const scan = (n: number) => ({
  id: `scan_${String(n).padStart(4, "0")}`,
  scannedAt: new Date(Date.UTC(2026, 10, 25, 9, 0, n)).toISOString(),
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
/** A full batch: the worker reads on after it. */
const fullBatch = () => Array.from({ length: 500 }, (_, n) => scan(n));

/** A response; a long one is about 26 KB, so ~19 fit in one request. */
const response = (n: number, long = false) => ({
  id: `resp_${String(n).padStart(4, "0")}`,
  createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, n)).toISOString(),
  pageId: "page_1",
  pageTitle: "Spring menu",
  formId: "form_1",
  codeSlug: null,
  answers: Array.from({ length: long ? 25 : 1 }, (_, i) => ({
    id: `f_${i}`,
    label: `Question ${i}`,
    type: "text",
    value: "x".repeat(long ? 1000 : 5),
    text: "x".repeat(long ? 1000 : 5),
  })),
});

const at = (iso: string, organizationId: string | null = "org_1") =>
  initialSyncState(organizationId, new Date(iso));
const stream = (key: string) => store.metadata[key] as SyncState;

/** What the person's "off" writes: the switch, nothing else (settings.ts). */
const turnOff = (key: string) => {
  store.metadata[key] = { ...stream(key), enabled: false, status: "paused" };
};

let sent: string[][] = [];
/** Answers each Segment request in turn with these statuses (then 200). */
function segmentAnswers(...statuses: number[]) {
  const queue = [...statuses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as {
        batch: Array<{ messageId: string }>;
      };
      sent.push(body.batch.map((event) => event.messageId));
      store.duringDelivery?.();
      const status = queue.shift() ?? 200;
      return new Response(JSON.stringify({ success: status === 200 }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  store.provider = "segment";
  store.metadata = {};
  store.scans = [];
  store.responses = [];
  store.scanReads = [];
  store.responseReads = [];
  store.appends = [];
  store.pause = null;
  store.duringDelivery = null;
  sent = [];
  segmentAnswers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a stream turned off while a run delivers", () => {
  it("Google Sheets: stays off, keeps the run's cursor and rows, gets no next batch", async () => {
    store.provider = "google-sheets";
    store.metadata = {
      settings: {
        syncTarget: {
          spreadsheetId: "sheet_1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet_1",
          sheetTitle: "Scans",
          codeId: null,
          rowsWritten: 100,
        },
      },
      sync: at("2026-11-25T08:00:00.000Z"),
    };
    store.scans = [fullBatch(), [scan(600)]];
    store.duringDelivery = () => turnOff("sync");

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 1, ok: 1 });
    expect(stream("sync")).toMatchObject({
      enabled: false,
      status: "ok",
      leaseUntil: null,
      delivered: 500,
      cursor: { id: "scan_0499" },
    });
    expect(
      (store.metadata.settings as { syncTarget: { rowsWritten: number } })
        .syncTarget.rowsWritten,
    ).toBe(600);
    // The next batch is never read
    expect(store.appends).toEqual([500]);
    expect(store.scanReads).toHaveLength(1);
  });

  it("Google Sheets: without a change meanwhile, reads on and stays on", async () => {
    store.provider = "google-sheets";
    store.metadata = {
      settings: {
        syncTarget: {
          spreadsheetId: "sheet_1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet_1",
          sheetTitle: "Scans",
          codeId: null,
          rowsWritten: 0,
        },
      },
      sync: at("2026-11-25T08:00:00.000Z"),
    };
    store.scans = [fullBatch(), [scan(600)]];

    await runIntegrationSyncs();

    expect(store.appends).toEqual([500, 1]);
    expect(stream("sync")).toMatchObject({
      enabled: true,
      status: "ok",
      leaseUntil: null,
      delivered: 501,
      cursor: { id: "scan_0600" },
    });
  });

  it("Segment scans: stay off, while the responses stream goes on", async () => {
    store.metadata = {
      settings: { region: "us" },
      scansSync: at("2026-11-25T08:00:00.000Z"),
      responsesSync: at("2026-11-25T07:00:00.000Z"),
    };
    store.scans = [fullBatch(), [scan(600)]];
    store.responses = [[response(1)]];
    let first = true;
    store.duringDelivery = () => {
      if (first) turnOff("scansSync");
      first = false;
    };

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 2, ok: 2 });
    expect(stream("scansSync")).toMatchObject({
      enabled: false,
      leaseUntil: null,
      delivered: 500,
      cursor: { id: "scan_0499" },
    });
    expect(store.scanReads).toHaveLength(1);
    expect(stream("responsesSync")).toMatchObject({
      enabled: true,
      status: "ok",
      delivered: 1,
      cursor: { id: "resp_0001" },
    });
  });

  it("Segment responses: stay off, while the scans stream stays on", async () => {
    store.metadata = {
      settings: { region: "us" },
      scansSync: at("2026-11-25T08:00:00.000Z"),
      responsesSync: at("2026-11-25T07:00:00.000Z"),
    };
    store.scans = [[scan(1)]];
    store.responses = [[response(1)]];
    store.duringDelivery = () => {
      // The second request is the responses stream's
      if (sent.length === 2) turnOff("responsesSync");
    };

    await runIntegrationSyncs();

    expect(stream("responsesSync")).toMatchObject({
      enabled: false,
      status: "ok",
      leaseUntil: null,
      delivered: 1,
      cursor: { id: "resp_0001" },
    });
    expect(stream("scansSync")).toMatchObject({
      enabled: true,
      status: "ok",
      delivered: 1,
    });
  });
});

describe("what else a run leaves alone", () => {
  it("a stream turned on in another workspace meanwhile", async () => {
    store.metadata = { scansSync: at("2026-11-25T08:00:00.000Z") };
    store.scans = [[scan(1)]];
    const fresh = at("2026-11-26T08:00:00.000Z", "org_2");
    store.duringDelivery = () => {
      store.metadata.scansSync = fresh;
    };

    await runIntegrationSyncs();

    expect(stream("scansSync")).toEqual(fresh);
  });

  it("a stream removed meanwhile isn't brought back", async () => {
    store.metadata = {
      settings: { region: "us" },
      scansSync: at("2026-11-25T08:00:00.000Z"),
    };
    store.scans = [[scan(1)]];
    store.duringDelivery = () => {
      store.metadata.scansSync = undefined;
    };

    await runIntegrationSyncs();

    expect(store.metadata).toEqual({
      settings: { region: "us" },
      scansSync: undefined,
    });
  });

  it("but a run can still turn its stream off itself, when the plan ended", async () => {
    store.metadata = { scansSync: at("2026-11-25T08:00:00.000Z") };
    store.pause = "the workspace's plan ended";

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(stream("scansSync")).toMatchObject({
      enabled: false,
      status: "paused",
      lastError: "the workspace's plan ended",
      leaseUntil: null,
    });
    expect(store.scanReads).toEqual([]);
  });
});

describe("a Segment batch sent in several requests", () => {
  it("moves the cursor past the requests delivered before one failed, and the retry sends only the rest", async () => {
    store.metadata = {
      settings: { region: "us" },
      responsesSync: at("2026-11-25T07:00:00.000Z", null),
    };
    const responses = Array.from({ length: 40 }, (_, n) => response(n, true));
    store.responses = [responses];
    segmentAnswers(200, 503);

    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(sent).toHaveLength(2);
    const delivered = sent[0] ?? [];
    expect(delivered.length).toBeGreaterThan(1);
    expect(delivered.length).toBeLessThan(40);
    const lastDelivered = responses[delivered.length - 1];
    expect(stream("responsesSync")).toMatchObject({
      enabled: true,
      status: "retrying",
      attempts: 1,
      delivered: delivered.length,
      lastError: "the service had an error (HTTP 503)",
      cursor: { at: lastDelivered?.createdAt, id: lastDelivered?.id },
    });
    expect(stream("responsesSync").nextAttemptAt).not.toBeNull();

    // The retry, hours later: read from the new cursor
    store.metadata.responsesSync = {
      ...stream("responsesSync"),
      nextAttemptAt: null,
    };
    store.responses = [responses.slice(delivered.length)];
    sent = [];
    segmentAnswers();

    await runIntegrationSyncs();

    expect(store.responseReads.at(-1)).toMatchObject({
      cursor: { id: lastDelivered?.id },
    });
    const resent = sent.flat();
    expect(resent).toHaveLength(40 - delivered.length);
    expect(resent.some((id) => delivered.includes(id))).toBe(false);
    expect(stream("responsesSync")).toMatchObject({
      status: "ok",
      attempts: 0,
      delivered: 40,
    });
  });
});
