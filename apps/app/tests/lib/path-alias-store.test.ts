// Reads and writes of path aliases (lib/path-alias-store.ts) against
// in-memory tables: who may claim a path on a domain, that an alias answers
// only while its code is on that domain, and that everything keeps working
// (as "no alias") before the link_path_alias table exists.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const store = await import("@/lib/path-alias-store");
const { isMissingTableError } = await import("@/lib/path-alias-missing");

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u_brand",
    organizationId: null,
    slug: `slug-${id}`,
    slugScope: "",
    kind: "redirect",
    destinationUrl: `https://brand.example/${id}`,
    domainId: "dom_brand",
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

const alias = (
  id: string,
  codeId: string,
  path: string,
  domainId = "dom_brand",
) => ({
  id,
  domainId,
  qrCodeId: codeId,
  path,
  createdAt: new Date("2026-11-02T00:00:00Z"),
});

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("linkPathAlias", "domainId", "path");
  fakeDb.seed("customDomain", [
    { id: "dom_brand", hostname: "go.brand.com", verified: true },
    { id: "dom_other", hostname: "qr.other.com", verified: true },
  ]);
  fakeDb.seed("qrCode", [
    code("code_a"),
    code("code_b"),
    code("code_page", { kind: "page", slug: "QNA8kOWzd" }),
    code("code_elsewhere", { domainId: "dom_other" }),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Changes a stored row in place (the fake's rows are live). */
const patch = (table: string, id: string, values: Record<string, unknown>) =>
  Object.assign(fakeDb.find(table, { id }) ?? {}, values);

const claim = (codeId: string, path: string, domainId = "dom_brand") =>
  store.claimAlias({ codeId, domainId, path });

describe("claimAlias", () => {
  it("gives a code an old path, once per domain", async () => {
    const first = await claim("code_a", "/r/NBDX");
    expect(first).toMatchObject({ ok: true, created: true });
    expect(fakeDb.rows("linkPathAlias")).toMatchObject([
      { domainId: "dom_brand", qrCodeId: "code_a", path: "/r/NBDX" },
    ]);
    // The same code again: the alias it has, no second row.
    const again = await claim("code_a", "/r/NBDX");
    expect(again).toMatchObject({ ok: true, created: false });
    expect(fakeDb.rows("linkPathAlias")).toHaveLength(1);
    // Another code on the domain: taken. Case counts, so /r/nbdx is free.
    expect(await claim("code_b", "/r/NBDX")).toEqual({
      ok: false,
      problem: "taken",
    });
    expect((await claim("code_b", "/r/nbdx")).ok).toBe(true);
    // Another domain has its own paths.
    expect((await claim("code_elsewhere", "/r/NBDX", "dom_other")).ok).toBe(
      true,
    );
  });

  it("takes over a path whose code has left the domain", async () => {
    fakeDb.seed("linkPathAlias", [
      alias("pa_old", "code_elsewhere", "/a/cbey7J"),
    ]);
    const result = await claim("code_a", "/a/cbey7J");
    expect(result.ok).toBe(true);
    expect(fakeDb.rows("linkPathAlias")).toMatchObject([
      { qrCodeId: "code_a", path: "/a/cbey7J" },
    ]);
  });

  it("keeps the path of a code in the trash (it can come back)", async () => {
    patch("qrCode", "code_b", { deletedAt: new Date() });
    fakeDb.seed("linkPathAlias", [alias("pa_b", "code_b", "/a/cbey7J")]);
    expect(await claim("code_a", "/a/cbey7J")).toEqual({
      ok: false,
      problem: "taken",
    });
  });

  it("stops at the per-code limit on the domain", async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect((await claim("code_a", `/r/${n}`)).ok).toBe(true);
    }
    expect(await claim("code_a", "/r/6")).toEqual({
      ok: false,
      problem: "limit",
    });
  });

  it("never hides a hosted page: /p/<x> is refused while a code has back-half x", async () => {
    expect(await claim("code_a", "/p/QNA8kOWzd")).toEqual({
      ok: false,
      problem: "hostedPage",
    });
    expect((await claim("code_a", "/p/eE6l7ofNx")).ok).toBe(true);
    // Claiming it again stays fine: the alias doesn't block itself.
    expect((await claim("code_a", "/p/eE6l7ofNx")).ok).toBe(true);
    expect(await claim("code_b", "/p/eE6l7ofNx")).toEqual({
      ok: false,
      problem: "taken",
    });
  });

  it("refuses paths that can't be aliases", async () => {
    expect(await claim("code_a", "/spring-menu")).toEqual({
      ok: false,
      problem: "backHalf",
    });
    expect(await claim("code_a", "/api/events")).toEqual({
      ok: false,
      problem: "reserved",
    });
    expect(fakeDb.rows("linkPathAlias")).toHaveLength(0);
  });
});

describe("aliasCode", () => {
  it("opens the alias's code while it's on that domain", async () => {
    fakeDb.seed("linkPathAlias", [alias("pa_a", "code_a", "/r/X")]);
    expect((await store.aliasCode("/r/X", "dom_brand"))?.id).toBe("code_a");
    expect(await store.aliasCode("/r/x", "dom_brand")).toBeNull();
    expect(await store.aliasCode("/r/X", "dom_other")).toBeNull();

    patch("qrCode", "code_a", { domainId: "dom_other" });
    expect(await store.aliasCode("/r/X", "dom_brand")).toBeNull();
  });
});

describe("findTakenAliasPaths (import preview)", () => {
  it("lists live aliases and /p/ paths of hosted pages", async () => {
    fakeDb.seed("linkPathAlias", [
      alias("pa_a", "code_a", "/r/live"),
      alias("pa_gone", "code_elsewhere", "/r/stale"),
    ]);
    const taken = await store.findTakenAliasPaths(
      ["/r/live", "/r/stale", "/r/free", "/p/QNA8kOWzd"],
      "dom_brand",
    );
    expect(taken && [...taken].sort()).toEqual(["/p/QNA8kOWzd", "/r/live"]);
  });
});

describe("listAliases and removeAlias", () => {
  it("lists a code's aliases on its domain and removes one", async () => {
    fakeDb.seed("linkPathAlias", [
      alias("pa_1", "code_a", "/r/one"),
      alias("pa_2", "code_a", "/r/two"),
      alias("pa_3", "code_a", "/r/elsewhere", "dom_other"),
      alias("pa_4", "code_b", "/r/theirs"),
    ]);
    const listed = await store.listAliases("code_a", "dom_brand");
    expect(listed?.map((row) => row.path)).toEqual(["/r/one", "/r/two"]);
    // Only the code's own alias goes.
    expect(await store.removeAlias("code_a", "pa_4")).toBe(false);
    expect(await store.removeAlias("code_a", "pa_1")).toBe(true);
    expect(fakeDb.rows("linkPathAlias").map((row) => row.id)).toEqual([
      "pa_2",
      "pa_3",
      "pa_4",
    ]);
  });
});

describe("before the link_path_alias table exists", () => {
  it("answers 'no alias' everywhere and logs that once", async () => {
    fakeDb.missing("linkPathAlias");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await store.aliasCode("/r/X", "dom_brand")).toBeNull();
    expect(await store.domainHasAliases("dom_brand")).toBe(false);
    expect(await store.listAliases("code_a", "dom_brand")).toBeNull();
    expect(await store.findTakenAliasPaths(["/r/X"], "dom_brand")).toBeNull();
    expect(await store.removeAlias("code_a", "pa_1")).toBeNull();
    expect(await claim("code_a", "/r/X")).toEqual({
      ok: false,
      problem: "unavailable",
    });
    // Six failed queries, one warning (each test file has its own modules).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /doesn't exist yet \(update the database schema: bun run db:push\)/,
    );
  });

  it("still throws other database errors", async () => {
    const boom = Object.assign(new Error("connection reset"), {
      code: "08006",
    });
    expect(isMissingTableError(boom)).toBe(false);
    expect(
      isMissingTableError(
        Object.assign(new Error("Failed query"), {
          cause: {
            code: "42P01",
            message: 'relation "link_path_alias" does not exist',
          },
        }),
      ),
    ).toBe(true);
  });
});
