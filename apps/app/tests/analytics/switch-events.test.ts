// The import steps of the switch funnel (lib/migrate/server/analytics.ts):
// import_started, import_finished and import_bridge_run, driven through the
// real importer against an in-memory repo, sent to a fake PostHog endpoint.
// Each is sent after the response, once per import or run, with provider ids
// and counts only; named with the user's analytics consent and an anonymous
// count without it; labelled with how the account found QRdx
// (lib/analytics/acquisition.ts). Nothing connects anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
  return {
    consent: false,
    /** after() callbacks, run by flush() */
    tasks: [] as (() => unknown)[],
    sent: [] as {
      event: string;
      distinct_id: string;
      uuid: string;
      properties: Record<string, unknown>;
    }[],
    deps: {} as import("@/lib/migrate/importer").ImporterDeps,
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(task);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "qrdx_analytics" && state.consent ? { value: "1" } : undefined,
  }),
}));
// The routes' deps, for the bridge's reload of the import.
vi.mock("@/lib/migrate/server/http", () => ({ deps: state.deps }));

import { ownCampaign } from "@/lib/analytics/acquisition";
import {
  type CreateInput,
  type FinishInput,
  type ImporterDeps,
  type MigrateRepo,
  resetRedirectErrors,
  runJobChunk,
  runRedirects,
  type Scope,
  startJob,
} from "@/lib/migrate/importer";
import { parseImportMarkers } from "@/lib/migrate/normalize";
import {
  trackBridgeRun,
  trackImportChunk,
  trackImportStarted,
} from "@/lib/migrate/server/analytics";
import type {
  CodeRef,
  ImportJob,
  ImportOptions,
  MigrationSource,
  PreviewRequest,
  SourceLink,
} from "@/lib/migrate/types";
import { fakeDb } from "../support/fake-db";

const SCOPE: Scope = { userId: "user_1", organizationId: null };

const OPTIONS: ImportOptions = {
  folderName: null,
  carryTags: true,
  includeDuplicates: false,
  backHalfDomain: null,
  keepBackHalves: false,
  useSuggestions: true,
  limit: null,
};

/** A link on the customer's own domain, with a title and tags. */
function link(n: number, patch: Partial<SourceLink> = {}): SourceLink {
  const backHalf = `Menu${String(n).padStart(4, "0")}`;
  return {
    id: `go.brand.com/${backHalf}`,
    shortLink: `https://go.brand.com/${backHalf}`,
    domain: "go.brand.com",
    backHalf,
    destinationUrl: `https://shop.example.com/table-${n}`,
    title: `Acme menu ${n}`,
    tags: ["print"],
    clicks: null,
    createdAt: "2024-03-02T10:00:00.000Z",
    archived: false,
    ...patch,
  };
}

const links = (count: number) =>
  Array.from({ length: count }, (_, index) => link(index + 1));

/** Personal or identifying strings that must never leave in an event. */
const NEVER_SENT = [
  "go.brand.com",
  "brand.com",
  "example.com",
  "Menu0",
  "Acme",
  "table-",
  "qrdx.dev/q",
];

/** In-memory codes and jobs behind the real importer. */
function fakeRepo(
  options: { failCreateFor?: string[]; crashOnFinish?: boolean } = {},
) {
  const codes: { id: string; url: string; notes: string | null }[] = [];
  let jobs: ImportJob[] = [];
  let crash = Boolean(options.crashOnFinish);
  const ref = (id: string): CodeRef => ({
    id,
    shortLink: `https://qrdx.dev/q/${id}`,
    state: "active",
  });
  const repo: MigrateRepo = {
    usage: async () => ({ remaining: null, bulk: true, customSlugs: true }),
    async findImported(_scope, provider, keys) {
      const found = new Map<string, CodeRef>();
      for (const code of codes) {
        for (const marker of parseImportMarkers(code.notes)) {
          const [p, ...rest] = marker.split(":");
          const key = rest.join(":");
          if (p === provider && (!keys || keys.includes(key))) {
            found.set(key, ref(code.id));
          }
        }
      }
      return found;
    },
    findByDestinations: async () => new Map(),
    findTakenSlugs: async () => new Set(),
    existingTagNames: async () => new Set(["print"]),
    domainFor: async () => ({ id: null, qrdx: "missing", canUse: true }),
    qrdxHosts: async () => new Set(["qrdx.dev"]),
    checkDestination: (url) =>
      url.startsWith("https://")
        ? { ok: true, url }
        : { ok: false, message: "Enter a full URL" },
    async createCodes(_scope, inputs: CreateInput[]) {
      if (
        inputs.some((input) =>
          options.failCreateFor?.includes(input.destinationUrl),
        )
      ) {
        throw Object.assign(new Error("This destination was blocked"), {
          code: "UNSAFE_URL",
        });
      }
      return inputs.map((input) => {
        const id = `code_${codes.length + 1}`;
        codes.push({ id, url: input.destinationUrl, notes: null });
        return { id, slug: id, shortLink: ref(id).shortLink };
      });
    },
    async finishCodes(_scope, rows: FinishInput[]) {
      if (crash) {
        crash = false;
        throw new Error("Connection lost");
      }
      const done = new Map<string, { shortLink: string }>();
      for (const row of rows) {
        const code = codes.find((entry) => entry.id === row.codeId);
        if (code) code.notes = row.notes;
        done.set(row.codeId, { shortLink: ref(row.codeId).shortLink });
      }
      return done;
    },
    codesInScope: async (_scope, ids) => new Set(ids),
    attachDomain: async () => 0,
    loadJobs: async () => structuredClone(jobs),
    async saveJobs(_userId, next) {
      jobs = structuredClone(next);
    },
    claimChunk: async () => true,
  };
  return repo;
}

function withRepo(repo: MigrateRepo): ImporterDeps {
  let id = 0;
  Object.assign(state.deps, {
    repo,
    now: () => new Date("2026-11-18T12:00:00.000Z"),
    newId: () => `job_${++id}`,
    newSlug: () => "Zz00000",
  });
  return state.deps;
}

const request = (
  items: SourceLink[],
  provider: PreviewRequest["provider"] = "bitly",
): PreviewRequest => ({ provider, links: items, options: OPTIONS });

/** Runs what after() was given, like Next does once the response is sent. */
async function flush() {
  while (state.tasks.length > 0) {
    await Promise.all(state.tasks.splice(0).map((task) => task()));
  }
}

const sentAs = (event: string) =>
  state.sent.filter((body) => body.event === event);

/** The dashboard's loop: requests until the import is done. */
async function runImport(deps: ImporterDeps, id: string) {
  for (let round = 0; round < 100; round++) {
    const result = await runJobChunk(deps, SCOPE, id);
    trackImportChunk(SCOPE, result);
    if (result.done) return result;
  }
  throw new Error("The import never finished");
}

beforeEach(() => {
  fakeDb.reset();
  state.consent = false;
  state.tasks = [];
  state.sent = [];
  // Server events go out from production deployments only.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      state.sent.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("import_started and import_finished", () => {
  it("go out once each per import, after the response, with counts only", async () => {
    const deps = withRepo(
      fakeRepo({ failCreateFor: ["https://shop.example.com/table-7"] }),
    );
    // 120 links: three requests of 50. One invalid, one the safety check refuses.
    const items = [
      ...links(119),
      link(120, { destinationUrl: "ftp://files.example.com/menu.pdf" }),
    ];
    const started = await startJob(deps, SCOPE, request(items));
    trackImportStarted(SCOPE, started);
    expect(state.sent).toHaveLength(0);
    await flush();
    expect(sentAs("import_started")).toHaveLength(1);
    expect(sentAs("import_started")[0]?.properties).toMatchObject({
      provider: "bitly",
      source: "account",
      rows: 120,
      to_create: 119,
      skipped: 1,
      own_domain: false,
      channel: "unknown",
    });

    await runImport(deps, started.job.id);
    // A repeated call on the finished import changes nothing.
    trackImportChunk(SCOPE, await runJobChunk(deps, SCOPE, started.job.id));
    await flush();

    const finished = sentAs("import_finished");
    expect(finished).toHaveLength(1);
    expect(finished[0]?.properties).toMatchObject({
      provider: "bitly",
      source: "account",
      rows: 120,
      created: 118,
      skipped: 1,
      failed: 1,
      own_domain: false,
    });
    const wire = JSON.stringify(state.sent);
    for (const text of NEVER_SENT) expect(wire).not.toContain(text);
  });

  it("names a file import's source, and says when back-halves stay on the own domain", async () => {
    const deps = withRepo(fakeRepo());
    const started = await startJob(deps, SCOPE, {
      ...request(links(3), "uniqode"),
      options: {
        ...OPTIONS,
        keepBackHalves: true,
        backHalfDomain: "go.brand.com",
      },
    });
    trackImportStarted(SCOPE, started);
    await runImport(deps, started.job.id);
    await flush();
    for (const event of ["import_started", "import_finished"]) {
      expect(sentAs(event)).toHaveLength(1);
      expect(sentAs(event)[0]?.properties).toMatchObject({
        provider: "uniqode",
        source: "file",
        own_domain: true,
      });
    }
    expect(JSON.stringify(state.sent)).not.toContain("brand.com");
  });

  it("counts an import whose last request failed half-way once, when it's resumed", async () => {
    const deps = withRepo(fakeRepo({ crashOnFinish: true }));
    const started = await startJob(deps, SCOPE, request(links(5)));
    // The request fails after the codes are made: the route sends nothing.
    await expect(runJobChunk(deps, SCOPE, started.job.id)).rejects.toThrow(
      "Connection lost",
    );
    await runImport(deps, started.job.id);
    trackImportChunk(SCOPE, await runJobChunk(deps, SCOPE, started.job.id));
    await flush();
    expect(sentAs("import_finished")).toHaveLength(1);
    expect(sentAs("import_finished")[0]?.properties).toMatchObject({
      created: 5,
      failed: 0,
    });
  });

  it("is finished at the start when there's nothing to create", async () => {
    const deps = withRepo(fakeRepo());
    const started = await startJob(
      deps,
      SCOPE,
      request([link(1, { destinationUrl: "ftp://files.example.com/a" })]),
    );
    trackImportStarted(SCOPE, started);
    trackImportChunk(SCOPE, await runJobChunk(deps, SCOPE, started.job.id));
    await flush();
    expect(sentAs("import_started")).toHaveLength(1);
    expect(sentAs("import_finished")).toHaveLength(1);
    expect(sentAs("import_finished")[0]?.properties).toMatchObject({
      rows: 1,
      created: 0,
      skipped: 1,
    });
  });

  it("sends nothing outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const deps = withRepo(fakeRepo());
    const started = await startJob(deps, SCOPE, request(links(2)));
    trackImportStarted(SCOPE, started);
    await runImport(deps, started.job.id);
    expect(state.tasks).toHaveLength(0);
    await flush();
    expect(state.sent).toHaveLength(0);
  });
});

describe("consent", () => {
  it("is an anonymous count without analytics consent", async () => {
    const deps = withRepo(fakeRepo());
    trackImportStarted(SCOPE, await startJob(deps, SCOPE, request(links(1))));
    await flush();
    const [body] = state.sent;
    expect(body?.distinct_id).toBe(body?.uuid);
    expect(body?.distinct_id).not.toBe("user_1");
    expect(body?.properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
    });
  });

  it("names the user once they allowed analytics", async () => {
    state.consent = true;
    const deps = withRepo(fakeRepo());
    trackImportStarted(SCOPE, await startJob(deps, SCOPE, request(links(1))));
    await flush();
    expect(state.sent[0]?.distinct_id).toBe("user_1");
    expect(state.sent[0]?.properties.$process_person_profile).toBe(true);
  });
});

describe("how the account found QRdx", () => {
  const startedWith = async () => {
    const deps = withRepo(fakeRepo());
    trackImportStarted(SCOPE, await startJob(deps, SCOPE, request(links(1))));
    await flush();
    return state.sent[0]?.properties ?? {};
  };
  const acquired = (utmCampaign: string | null) =>
    fakeDb.seed("userAcquisition", [
      {
        userId: "user_1",
        channel: "campaign",
        utmSource: "newsletter",
        utmCampaign,
        landingPath: "/compare/acme",
        createdAt: new Date("2026-11-01T00:00:00Z"),
      },
    ]);

  it("carries utm_campaign=switch, and the channel", async () => {
    acquired("switch");
    const props = await startedWith();
    expect(props).toMatchObject({ channel: "campaign", campaign: "switch" });
    // Never the other tags or pages.
    expect(JSON.stringify(props)).not.toMatch(/newsletter|compare|acme/);
  });

  it("leaves out any other campaign tag", async () => {
    acquired("acme-corp-renewal");
    const props = await startedWith();
    expect(props.channel).toBe("campaign");
    expect(props).not.toHaveProperty("campaign");
  });

  it("says unknown for an account with no record, and nothing before the table exists", async () => {
    expect((await startedWith()).channel).toBe("unknown");
    state.sent = [];
    fakeDb.missing("userAcquisition");
    const props = await startedWith();
    expect(props).not.toHaveProperty("channel");
    expect(props).toMatchObject({ provider: "bitly", rows: 1 });
  });

  it("matches QRdx's own campaign names only", () => {
    expect(ownCampaign("switch")).toBe("switch");
    expect(ownCampaign(" Switch ")).toBe("switch");
    expect(ownCampaign("switch-acme")).toBeNull();
    expect(ownCampaign(null)).toBeNull();
  });
});

describe("import_bridge_run", () => {
  /** A connected account whose provider refuses some links. */
  function source(refuse: { key: string; message: string }[] = []) {
    const updates: string[] = [];
    const account: MigrationSource = {
      provider: "bitly",
      listLinks: async () => ({ links: [], nextCursor: null, total: null }),
      async updateDestination(key) {
        const refusal = refuse.find((entry) => entry.key === key);
        if (refusal) throw new Error(refusal.message);
        updates.push(key);
      },
    };
    return { account, updates };
  }

  /** The dashboard's loop for one run, through the route's steps. */
  async function bridge(
    deps: ImporterDeps,
    id: string,
    mode: "apply" | "undo",
    account: MigrationSource,
  ) {
    for (let round = 0; round < 50; round++) {
      // Round 0 asks to retry: earlier errors are cleared first.
      if (round === 0) await resetRedirectErrors(deps, SCOPE, id);
      const result = await runRedirects(deps, SCOPE, id, mode, account);
      trackBridgeRun(SCOPE, result);
      if (
        result.stopped ||
        result.remaining === 0 ||
        result.items.length === 0
      ) {
        return result;
      }
    }
    throw new Error("The run never ended");
  }

  async function imported(count: number) {
    const deps = withRepo(fakeRepo());
    const started = await startJob(deps, SCOPE, request(links(count)));
    await runImport(deps, started.job.id);
    await flush();
    state.sent = [];
    return { deps, id: started.job.id };
  }

  it("goes out once per run, with the links changed and refused", async () => {
    const { deps, id } = await imported(45);
    trackBridgeRun(SCOPE, await runRedirects(deps, SCOPE, id, "dry-run", null));
    // 45 links: three requests of at most 20, one link refused.
    const { account } = source([
      { key: "go.brand.com/Menu0007", message: "Bitly API error: 404 - gone" },
    ]);
    await bridge(deps, id, "apply", account);
    await bridge(deps, id, "undo", account);
    await flush();

    const runs = sentAs("import_bridge_run").map((body) => body.properties);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({
      provider: "bitly",
      mode: "dry_run",
      links_changed: 45,
      refused: 0,
      stopped: false,
    });
    expect(runs[1]).toMatchObject({
      mode: "apply",
      links_changed: 44,
      refused: 1,
      stopped: false,
    });
    expect(runs[2]).toMatchObject({
      mode: "undo",
      links_changed: 44,
      refused: 0,
    });
    const wire = JSON.stringify(state.sent);
    for (const text of NEVER_SENT) expect(wire).not.toContain(text);
  });

  it("says when the provider's plan stopped the run", async () => {
    const { deps, id } = await imported(30);
    const { account } = source([
      {
        key: "go.brand.com/Menu0003",
        message: "Bitly API error: 402 - upgrade",
      },
    ]);
    const result = await bridge(deps, id, "apply", account);
    expect(result.stopped).not.toBeNull();
    await flush();
    const runs = sentAs("import_bridge_run");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.properties).toMatchObject({
      mode: "apply",
      links_changed: 2,
      stopped: true,
    });
  });
});
