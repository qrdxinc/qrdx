// Run: cd apps/app && npx tsx --test lib/migrate/path-aliases.test.ts
// Imports keep old paths that can't be back-halves as path aliases on the
// custom domain (lib/path-aliases.ts): the preview proposes them, the import
// claims them, and nothing is proposed while aliases aren't available.
// In memory: a fake repo instead of the database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CreateInput,
  type FinishInput,
  type ImporterDeps,
  type MigrateRepo,
  previewImport,
  runJobChunk,
  type Scope,
  startJob,
} from "./importer";
import { readJobs } from "./jobs";
import { splitShortLink } from "./normalize";
import type { ImportJob, ImportOptions, SourceLink } from "./types";

const SCOPE: Scope = { userId: "user_1", organizationId: null };
const DOMAIN = "qr.brand.com";

const OPTIONS: ImportOptions = {
  folderName: null,
  carryTags: false,
  includeDuplicates: false,
  backHalfDomain: DOMAIN,
  keepBackHalves: false,
  useSuggestions: true,
  limit: null,
};

/** A Flowcode-style link on the customer's own domain. */
function link(path: string, n = 1, host = DOMAIN): SourceLink {
  const shortLink = `https://${host}/${path}`;
  const { domain, backHalf } = splitShortLink(shortLink);
  return {
    id: shortLink,
    shortLink,
    domain,
    backHalf,
    destinationUrl: `https://brand.example/page-${n}`,
    title: null,
    tags: [],
    clicks: null,
    createdAt: null,
    archived: false,
  };
}

function fakeRepo(
  options: {
    /** Alias paths taken on the domain; undefined = no findTakenAliases */
    takenAliases?: string[] | null;
    domain?: { id: string | null; qrdx: "verified" | "pending" | "missing" };
  } = {},
) {
  let jobs: ImportJob[] = [];
  let seq = 0;
  let domain = options.domain ?? { id: "dom_1", qrdx: "verified" as const };
  const finished: FinishInput[] = [];
  const repo: MigrateRepo = {
    async usage() {
      return { remaining: null, bulk: true, customSlugs: true };
    },
    async findImported() {
      return new Map();
    },
    async findByDestinations() {
      return new Map();
    },
    async findTakenSlugs() {
      return new Set<string>();
    },
    ...(options.takenAliases !== undefined && {
      async findTakenAliases(paths: string[]) {
        if (options.takenAliases === null) return null;
        const taken = new Set(options.takenAliases);
        return new Set(paths.filter((path) => taken.has(path)));
      },
    }),
    async existingTagNames() {
      return new Set<string>();
    },
    async domainFor() {
      return { ...domain, canUse: true };
    },
    async qrdxHosts() {
      return new Set(["qrdx.dev"]);
    },
    checkDestination: (url) => ({ ok: true, url }),
    async createCodes(_scope, inputs: CreateInput[]) {
      return inputs.map(() => {
        seq += 1;
        return {
          id: `code_${seq}`,
          slug: `Rnd${seq}`,
          shortLink: `https://qrdx.dev/q/Rnd${seq}`,
        };
      });
    },
    async finishCodes(_scope, rows: FinishInput[]) {
      finished.push(...rows);
      return new Map(
        rows.map((row) => [
          row.codeId,
          { shortLink: `https://${DOMAIN}/${row.slug ?? "x"}` },
        ]),
      );
    },
    async codesInScope(_scope, ids) {
      return new Set(ids);
    },
    async attachDomain() {
      return 0;
    },
    async loadJobs() {
      return structuredClone(jobs);
    },
    async saveJobs(_userId, next) {
      jobs = structuredClone(next);
    },
    async claimChunk() {
      return true;
    },
  };
  const deps: ImporterDeps = {
    repo,
    now: () => new Date("2026-11-18T12:00:00.000Z"),
    newId: () => "job_1",
    newSlug: () => "Zz00000",
  };
  return {
    deps,
    finished,
    jobs: () => jobs,
    dropDomain: () => {
      domain = { id: null, qrdx: "missing" };
    },
  };
}

const preview = (fake: ReturnType<typeof fakeRepo>, links: SourceLink[]) =>
  previewImport(fake.deps, SCOPE, {
    provider: "flowcode",
    links,
    options: OPTIONS,
  });

describe("path aliases in an import preview", () => {
  it("keeps old paths that can't be back-halves as aliases on the domain", async () => {
    const fake = fakeRepo({ takenAliases: [] });
    const result = await preview(fake, [
      link("r/NBDX", 1),
      link("r/X", 2),
      link("s/4f1c2a9e/code_batch-1/0b9e8d7c", 3),
      link("a/cbey7J", 4),
      link("X", 5),
    ]);
    const plans = result.items.map((item) => item.backHalf);
    assert.deepEqual(
      plans.map((plan) => plan?.alias),
      [
        "/r/NBDX",
        "/r/X",
        "/s/4f1c2a9e/code_batch-1/0b9e8d7c",
        "/a/cbey7J",
        "/X",
      ],
    );
    for (const plan of plans) {
      // The code still gets a back-half of its own: the generated one shown.
      assert.equal(plan?.status, "shape");
      assert.equal(plan?.target, "domain");
      assert.match(plan?.slug ?? "", /^[0-9A-Za-z]{7}$/);
    }
  });

  it("proposes none where the old path is a back-half, or can't be an alias", async () => {
    const fake = fakeRepo({ takenAliases: [] });
    const result = await preview(fake, [
      link("spring-menu", 1),
      link("api/events", 2),
      link("r//double", 3),
    ]);
    assert.equal(result.items[0]?.backHalf?.status, "kept");
    assert.equal(result.items[0]?.backHalf?.alias, undefined);
    assert.equal(result.items[1]?.backHalf?.alias, undefined);
    assert.equal(result.items[2]?.backHalf?.alias, undefined);
  });

  it("skips taken paths and a path twice in one selection", async () => {
    const fake = fakeRepo({ takenAliases: ["/r/taken"] });
    const twice = link("r/same", 2);
    const result = await preview(fake, [
      link("r/taken", 1),
      twice,
      {
        ...twice,
        id: "second-copy",
        destinationUrl: "https://brand.example/b",
      },
    ]);
    assert.deepEqual(
      result.items.map((item) => item.backHalf?.alias),
      [undefined, "/r/same", undefined],
    );
  });

  it("proposes none while path aliases aren't available", async () => {
    for (const fake of [fakeRepo(), fakeRepo({ takenAliases: null })]) {
      const result = await preview(fake, [link("r/NBDX")]);
      assert.equal(result.items[0]?.backHalf?.status, "shape");
      assert.equal(result.items[0]?.backHalf?.alias, undefined);
    }
  });

  it("proposes none for links that aren't on the domain", async () => {
    const fake = fakeRepo({ takenAliases: [] });
    const result = await previewImport(fake.deps, SCOPE, {
      provider: "flowcode",
      links: [link("r/NBDX", 1, "flowcode.com")],
      options: { ...OPTIONS, keepBackHalves: true },
    });
    assert.equal(result.items[0]?.backHalf?.target, "shared");
    assert.equal(result.items[0]?.backHalf?.alias, undefined);
  });

  it("keeps the alias on pending domains too (it answers once verified)", async () => {
    const fake = fakeRepo({
      takenAliases: [],
      domain: { id: "dom_1", qrdx: "pending" },
    });
    const result = await preview(fake, [link("r/NBDX")]);
    assert.equal(result.items[0]?.backHalf?.alias, "/r/NBDX");
  });
});

describe("path aliases in an import", () => {
  it("claims the alias the preview showed, on the domain the code goes on", async () => {
    const fake = fakeRepo({ takenAliases: [] });
    const { job } = await startJob(fake.deps, SCOPE, {
      provider: "flowcode",
      links: [link("r/NBDX", 1), link("spring-menu", 2)],
      options: OPTIONS,
    });
    const stored = fake.jobs()[0];
    assert.equal(stored?.items[0]?.alias, "/r/NBDX");
    assert.equal(stored?.items[1]?.alias, undefined);
    // The stored record keeps it (the database copy goes through readJobs).
    assert.equal(
      readJobs({ v: 1, jobs: fake.jobs() })[0]?.items[0]?.alias,
      "/r/NBDX",
    );

    await runJobChunk(fake.deps, SCOPE, job.id);
    const [first, second] = fake.finished;
    assert.equal(first?.alias, "/r/NBDX");
    assert.equal(first?.bindDomainId, "dom_1");
    assert.equal(second?.alias ?? null, null);
    assert.equal(second?.slug, "spring-menu");
  });

  it("says so when the domain left the workspace since the preview", async () => {
    const fake = fakeRepo({ takenAliases: [] });
    const { job } = await startJob(fake.deps, SCOPE, {
      provider: "flowcode",
      links: [link("r/NBDX")],
      options: OPTIONS,
    });
    fake.dropDomain();
    const result = await runJobChunk(fake.deps, SCOPE, job.id);
    assert.equal(fake.finished[0]?.alias, null);
    assert.match(result.items[0]?.reason ?? "", /doesn't answer at \/r\/NBDX/);
  });
});
