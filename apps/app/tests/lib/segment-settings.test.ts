// Segment's settings (lib/data-connections/settings.ts): the region and event
// names, each stream's switch (a stream's state is only written when its
// switch changes, and turning it off writes only the switch; the worker owns
// the rest), the test event, "Retry now" for one stream, and the panel's
// view, which never holds the write key.
// The database is a fake that records each statement's values; fetch is
// faked too.

import type { SyncState } from "@repo/integrations";
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http-error";

interface SqlFragment {
  text: string;
  values: unknown[];
}

const KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

const state = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  writes: [] as SqlFragment[],
  calls: [] as boolean[],
  runs: [] as unknown[],
  pageLists: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => ({ text: strings.join("?"), values });
  return { and: () => ({}), eq: () => ({}), sql };
});
vi.mock("@repo/database", () => ({
  integration: {},
  database: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            { metadata: structuredClone(state.metadata), status: "active" },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: { metadata?: SqlFragment }) => ({
        where: async () => {
          if (values.metadata) state.writes.push(values.metadata);
        },
      }),
    }),
  },
}));
vi.mock("@/app/api/forms/_lib/responses", () => ({ getInboxPage: vi.fn() }));
// lib/error-response logs through ./shared, which reaches the auth server.
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/data-connections/data", () => ({
  listFormPages: async () => {
    state.pageLists++;
    return { items: [], nextCursor: null };
  },
  formPagesByIds: async () => [],
}));
vi.mock("@/lib/data-connections/server", () => ({
  dataCallsAllowed: () => state.calls.at(-1) ?? true,
  devDisabled: () => new HttpError(503, "DEV_DISABLED", "Off here."),
  getFreshConnection: async () => ({
    id: "int_1",
    status: "active",
    accessToken: KEY,
    metadata: structuredClone(state.metadata),
  }),
}));
vi.mock("@/lib/data-connections/sync", () => ({
  invalidateStreamIndex: () => {},
  readSheetTarget: () => null,
  runIntegrationSyncs: async (options: unknown) => {
    state.runs.push(options);
    return { streams: 1, ok: 1, failed: 0, skipped: 0 };
  },
  writeSyncState: async (
    _id: string,
    sync: SyncState,
    _patch: unknown,
    key = "sync",
  ) => {
    state.writes.push({ text: "writeSyncState", values: [`{${key}}`, sync] });
  },
}));

const {
  saveSegmentSink,
  sendSegmentTest,
  retrySync,
  getSinkView,
  setSheetSync,
} = await import("@/lib/data-connections/settings");

const SCOPE = { userId: "user_1", organizationId: "org_1" } as never;
const INPUT = {
  region: "eu" as const,
  scans: { enabled: true, event: " Menu Scanned " },
  responses: { enabled: true, event: "Lead Captured" },
};

/** A statement's values, nested fragments included. */
function flat(fragment: SqlFragment): unknown[] {
  return fragment.values.flatMap((value) =>
    value && typeof value === "object" && "values" in value
      ? flat(value as SqlFragment)
      : [value],
  );
}

/** What the last write set: the settings patch and each stream's state. */
function lastWrite() {
  const values = flat(state.writes.at(-1) as SqlFragment);
  const out: { settings?: unknown; states: Record<string, SyncState> } = {
    states: {},
  };
  values.forEach((value, index) => {
    if (typeof value !== "string") return;
    const path = /^\{(\w+)\}$/.exec(value);
    const next = values[index + 1];
    if (path && typeof next === "string") {
      out.states[path[1] as string] = JSON.parse(next);
    } else if (value.startsWith('{"region"')) {
      out.settings = JSON.parse(value);
    }
  });
  return out;
}

/** A statement's text, nested fragments included. */
function text(fragment: SqlFragment): string {
  return [
    fragment.text,
    ...fragment.values.map((value) =>
      value && typeof value === "object" && "values" in value
        ? text(value as SqlFragment)
        : "",
    ),
  ].join(" ");
}

/**
 * The streams the last write switched off in place: `enabled` false and
 * status "paused", nothing else of their state.
 */
function switchedOff(): string[] {
  const write = state.writes.at(-1) as SqlFragment;
  const paths = flat(write).filter(
    (value): value is string => typeof value === "string",
  );
  const keys = paths.flatMap((path) => {
    const match = /^\{(\w+),enabled\}$/.exec(path);
    return match ? [match[1] as string] : [];
  });
  for (const key of keys) expect(paths).toContain(`{${key},status}`);
  expect(text(write)).toContain("'false'::jsonb");
  expect(text(write)).toContain(`'"paused"'::jsonb`);
  return keys;
}

let fetched: string[] = [];

beforeEach(() => {
  state.metadata = {};
  state.writes = [];
  state.calls = [];
  state.runs = [];
  state.pageLists = 0;
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return new Response('{"success":true}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saving Segment's settings", () => {
  it("saves the region and event names, and starts both streams from now", async () => {
    await saveSegmentSink(SCOPE, INPUT);
    const write = lastWrite();
    expect(write.settings).toEqual({
      region: "eu",
      scanEvent: "Menu Scanned",
      responseEvent: "Lead Captured",
    });
    expect(Object.keys(write.states).sort()).toEqual([
      "responsesSync",
      "scansSync",
    ]);
    for (const stream of Object.values(write.states)) {
      expect(stream).toMatchObject({
        enabled: true,
        organizationId: "org_1",
        status: "idle",
        delivered: 0,
      });
      expect(stream.cursor?.at).toBeTruthy();
    }
  });

  it("leaves running streams to the worker when only names change", async () => {
    state.metadata = {
      scansSync: { ...initialSyncState("org_1"), status: "ok", delivered: 9 },
      responsesSync: { ...initialSyncState("org_1"), status: "ok" },
    };
    await saveSegmentSink(SCOPE, INPUT);
    expect(lastWrite().states).toEqual({});
  });

  it("pauses only the stream turned off, writing only its switch", async () => {
    state.metadata = {
      scansSync: { ...initialSyncState("org_1"), status: "ok", delivered: 9 },
      responsesSync: { ...initialSyncState("org_1"), status: "ok" },
    };
    await saveSegmentSink(SCOPE, {
      ...INPUT,
      scans: { ...INPUT.scans, enabled: false },
    });
    // No copy of the state read before: a run delivering meanwhile keeps
    // the cursor and totals it writes
    expect(lastWrite().states).toEqual({});
    expect(switchedOff()).toEqual(["scansSync"]);
  });

  it("turns Sheets' one stream off the same way", async () => {
    state.metadata = {
      sync: { ...initialSyncState("org_1"), status: "ok", delivered: 9 },
    };
    await setSheetSync(SCOPE, false);
    expect(lastWrite().states).toEqual({});
    expect(switchedOff()).toEqual(["sync"]);
  });

  it("resumes a failed stream and keeps its cursor", async () => {
    const failed = {
      ...initialSyncState("org_1"),
      status: "failed" as const,
      attempts: 8,
      cursor: { at: "2026-11-20T00:00:00.000Z", id: "scan_7" },
    };
    state.metadata = { scansSync: failed };
    await saveSegmentSink(SCOPE, {
      ...INPUT,
      responses: { ...INPUT.responses, enabled: false },
    });
    expect(lastWrite().states.scansSync).toMatchObject({
      enabled: true,
      status: "idle",
      attempts: 0,
      cursor: failed.cursor,
    });
  });

  it.each(["", "   ", "x".repeat(201), "Two\nlines"])(
    "refuses the event name %j",
    async (event) => {
      await expect(
        saveSegmentSink(SCOPE, { ...INPUT, scans: { enabled: true, event } }),
      ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
      expect(state.writes).toEqual([]);
    },
  );
});

describe("the test event", () => {
  it("goes to the region picked in the panel, or the saved one", async () => {
    state.metadata = { settings: { region: "eu" } };
    await sendSegmentTest("user_1");
    await sendSegmentTest("user_1", "us");
    expect(fetched).toEqual([
      "https://events.eu1.segmentapis.com/v1/batch",
      "https://api.segment.io/v1/batch",
    ]);
  });

  it("isn't sent where calls to connected tools are off", async () => {
    state.calls.push(false);
    await expect(sendSegmentTest("user_1")).rejects.toMatchObject({
      code: "DEV_DISABLED",
    });
    expect(fetched).toEqual([]);
  });
});

describe("Retry now", () => {
  it("resumes and runs only the stream asked for", async () => {
    state.metadata = {
      scansSync: { ...initialSyncState("org_1"), status: "failed" },
      responsesSync: { ...initialSyncState("org_1"), status: "failed" },
    };
    await retrySync("user_1", "segment", "responses");
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]?.values[0]).toBe("{responsesSync}");
    expect(state.writes[0]?.values[1]).toMatchObject({ status: "idle" });
    expect(state.runs).toEqual([
      { integrationIds: ["int_1"], stream: "responses", budgetMs: 20_000 },
    ]);
  });

  it("refuses a stream that was never turned on", async () => {
    await expect(retrySync("user_1", "segment", "scans")).rejects.toMatchObject(
      { code: "NOT_ENABLED" },
    );
  });

  it("keeps using metadata.sync for the other sinks", async () => {
    state.metadata = {
      sync: { ...initialSyncState(null), status: "failed" },
    };
    await retrySync("user_1", "hubspot");
    expect(state.writes[0]?.values[0]).toBe("{sync}");
    expect(state.runs).toEqual([
      { integrationIds: ["int_1"], stream: "responses", budgetMs: 20_000 },
    ]);
  });
});

describe("the panel's view", () => {
  it("shows each stream and the settings, without loading pages or the key", async () => {
    state.metadata = {
      settings: { region: "eu", scanEvent: "Menu Scanned" },
      scansSync: initialSyncState("org_1"),
    };
    const view = await getSinkView(SCOPE, "segment");
    expect(view?.sync).toBeNull();
    expect(view?.streams?.scans).toMatchObject({ enabled: true });
    expect(view?.streams?.responses).toBeNull();
    expect(view?.settings).toEqual({ region: "eu", scanEvent: "Menu Scanned" });
    expect(state.pageLists).toBe(0);
    expect(JSON.stringify(view)).not.toContain(KEY);
  });

  it("adds no streams for a sink with one", async () => {
    state.metadata = { sync: initialSyncState(null) };
    const view = await getSinkView(SCOPE, "hubspot");
    expect(view).not.toHaveProperty("streams");
  });
});
