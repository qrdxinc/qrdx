// The data-out worker and Pipedrive:
// - every batch of one run shares the email → person map, and each run starts
//   a fresh one (Pipedrive's search can lag behind a create);
// - the record of leads already made (metadata.pipedriveLeadsMade) is loaded
//   when a run starts, written as each lead is made, kept when a batch fails
//   and cleared once a batch is delivered. Pipedrive replaces the origin_id an
//   OAuth app sends on a lead, so this record is what stops "Retry now" from
//   making a second lead.
// The database, the connection, the response loader and Pipedrive itself are
// fakes; the worker loop is the real one. The fake `sql` keeps each
// statement's text, so the test can tell the writes apart.
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface SqlFragment {
  text: string;
  values: unknown[];
}

const state = vi.hoisted(() => ({
  batches: [] as unknown[][],
  metadata: {} as Record<string, unknown>,
  delivered: [] as Array<{
    knownPeople: Map<string, number> | undefined;
    seen: Array<[string, number]>;
    leadsMade: string[];
    createLead: boolean | undefined;
    responses: number;
  }>,
  /** Per sink call: make leads for these many responses, then fail or not */
  plan: [] as Array<{ leads: number; fail?: boolean }>,
  writes: [] as Array<{ kind: string; values: unknown[] }>,
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
  const kindOf = (metadata: SqlFragment | undefined): string => {
    const text = metadata?.text ?? "";
    // The claim also uses to_jsonb, so it's told apart first (by its path)
    if (metadata?.values.includes("{sync,leaseUntil}")) return "claim";
    if (text.includes("to_jsonb(?::text)")) return "record-lead";
    if (text.includes(" - ?::text")) return "clear-leads";
    return "sync-state";
  };
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "int_1",
              userId: "user_1",
              provider: "pipedrive",
              metadata: structuredClone(state.metadata),
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: { metadata?: SqlFragment }) => ({
        where: () => {
          state.writes.push({
            kind: kindOf(values.metadata),
            values: values.metadata?.values ?? [],
          });
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
  getConnection: async () => ({ status: "active", accessToken: "pd-token" }),
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
vi.mock(
  "@repo/integrations/src/integrations/pipedrive",
  async (importActual) => ({
    ...(await importActual<
      typeof import("@repo/integrations/src/integrations/pipedrive")
    >()),
    createPipedriveClient: () => ({}),
    syncResponsesToPipedrive: async (
      _client: unknown,
      settings: { createLead?: boolean },
      responses: Array<{ id: string; createdAt: string }>,
      options: {
        knownPeople?: Map<string, number>;
        leadsMade?: ReadonlySet<string>;
        onLeadCreated?: (responseId: string) => Promise<void>;
      } = {},
    ) => {
      state.delivered.push({
        knownPeople: options.knownPeople,
        seen: [...(options.knownPeople ?? [])],
        leadsMade: [...(options.leadsMade ?? [])],
        createLead: settings.createLead,
        responses: responses.length,
      });
      // As the real sink does: remember the person it created
      options.knownPeople?.set(
        `person${state.delivered.length}@example.com`,
        state.delivered.length,
      );
      const plan = state.plan.shift() ?? { leads: 0 };
      const pending = responses.filter((r) => !options.leadsMade?.has(r.id));
      for (const response of pending.slice(0, plan.leads)) {
        await options.onLeadCreated?.(response.id);
      }
      if (plan.fail) throw new Error("Pipedrive refused a lead");
      const last = responses.at(-1);
      return {
        delivered: responses.length,
        skipped: 0,
        cursor: last ? { at: last.createdAt, id: last.id } : null,
      };
    },
  }),
);

const { runIntegrationSyncs, readPipedriveLeadsMade } = await import(
  "@/lib/data-connections/sync"
);

const batchOf = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `resp_${from + index}`,
    createdAt: new Date(
      Date.UTC(2026, 10, 1, 0, 0, from + index),
    ).toISOString(),
  }));
const kinds = () =>
  state.writes.map((w) => w.kind).filter((k) => k !== "claim");

beforeEach(() => {
  state.batches = [];
  state.delivered = [];
  state.plan = [];
  state.writes = [];
  state.metadata = {
    apiDomain: "https://acme.pipedrive.com",
    settings: { pageIds: null, forms: {}, createLead: true },
    sync: initialSyncState(null),
  };
});

describe("the data-out worker and Pipedrive: people", () => {
  it("gives every batch of one run the same person map", async () => {
    // A full batch of 10 (more may follow), then a short one (caught up)
    state.batches = [batchOf(10, 0), batchOf(3, 10)];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ streams: 1, ok: 1, failed: 0 });
    expect(state.delivered.map((call) => call.responses)).toEqual([10, 3]);
    const [first, second] = state.delivered;
    expect(first?.knownPeople).toBeInstanceOf(Map);
    // The very same map, so batch 2 sees who batch 1 created
    expect(second?.knownPeople).toBe(first?.knownPeople);
    expect(first?.seen).toEqual([]);
    expect(second?.seen).toEqual([["person1@example.com", 1]]);
    // The lead setting still reaches the sink
    expect(state.delivered.every((call) => call.createLead === true)).toBe(
      true,
    );
  });

  it("starts each run with an empty map", async () => {
    state.batches = [batchOf(3, 0)];
    await runIntegrationSyncs();
    state.batches = [batchOf(2, 3)];
    await runIntegrationSyncs();

    const [runOne, runTwo] = state.delivered;
    expect(runTwo?.knownPeople).not.toBe(runOne?.knownPeople);
    expect(runTwo?.seen).toEqual([]);
  });
});

describe("the data-out worker and Pipedrive: the record of leads made", () => {
  it("writes each lead to the database as soon as it's made", async () => {
    state.batches = [batchOf(2, 0)];
    state.plan = [{ leads: 2 }];
    await runIntegrationSyncs();

    const records = state.writes.filter((w) => w.kind === "record-lead");
    expect(records.map((w) => w.values.at(-1))).toEqual(["resp_0", "resp_1"]);
    // Recorded before the batch's sync state is written
    expect(kinds().indexOf("record-lead")).toBeLessThan(
      kinds().indexOf("sync-state"),
    );
  });

  it("keeps the record when the batch fails, so the next attempt sees it", async () => {
    state.batches = [batchOf(2, 0)];
    state.plan = [{ leads: 1, fail: true }];
    const summary = await runIntegrationSyncs();

    expect(summary).toMatchObject({ failed: 1 });
    expect(kinds()).toContain("record-lead");
    expect(kinds()).not.toContain("clear-leads");
  });

  it("hands the next run what an earlier attempt recorded", async () => {
    // As left by a failed attempt: resp_0 got its lead, resp_1 didn't
    state.metadata.pipedriveLeadsMade = ["resp_0"];
    state.batches = [batchOf(2, 0)];
    state.plan = [{ leads: 2 }];
    await runIntegrationSyncs();

    expect(state.delivered[0]?.leadsMade).toEqual(["resp_0"]);
    // Only resp_1 gets a lead now
    const records = state.writes.filter((w) => w.kind === "record-lead");
    expect(records.map((w) => w.values.at(-1))).toEqual(["resp_1"]);
  });

  it("clears the record once the batch is delivered", async () => {
    state.metadata.pipedriveLeadsMade = ["resp_0"];
    state.batches = [batchOf(2, 0)];
    state.plan = [{ leads: 2 }];
    await runIntegrationSyncs();

    // Cleared once, after the delivered batch's sync state (the cursor) is
    // written
    expect(kinds().filter((k) => k === "clear-leads")).toHaveLength(1);
    expect(kinds().indexOf("sync-state")).toBeLessThan(
      kinds().indexOf("clear-leads"),
    );
  });

  it("gives the next batch of a run an empty record after the first is delivered", async () => {
    state.batches = [batchOf(10, 0), batchOf(1, 10)];
    state.plan = [{ leads: 10 }, { leads: 1 }];
    await runIntegrationSyncs();

    expect(state.delivered[1]?.leadsMade).toEqual([]);
  });

  it("writes nothing extra when no lead was made", async () => {
    state.batches = [batchOf(2, 0)];
    state.plan = [{ leads: 0 }];
    await runIntegrationSyncs();

    expect(kinds()).not.toContain("record-lead");
    expect(kinds()).not.toContain("clear-leads");
  });
});

describe("readPipedriveLeadsMade", () => {
  it("reads the recorded response ids, ignoring anything else", () => {
    expect([
      ...readPipedriveLeadsMade({ pipedriveLeadsMade: ["a", 1, null, "b"] }),
    ]).toEqual(["a", "b"]);
    expect(readPipedriveLeadsMade({}).size).toBe(0);
    expect(readPipedriveLeadsMade({ pipedriveLeadsMade: "a" }).size).toBe(0);
  });
});
