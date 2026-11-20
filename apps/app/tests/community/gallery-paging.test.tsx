// A community gallery's infinite scroll (app/(app)/(home)/community): the
// server draws page 1, and loadCommunityGalleryPage returns each page after
// it with the same filters, against in-memory tables (tests/support/
// fake-db) where the frames gallery is the engine's official library and
// the themes gallery is the themes seeded below.
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
vi.mock("@/lib/community/viewer", () => ({ viewerId: async () => null }));
// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

import { OFFICIAL_FRAME_COLLECTIONS, OFFICIAL_FRAMES } from "qrdx";
import {
  galleryCards,
  galleryHref,
  galleryListKey,
  galleryPerPage,
  groupOf,
  parseGalleryQuery,
} from "@/app/(app)/(home)/community/[type]/gallery";
import { loadCommunityGalleryPage } from "@/app/(app)/(home)/community/actions";
import { cardHref, cardKey } from "@/components/community/item-card";
import { pageSlice } from "@/lib/paging";
import { fakeDb } from "../support/fake-db";

beforeEach(() => {
  fakeDb.resetAll();
});

/** Page 1 the way the page draws it, then every page the list loads. */
async function scrollThrough(type: string, params: Record<string, string>) {
  const query = parseGalleryQuery(type, params);
  if (!query) throw new Error("bad query");
  const { shown } = await galleryCards(query);
  const first = pageSlice(shown, 1, galleryPerPage(query.type));
  const keys = first.items.map(cardKey);
  const pages = [first.items.length];
  let next = first.nextPage;
  while (next !== null) {
    const page = await loadCommunityGalleryPage(type, params, next);
    expect(page.items.length).toBeGreaterThan(0);
    keys.push(...page.items.map((item) => item.key));
    pages.push(page.items.length);
    expect(page.nextPage === null || page.nextPage === next + 1).toBe(true);
    next = page.nextPage;
  }
  return { shown, keys, pages };
}

describe("community gallery pages", () => {
  it("load every frame once, a page at a time, in order", async () => {
    const { shown, keys, pages } = await scrollThrough("frame", {});
    expect(shown.length).toBe(OFFICIAL_FRAMES.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(shown.map(cardKey));
    expect(pages.slice(0, -1).every((size) => size === 24)).toBe(true);
  });

  it("keep the group filter on every page", async () => {
    const group = OFFICIAL_FRAME_COLLECTIONS.find(
      (item) =>
        OFFICIAL_FRAMES.filter((frame) => frame.collection === item.id).length >
        24,
    );
    if (!group) throw new Error("no group spans two pages");
    const { shown, keys } = await scrollThrough("frame", { group: group.id });
    expect(shown.length).toBeGreaterThan(24);
    expect(shown.every((card) => groupOf(card) === group.id)).toBe(true);
    expect(keys).toEqual(shown.map(cardKey));
  });

  it("keep the sort on every page", async () => {
    const popular = await scrollThrough("frame", {});
    const oldest = await scrollThrough("frame", { sort: "oldest" });
    expect(new Set(oldest.keys)).toEqual(new Set(popular.keys));
    expect(oldest.keys).toEqual(oldest.shown.map(cardKey));
  });

  it("answer nothing for page 1, pages past the end and bad input", async () => {
    const empty = { items: [], nextPage: null };
    expect(await loadCommunityGalleryPage("frame", {}, 1)).toEqual(empty);
    expect(await loadCommunityGalleryPage("frame", {}, 999)).toEqual(empty);
    expect(await loadCommunityGalleryPage("frame", {}, 2.5)).toEqual(empty);
    expect(await loadCommunityGalleryPage("nope", {}, 2)).toEqual(empty);
    // Signed out, "mine" has nothing to page through.
    expect(
      await loadCommunityGalleryPage("frame", { from: "mine" }, 2),
    ).toEqual(empty);
  });
});

describe("gallery queries", () => {
  it("keep the filters a URL has and drop unknown ones", () => {
    const group = OFFICIAL_FRAME_COLLECTIONS[0]?.id ?? "";
    expect(
      parseGalleryQuery("frame", {
        from: "official",
        sort: ["newest"],
        group,
        tag: "cafe",
      }),
    ).toEqual({
      type: "frame",
      filter: "official",
      sort: "newest",
      group,
      // Frames have groups, not tags.
      tag: null,
    });
    expect(
      parseGalleryQuery("page-template", {
        from: "everything",
        sort: "random",
        group,
        tag: "cafe",
      }),
    ).toEqual({
      type: "page-template",
      filter: "all",
      sort: "popular",
      group: null,
      tag: "cafe",
    });
    // Themes are a gallery like the others, with tags.
    expect(
      parseGalleryQuery("theme", { from: "official", tag: "warm" }),
    ).toEqual({
      type: "theme",
      filter: "official",
      sort: "popular",
      group: null,
      tag: "warm",
    });
    expect(parseGalleryQuery("themes", {})).toBeNull();
  });

  it("link pages with the filters kept, and name each list apart", () => {
    const query = parseGalleryQuery("collection", {
      from: "community",
      sort: "oldest",
      tag: "menu",
    });
    if (!query) throw new Error("bad query");
    expect(galleryHref(query, { page: 3 })).toBe(
      "/community/collections?from=community&sort=oldest&tag=menu&page=3",
    );
    // A new filter starts over at page 1.
    expect(galleryHref(query, { filter: "official" })).toBe(
      "/community/collections?from=official&sort=oldest&tag=menu",
    );
    const other = parseGalleryQuery("collection", { from: "community" });
    if (!other) throw new Error("bad query");
    expect(galleryListKey(query)).not.toBe(galleryListKey(other));
  });

  it("draw shorter pages of page templates and kits", () => {
    expect(galleryPerPage("frame")).toBe(24);
    expect(galleryPerPage("theme")).toBe(24);
    expect(galleryPerPage("collection")).toBe(24);
    expect(galleryPerPage("page-template")).toBe(6);
    expect(galleryPerPage("kit")).toBe(6);
  });
});

// ─── Themes ────────────────────────────────────────────────────────────────

/** 26 of @qrdx's themes and 4 of a member's, every third one tagged "warm". */
function seedThemes() {
  fakeDb.seed("communityProfile", [
    {
      id: "cp_qrdx",
      kind: "official",
      userId: null,
      handle: "qrdx",
      displayName: "QRdx",
      avatarUrl: null,
      verifiedAt: null,
      status: "active",
    },
    {
      id: "cp_ana",
      kind: "person",
      userId: "u_ana",
      handle: "ana",
      displayName: "Ana",
      avatarUrl: null,
      verifiedAt: null,
      status: "active",
    },
  ]);
  fakeDb.seed("user", [
    { id: "u_ana", name: "Ana", banned: false, banExpires: null },
  ]);
  const items = Array.from({ length: 30 }, (_, index) => {
    const official = index < 26;
    return {
      id: `ci_${index}`,
      type: "theme",
      slug: `theme-${index}`,
      profileId: official ? "cp_qrdx" : "cp_ana",
      createdBy: official ? null : "u_ana",
      name: `Theme ${index}`,
      description: null,
      status: "published",
      license: "CC0-1.0",
      currentVersion: 1,
      payload: { style: { bgColor: "#ffffff", dotColor: "#0b3d91" } },
      payloadHash: `hash-${index}`,
      facets: null,
      scanScore: null,
      isOfficial: official,
      featuredAt: null,
      remixedFromLabel: null,
      sourceKind: null,
      sourceId: null,
      // Popular is most liked first: the oldest theme here
      likeCount: 30 - index,
      saveCount: 0,
      useCount: 0,
      remixCount: 0,
      removedAt: null,
      publishedAt: new Date(Date.UTC(2026, 10, 1) + index * 60_000),
    };
  });
  fakeDb.seed("communityItem", items);
  fakeDb.seed(
    "communityItemTag",
    items
      .filter((_, index) => index % 3 === 0)
      .map((item) => ({ itemId: item.id, tag: "warm" })),
  );
}

describe("the themes gallery", () => {
  it("lists QRdx's themes and members' alike, a page at a time", async () => {
    seedThemes();
    const { shown, keys, pages } = await scrollThrough("theme", {});
    expect(shown).toHaveLength(30);
    expect(pages).toEqual([24, 6]);
    expect(keys).toEqual(shown.map(cardKey));
    expect(new Set(keys).size).toBe(30);
  });

  it("links every theme to its own page, credited to who made it", async () => {
    seedThemes();
    const { shown } = await scrollThrough("theme", {});
    for (const card of shown) {
      expect(card.type).toBe("theme");
      expect(cardHref(card)).toBe(`/community/themes/${card.slug}`);
      expect(card.creator.official).toBe(card.isOfficial);
    }
    const qrdx = shown.find((card) => card.isOfficial);
    expect(qrdx?.creator).toMatchObject({ handle: "qrdx", official: true });
    const ana = shown.find((card) => !card.isOfficial);
    expect(ana?.creator).toMatchObject({ handle: "ana", official: false });
  });

  it("narrows to QRdx's, the community's or a tag", async () => {
    seedThemes();
    const official = await scrollThrough("theme", { from: "official" });
    expect(official.shown).toHaveLength(26);
    expect(official.shown.every((card) => card.isOfficial)).toBe(true);
    const community = await scrollThrough("theme", { from: "community" });
    expect(community.shown.map((card) => card.slug)).toEqual([
      "theme-26",
      "theme-27",
      "theme-28",
      "theme-29",
    ]);
    const warm = await scrollThrough("theme", { tag: "warm" });
    expect(warm.shown).toHaveLength(10);
    expect(warm.shown.every((card) => card.tags.includes("warm"))).toBe(true);
  });

  it("sorts by likes, newest or oldest", async () => {
    seedThemes();
    const popular = await scrollThrough("theme", {});
    expect(popular.shown[0]?.slug).toBe("theme-0");
    const newest = await scrollThrough("theme", { sort: "newest" });
    expect(newest.shown[0]?.slug).toBe("theme-29");
    const oldest = await scrollThrough("theme", { sort: "oldest" });
    expect(oldest.shown[0]?.slug).toBe("theme-0");
    expect(oldest.shown.at(-1)?.slug).toBe("theme-29");
  });
});
