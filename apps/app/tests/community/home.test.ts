// The /community overview (lib/community/home.ts, home-sections.ts): which
// period "Top today" ranks over when few items were saved today, the
// sections it draws and their honest titles, and /community/all's query.
// The rankings' own SQL runs against Postgres, not here: the queries are
// replaced by lists.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
// next/font only works inside Next's compiler (page template previews).
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

const lists = vi.hoisted(() => ({
  saved: { day: [], week: [], all: [] } as Record<string, unknown[]>,
  trending: [] as unknown[],
  fresh: [] as unknown[],
  makers: [] as unknown[],
}));

vi.mock("@/lib/community/queries", () => ({
  mostSavedItems: async ({ since }: { since: Date | null }) => {
    if (!since) return lists.saved.all;
    const days = (Date.now() - since.getTime()) / 86_400_000;
    return days < 2 ? lists.saved.day : lists.saved.week;
  },
  trendingItems: async () => lists.trending,
  listItems: async (options: { official?: boolean; featured?: boolean }) =>
    options.official === false ? lists.fresh : [],
  listFrames: async () => [],
  legacyThemeCards: async () => [],
  topMakers: async () => lists.makers,
}));
vi.mock("@/lib/community/store", () => ({
  COMMUNITY_TAG: "community-items",
  communityState: async () => ({ tables: true, themes: "items" }),
}));

import {
  allHref,
  isRanking,
  parseAllQuery,
} from "@/app/(app)/(home)/community/all/browse";
import { homeRow } from "@/components/community/home-rows";
import { freshRow, getCommunityHome, homeSizes } from "@/lib/community/home";
import {
  MAX_SECTIONS,
  periodStart,
  pickSections,
  pickTopTier,
  SECTION_ORDER,
  TOP_MIN,
  withoutShown,
} from "@/lib/community/home-sections";
import type { CommunityItemCard, RankedCard } from "@/lib/community/types";

const DAY = 86_400_000;

function card(id: string, extra: Partial<CommunityItemCard> = {}) {
  return {
    id,
    type: "theme",
    slug: id,
    name: id,
    description: null,
    creator: {
      profileId: "p",
      handle: "ana",
      displayName: "Ana",
      avatarUrl: null,
      official: false,
      verified: false,
    },
    isOfficial: false,
    version: 1,
    likeCount: 0,
    saveCount: 0,
    useCount: 0,
    tags: [],
    publishedAt: null,
    preview: {},
    ...extra,
  } satisfies CommunityItemCard;
}

const ranked = (prefix: string, n: number): RankedCard[] =>
  Array.from({ length: n }, (_, index) => ({
    card: card(`${prefix}${index + 1}`),
    count: n - index,
  }));

describe("pickTopTier", () => {
  it("ranks today's saves when enough items were saved today", () => {
    const tier = pickTopTier([
      { period: "day", items: [1, 2, 3, 4, 5] },
      { period: "week", items: [1, 2, 3, 4, 5, 6, 7] },
      { period: "all", items: [1, 2, 3, 4, 5, 6, 7, 8] },
    ]);
    expect(tier?.period).toBe("day");
  });

  it("falls back to the week, then all time, when a period is short", () => {
    expect(
      pickTopTier([
        { period: "day", items: [1, 2] },
        { period: "week", items: [1, 2, 3, 4, 5] },
        { period: "all", items: [1, 2, 3, 4, 5, 6] },
      ])?.period,
    ).toBe("week");
    expect(
      pickTopTier([
        { period: "day", items: [] },
        { period: "week", items: [1, 2, 3, 4] },
        { period: "all", items: [1, 2, 3, 4, 5, 6] },
      ])?.period,
    ).toBe("all");
  });

  it("shows the longest period as it is when none has enough", () => {
    const tier = pickTopTier([
      { period: "day", items: [1] },
      { period: "week", items: [1, 2] },
      { period: "all", items: [1, 2, 3] },
    ]);
    expect(tier).toEqual({ period: "all", items: [1, 2, 3] });
  });

  it("is empty when nothing was ever saved", () => {
    expect(
      pickTopTier([
        { period: "day", items: [] },
        { period: "week", items: [] },
        { period: "all", items: [] },
      ]),
    ).toBeNull();
  });
});

describe("periodStart", () => {
  it("counts back a day, a week or a month; all time has no start", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(periodStart("day", now)?.toISOString()).toBe(
      "2026-11-14T12:00:00.000Z",
    );
    expect(periodStart("week", now)?.toISOString()).toBe(
      "2026-11-08T12:00:00.000Z",
    );
    expect(periodStart("month", now)?.toISOString()).toBe(
      "2026-10-16T12:00:00.000Z",
    );
    expect(periodStart("all", now)).toBeNull();
  });
});

describe("withoutShown", () => {
  it("drops the items another row already shows", () => {
    const list = ranked("t", 4);
    const shown = [list[1]?.card, list[3]?.card].filter(
      (item): item is CommunityItemCard => Boolean(item),
    );
    expect(withoutShown(list, shown).map((item) => item.card.id)).toEqual([
      "t1",
      "t3",
    ]);
  });
});

describe("pickSections", () => {
  const sizes = {
    top: 10,
    trending: 10,
    picks: 6,
    fresh: 10,
    official: 10,
    themes: 10,
    templates: 8,
    collections: 8,
    makers: 6,
  };

  it("keeps the most important rows, drawn in page order", () => {
    const shown = pickSections(sizes);
    expect(shown).toHaveLength(MAX_SECTIONS);
    expect(shown).toEqual([
      "top",
      "trending",
      "fresh",
      "official",
      "themes",
      "templates",
      "makers",
    ]);
    expect(SECTION_ORDER.filter((id) => shown.includes(id))).toEqual(shown);
  });

  it("leaves out rows without enough items", () => {
    const shown = pickSections({
      ...sizes,
      top: 2,
      trending: 3,
      makers: 2,
      collections: 0,
    });
    expect(shown).not.toContain("top");
    expect(shown).not.toContain("trending");
    expect(shown).not.toContain("makers");
    expect(shown).toContain("picks");
  });

  it("ranks once three items have saves", () => {
    expect(pickSections({ ...sizes, top: 3 })).toContain("top");
  });
});

describe("freshRow", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const at = (days: number) =>
    new Date(now.getTime() - days * DAY).toISOString();

  it("says 'this week' only for items from the last 7 days", () => {
    const cards = [1, 2, 3, 4, 5, 9, 20].map((days) =>
      card(`f${days}`, { publishedAt: at(days) }),
    );
    const row = freshRow(cards, now);
    expect(row.thisWeek).toBe(true);
    expect(row.cards.map((item) => item.id)).toEqual([
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
    ]);
  });

  it("shows the newest as they are when too few are from this week", () => {
    const cards = [1, 2, 30, 40].map((days) =>
      card(`f${days}`, { publishedAt: at(days) }),
    );
    expect(freshRow(cards, now)).toEqual({ thisWeek: false, cards });
  });
});

describe("the overview", () => {
  beforeEach(() => {
    lists.saved = { day: [], week: [], all: [] };
    lists.trending = [];
    lists.fresh = [];
    lists.makers = [];
  });

  it("titles Top for the period it really ranks", async () => {
    lists.saved = {
      day: ranked("d", 2),
      week: ranked("w", TOP_MIN + 1),
      all: ranked("a", 12),
    };
    const home = await getCommunityHome();
    expect(home.top?.period).toBe("week");
    const row = homeRow("top", home);
    expect(row.title).toBe("Top this week");
    expect(row.sub).toBe("Bookmarked most in the last 7 days");
    expect(row.href).toBe("/community/all?period=week");
  });

  it("keeps Top's items out of Trending", async () => {
    lists.saved = { day: ranked("x", 6), week: [], all: [] };
    lists.trending = [...ranked("x", 3), ...ranked("y", 5)];
    const home = await getCommunityHome();
    expect(home.top?.period).toBe("day");
    expect(home.trending.map((item) => item.card.id)).toEqual([
      "y1",
      "y2",
      "y3",
      "y4",
      "y5",
    ]);
  });

  it("draws no Top row when nothing was saved", async () => {
    const home = await getCommunityHome();
    expect(home.top).toBeNull();
    expect(homeSizes(home).top).toBe(0);
    expect(pickSections(homeSizes(home))).not.toContain("top");
  });
});

describe("/community/all's query", () => {
  it("reads known values and drops the rest", () => {
    expect(parseAllQuery({})).toEqual({
      q: null,
      sort: "bookmarked",
      period: "all",
      from: "all",
    });
    // Bookmarks were once called saves: old links still rank them
    expect(parseAllQuery({ sort: "saved" }).sort).toBe("bookmarked");
    expect(
      parseAllQuery({
        sort: "trending",
        period: ["week", "day"],
        from: "picks",
        q: "  wifi  ",
      }),
    ).toEqual({ q: "wifi", sort: "trending", period: "week", from: "picks" });
    expect(parseAllQuery({ sort: "best", period: "year", from: "x" })).toEqual(
      parseAllQuery({}),
    );
  });

  it("links with the defaults left out", () => {
    const query = parseAllQuery({ sort: "trending", period: "week" });
    expect(allHref(query)).toBe("/community/all?sort=trending&period=week");
    expect(allHref(query, { sort: "bookmarked", period: "all" })).toBe(
      "/community/all",
    );
    // Newest has no period
    expect(allHref(query, { sort: "newest", from: "community" })).toBe(
      "/community/all?sort=newest&from=community",
    );
  });

  it("ranks unless it's a search or the newest", () => {
    expect(isRanking(parseAllQuery({}))).toBe(true);
    expect(isRanking(parseAllQuery({ sort: "newest" }))).toBe(false);
    expect(isRanking(parseAllQuery({ q: "menu" }))).toBe(false);
  });
});
