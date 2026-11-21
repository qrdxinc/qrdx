// The theme feed pages through items that share one published time (a
// backfill or a batch published together) without repeating or skipping
// any: the newest and oldest cursors carry the last item's id as a
// tiebreak (lib/keyset-sql.ts), the popular sort breaks ties by id under
// its offset, and a cursor from before the tiebreak (the time alone) still
// works.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));

import { themeItemsFeed } from "@/lib/community/queries";
import { fakeDb } from "../support/fake-db";

const NOW = new Date("2026-11-20T12:00:00Z");
const EARLIER = new Date("2026-11-01T12:00:00Z");

const theme = (n: number, publishedAt: Date, likeCount = 0) => ({
  id: `ci_${String(n).padStart(3, "0")}`,
  type: "theme",
  slug: `look-${n}`,
  profileId: "cp_qrdx",
  createdBy: null,
  name: `Look ${n}`,
  description: null,
  status: "published",
  license: "CC0-1.0",
  currentVersion: 1,
  payload: { style: {} },
  payloadHash: `hash-${n}`,
  facets: null,
  scanScore: null,
  isOfficial: true,
  featuredAt: null,
  remixedFromLabel: null,
  sourceKind: null,
  sourceId: null,
  likeCount,
  saveCount: 0,
  useCount: 0,
  publishedAt,
});

const feed = (sort: string, cursor: string | number | null) =>
  themeItemsFeed({
    sort,
    cursor,
    limit: 20,
    filter: "all",
    tags: [],
    userId: null,
    timeRange: "all",
  });

/** Every page's slugs, following the cursors to the end. */
async function allPages(sort: string) {
  const pages: string[][] = [];
  let cursor: string | number | null = null;
  for (let i = 0; i < 10; i++) {
    const page = await feed(sort, cursor);
    pages.push(page.themes.map((t) => t.slug ?? ""));
    cursor = page.nextCursor;
    if (cursor === null) break;
  }
  return pages;
}

describe("the theme feed over one published time", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeDb.seed("communityProfile", [
      {
        id: "cp_qrdx",
        kind: "official",
        userId: "u_team",
        handle: "qrdx",
        displayName: "QRdx",
        avatarUrl: null,
        verifiedAt: NOW,
        status: "active",
      },
    ]);
    // 45 items in one batch, 5 published earlier; likes tie too. Stored in
    // reverse, so an order the fake keeps from insertion shows up.
    fakeDb.seed(
      "communityItem",
      [
        ...Array.from({ length: 45 }, (_, i) => theme(i + 1, NOW, i % 3)),
        ...Array.from({ length: 5 }, (_, i) => theme(100 + i, EARLIER)),
      ].reverse(),
    );
  });

  it("newest: 50 items over 3 pages, each once, batch before the older ones", async () => {
    const pages = await allPages("newest");
    expect(pages.map((p) => p.length)).toEqual([20, 20, 10]);
    const all = pages.flat();
    expect(new Set(all).size).toBe(50);
    // One moment's items by id, highest first, then the older ones
    expect(all.slice(0, 2)).toEqual(["look-45", "look-44"]);
    expect(all.slice(45)).toEqual([
      "look-104",
      "look-103",
      "look-102",
      "look-101",
      "look-100",
    ]);
  });

  it("oldest: the same 50 once, older ones first", async () => {
    const pages = await allPages("oldest");
    expect(pages.map((p) => p.length)).toEqual([20, 20, 10]);
    const all = pages.flat();
    expect(new Set(all).size).toBe(50);
    expect(all.slice(0, 5)).toEqual([
      "look-100",
      "look-101",
      "look-102",
      "look-103",
      "look-104",
    ]);
    expect(all.slice(5, 7)).toEqual(["look-1", "look-2"]);
  });

  it("popular: 50 items over 3 pages with ties broken the same way every time", async () => {
    const first = await allPages("popular");
    const again = await allPages("popular");
    expect(first).toEqual(again);
    expect(new Set(first.flat()).size).toBe(50);
    expect(first.map((p) => p.length)).toEqual([20, 20, 10]);
    // Most liked first; one like count and time in id order
    expect(first[0]?.slice(0, 3)).toEqual(["look-3", "look-6", "look-9"]);
  });

  it("takes a cursor from before the tiebreak (the time alone) and starts over on junk", async () => {
    const older = await feed("newest", NOW.toISOString());
    expect(older.themes.map((t) => t.slug)).toEqual([
      "look-104",
      "look-103",
      "look-102",
      "look-101",
      "look-100",
    ]);
    expect(older.nextCursor).toBeNull();
    const fresh = await feed("newest", "not-a-cursor");
    expect(fresh.themes).toHaveLength(20);
    // The last item's time (epoch ms) and id (lib/keyset-cursor.ts)
    expect(fresh.nextCursor).toBe(`${NOW.getTime()}.ci_026`);
  });
});
