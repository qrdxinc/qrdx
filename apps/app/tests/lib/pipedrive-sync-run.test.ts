// The data-out worker gives every batch of one run the same Pipedrive
// email → person map, and each run a fresh one. Pipedrive's search can lag
// behind a create, so a person made in one batch must not be searched (and
// created again) by the next batch of the same run. The database, the
// connection, the response loader and Pipedrive itself are fakes; the worker
// loop is the real one.
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  batches: [] as unknown[][],
  delivered: [] as Array<{
    knownPeople: Map<string, number> | undefined;
    seen: Array<[string, number]>;
    createLead: boolean | undefined;
    responses: number;
  }>,
  writes: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => task() }));
vi.mock("drizzle-orm", () => {
  const sql = Object.assign(() => ({}), { raw: () => ({}) });
  return { and: () => ({}), eq: () => ({}), inArray: () => ({}), sql };
});
vi.mock("@repo/database", () => {
  const thenable = (value: unknown) => ({
    // biome-ignore lint/suspicious/noThenProperty: a query builder is awaited
    then: (done: (value: unknown) => unknown) =>
      Promise.resolve(value).then(done),
  });
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "int_1",
              userId: "user_1",
              provider: "pipedrive",
              metadata: {
                apiDomain: "https://acme.pipedrive.com",
                settings: { pageIds: null, forms: {}, createLead: true },
                sync: initialSyncState(null),
              },
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          state.writes++;
          return {
            ...thenable(undefined),
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
      options: { knownPeople?: Map<string, number> } = {},
    ) => {
      state.delivered.push({
        knownPeople: options.knownPeople,
        seen: [...(options.knownPeople ?? [])],
        createLead: settings.createLead,
        responses: responses.length,
      });
      // As the real sink does: remember the person it created
      options.knownPeople?.set(
        `person${state.delivered.length}@example.com`,
        state.delivered.length,
      );
      const last = responses.at(-1);
      return {
        delivered: responses.length,
        skipped: 0,
        cursor: last ? { at: last.createdAt, id: last.id } : null,
      };
    },
  }),
);

const { runIntegrationSyncs } = await import("@/lib/data-connections/sync");

const batchOf = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `resp_${from + index}`,
    createdAt: new Date(
      Date.UTC(2026, 10, 1, 0, 0, from + index),
    ).toISOString(),
  }));

beforeEach(() => {
  state.batches = [];
  state.delivered = [];
  state.writes = 0;
});

describe("the data-out worker and Pipedrive", () => {
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
