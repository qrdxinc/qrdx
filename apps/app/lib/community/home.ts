import "server-only";

import { unstable_cache } from "next/cache";
import type { ThemeStyles } from "@/types/theme";
import {
  type HomeSectionId,
  periodStart,
  pickTopTier,
  type RankPeriod,
  TOP_MIN,
  TOP_SIZE,
  withoutShown,
} from "./home-sections";
import {
  legacyThemeCards,
  listFrames,
  listItems,
  mostSavedItems,
  topMakers,
  trendingItems,
} from "./queries";
import { checkScanGate, type ScanGate } from "./scan-gate";
import { COMMUNITY_TAG, communityState } from "./store";
import {
  CARD_CACHE_KEY,
  type CommunityItemCard,
  type CommunityMaker,
  type RankedCard,
} from "./types";

/** Cards in each of the overview's plain rows. */
export const ROW_SIZE = 10;

const DAY_MS = 86_400_000;

export interface CommunityHome {
  /** The most saved items, over the shortest period that has enough */
  top: { period: RankPeriod; items: RankedCard[] } | null;
  /** This week's saves, uses and remixes, without Top's items */
  trending: RankedCard[];
  /** Featured by the QRdx team */
  picks: CommunityItemCard[];
  /** Members' newest items; `thisWeek` when they're all from the last 7 days */
  fresh: { thisWeek: boolean; cards: CommunityItemCard[] };
  /** QRdx's own frames */
  official: CommunityItemCard[];
  themes: CommunityItemCard[];
  /** The newest page templates */
  templates: CommunityItemCard[];
  collections: CommunityItemCard[];
  makers: CommunityMaker[];
}

/** Members' newest items, called "new this week" when enough are. */
export function freshRow(
  cards: CommunityItemCard[],
  now: Date,
): CommunityHome["fresh"] {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const thisWeek = cards.filter(
    (card) => card.publishedAt && Date.parse(card.publishedAt) >= weekAgo,
  );
  return thisWeek.length >= TOP_MIN
    ? { thisWeek: true, cards: thisWeek }
    : { thisWeek: false, cards };
}

async function loadHome(): Promise<CommunityHome> {
  const now = new Date();
  const state = await communityState();
  const [
    today,
    week,
    allTime,
    trending,
    picks,
    fresh,
    official,
    themes,
    templates,
    collections,
    makers,
  ] = await Promise.all([
    mostSavedItems({ since: periodStart("day", now), limit: TOP_SIZE }),
    mostSavedItems({ since: periodStart("week", now), limit: TOP_SIZE }),
    mostSavedItems({ since: null, limit: TOP_SIZE }),
    // Twice a row: Top's items come out of it.
    trendingItems({ since: periodStart("week", now), limit: TOP_SIZE * 2 }),
    listItems({ featured: true, limit: 12 }),
    listItems({ official: false, sort: "newest", limit: ROW_SIZE }),
    listFrames({ official: true }),
    state.themes === "items"
      ? listItems({ type: "theme", sort: "popular", limit: ROW_SIZE })
      : legacyThemeCards(ROW_SIZE),
    listItems({ type: "page-template", sort: "newest", limit: 8 }),
    listItems({ type: "collection", limit: 8 }),
    topMakers(12),
  ]);
  const top = pickTopTier([
    { period: "day", items: today },
    { period: "week", items: week },
    { period: "all", items: allTime },
  ]);
  return {
    top,
    trending: withoutShown(
      trending,
      top?.items.map((item) => item.card) ?? [],
    ).slice(0, TOP_SIZE),
    picks,
    fresh: freshRow(fresh, now),
    official: official.slice(0, ROW_SIZE),
    themes,
    templates,
    collections,
    makers,
  };
}

/** Everything the /community overview shows (cached for a minute). */
export const getCommunityHome = unstable_cache(
  loadHome,
  ["community-home", CARD_CACHE_KEY],
  {
    revalidate: 60,
    tags: [COMMUNITY_TAG, "community-themes"],
  },
);

/** How many items each of the overview's rows has (for pickSections). */
export const homeSizes = (
  home: CommunityHome,
): Record<HomeSectionId, number> => ({
  top: home.top?.items.length ?? 0,
  trending: home.trending.length,
  picks: home.picks.length,
  fresh: home.fresh.cards.length,
  official: home.official.length,
  themes: home.themes.length,
  templates: home.templates.length,
  collections: home.collections.length,
  makers: home.makers.length,
});

/** Whether any collection is published (for the Collections tab). */
export const hasCollections = unstable_cache(
  async () => (await listItems({ type: "collection", limit: 1 })).length > 0,
  ["community-has-collections"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/** Whether any page template is published (for the Templates tab). */
export const hasTemplates = unstable_cache(
  async () => (await listItems({ type: "page-template", limit: 1 })).length > 0,
  ["community-has-templates"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/** Whether any kit is published (for the Kits tab). */
export const hasKits = unstable_cache(
  async () => (await listItems({ type: "kit", limit: 1 })).length > 0,
  ["community-has-kits"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/**
 * The scan gate for an item page. Published versions never change, so the
 * result for a design is cached for good (the design is the cache key).
 */
export const itemScanGate = unstable_cache(
  async (styleJson: string): Promise<ScanGate> =>
    checkScanGate(JSON.parse(styleJson) as ThemeStyles),
  ["community-item-scan"],
  { revalidate: false },
);
