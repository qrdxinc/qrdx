// Which rows the /community overview shows, in what order, and what they're
// called. Pure (no database), so the rules are tested on their own; the
// rows' items come from lib/community/home.ts. Safe to import anywhere.

import type { CommunityItemCard } from "./types";

export type { RankedCard } from "./types";

/** How far back a ranking counts: a day, a week, a month or all time. */
export type RankPeriod = "day" | "week" | "month" | "all";

export const RANK_PERIODS: RankPeriod[] = ["day", "week", "month", "all"];

const DAY_MS = 86_400_000;

const PERIOD_DAYS: Record<Exclude<RankPeriod, "all">, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/** When a period starts, counted back from `now` (null: all time). */
export function periodStart(period: RankPeriod, now: Date): Date | null {
  return period === "all"
    ? null
    : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
}

/** "Top today" holds this many items. */
export const TOP_SIZE = 10;

/** A period needs this many saved items, or the next longer one is used. */
export const TOP_MIN = 5;

/**
 * The ranking "Top today" shows: today's saves when at least `min` items
 * were saved today, else this week's, else all time's. When even all time
 * has fewer, the longest period that has any is shown as it is; null when
 * nothing was ever saved. `tiers` run from the shortest period.
 */
export function pickTopTier<T>(
  tiers: { period: RankPeriod; items: T[] }[],
  min = TOP_MIN,
): { period: RankPeriod; items: T[] } | null {
  const full = tiers.find((tier) => tier.items.length >= min);
  if (full) return full;
  const filled = tiers.filter((tier) => tier.items.length > 0);
  return filled.at(-1) ?? null;
}

/** The items of `list` that aren't in `shown` (by id, or type and slug). */
export function withoutShown<T extends { card: CommunityItemCard }>(
  list: T[],
  shown: CommunityItemCard[],
): T[] {
  const key = (card: CommunityItemCard) =>
    card.id ?? `${card.type}:${card.slug}`;
  const seen = new Set(shown.map(key));
  return list.filter((item) => !seen.has(key(item.card)));
}

export type HomeSectionId =
  | "top"
  | "trending"
  | "picks"
  | "fresh"
  | "official"
  | "themes"
  | "templates"
  | "collections"
  | "makers";

/** What each row needs to be shown at all. */
export const SECTION_MIN: Record<HomeSectionId, number> = {
  // One or two saved items make a lonely ranking: until three have saves,
  // the overview starts with the next row.
  top: 3,
  // Trending repeats what Top shows, minus Top's items: a short row isn't one
  trending: 4,
  picks: 1,
  fresh: 1,
  official: 1,
  themes: 1,
  templates: 1,
  collections: 1,
  makers: 3,
};

/**
 * Rows by importance: when more than `max` have items, the least important
 * are left out. The page draws them in its own order (SECTION_ORDER).
 */
export const SECTION_PRIORITY: HomeSectionId[] = [
  "top",
  "fresh",
  "official",
  "templates",
  "themes",
  "trending",
  "makers",
  "picks",
  "collections",
];

/** The order the rows are drawn in, top to bottom. */
export const SECTION_ORDER: HomeSectionId[] = [
  "top",
  "trending",
  "picks",
  "fresh",
  "official",
  "themes",
  "templates",
  "collections",
  "makers",
];

/** The most rows the overview draws. */
export const MAX_SECTIONS = 7;

/**
 * The rows to draw, in drawing order: those with enough items, at most
 * `max`, keeping the most important.
 */
export function pickSections(
  sizes: Record<HomeSectionId, number>,
  max = MAX_SECTIONS,
): HomeSectionId[] {
  const kept = new Set(
    SECTION_PRIORITY.filter((id) => sizes[id] >= SECTION_MIN[id]).slice(0, max),
  );
  return SECTION_ORDER.filter((id) => kept.has(id));
}

/** "Top today", "Top this week"... for the period the ranking covers. */
export const TOP_TITLES: Record<RankPeriod, { title: string; sub: string }> = {
  day: {
    title: "Top today",
    sub: "Bookmarked most in the last 24 hours",
  },
  week: {
    title: "Top this week",
    sub: "Bookmarked most in the last 7 days",
  },
  month: {
    title: "Top this month",
    sub: "Bookmarked most in the last 30 days",
  },
  all: {
    title: "Most bookmarked",
    sub: "Bookmarked most since the community opened",
  },
};
