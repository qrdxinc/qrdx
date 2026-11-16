import "server-only";

import { unstable_cache } from "next/cache";
import { searchCommunityCards } from "@/lib/community/api";
import {
  periodStart,
  RANK_PERIODS,
  type RankPeriod,
} from "@/lib/community/home-sections";
import {
  listItems,
  mostSavedItems,
  type RankFilter,
  trendingItems,
} from "@/lib/community/queries";
import { COMMUNITY_TAG } from "@/lib/community/store";
import type { CommunityItemCard, RankedCard } from "@/lib/community/types";

// /community/all: every type in one list. The overview's "View all" links
// land here: a ranking (most saved, trending) over a period, the newest
// items, staff picks, or a search. Read-only and public; the lists are
// cached for a minute like the overview's.

export type AllSort = "saved" | "trending" | "newest";
export type AllFrom = "all" | "community" | "official" | "picks";

export const ALL_SORTS: AllSort[] = ["saved", "trending", "newest"];
export const ALL_FROM: AllFrom[] = ["all", "community", "official", "picks"];

/** How many items a list shows. */
export const ALL_LIMIT = 48;

export interface AllQuery {
  /** A search; when set, sort and period don't apply */
  q: string | null;
  sort: AllSort;
  period: RankPeriod;
  from: AllFrom;
}

const DEFAULT: Omit<AllQuery, "q"> = {
  sort: "saved",
  period: "all",
  from: "all",
};

const first = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.find((item) => item === first(value));

/** The query in the page's search parameters, unknown values dropped. */
export function parseAllQuery(params: Record<string, unknown>): AllQuery {
  const q = first(params.q);
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  return {
    q: search || null,
    sort: oneOf(ALL_SORTS, params.sort) ?? DEFAULT.sort,
    period: oneOf(RANK_PERIODS, params.period) ?? DEFAULT.period,
    from: oneOf(ALL_FROM, params.from) ?? DEFAULT.from,
  };
}

/** The page's link with some of its query changed (defaults left out). */
export function allHref(query: AllQuery, next: Partial<AllQuery> = {}): string {
  const merged = { ...query, ...next };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.sort !== DEFAULT.sort) params.set("sort", merged.sort);
  if (merged.sort !== "newest" && merged.period !== DEFAULT.period) {
    params.set("period", merged.period);
  }
  if (merged.from !== DEFAULT.from) params.set("from", merged.from);
  const search = params.toString();
  return search ? `/community/all?${search}` : "/community/all";
}

/** Whether the list is a ranking (its cards show their place). */
export const isRanking = (query: AllQuery) =>
  !query.q && query.sort !== "newest";

const filterOf = (from: AllFrom): RankFilter => ({
  ...(from === "official" && { official: true }),
  ...(from === "community" && { official: false }),
  ...(from === "picks" && { featured: true }),
});

async function listFor(
  sort: AllSort,
  period: RankPeriod,
  from: AllFrom,
): Promise<RankedCard[]> {
  const filter = filterOf(from);
  if (sort === "newest") {
    // Staff picks: the latest picked first
    const cards = await listItems({
      ...filter,
      sort: "newest",
      limit: ALL_LIMIT,
    });
    return cards.map((card) => ({ card, count: 0 }));
  }
  const since = periodStart(period, new Date());
  return sort === "trending"
    ? trendingItems({ since, limit: ALL_LIMIT, filter })
    : mostSavedItems({ since, limit: ALL_LIMIT, filter });
}

const cachedList = unstable_cache(listFor, ["community-all"], {
  revalidate: 60,
  tags: [COMMUNITY_TAG],
});

/** The cards a query shows, in order. */
export async function allCards(query: AllQuery): Promise<CommunityItemCard[]> {
  if (query.q) {
    const { cards } = await searchCommunityCards({
      q: query.q,
      limit: ALL_LIMIT,
    });
    // Staff picks aren't marked on cards: a search covers everyone's.
    return cards.filter((card) =>
      query.from === "official"
        ? card.isOfficial
        : query.from === "community"
          ? !card.isOfficial
          : true,
    );
  }
  const list = await cachedList(query.sort, query.period, query.from);
  return list.map((item) => item.card);
}
