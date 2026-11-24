// The community's own sitemap (app/(app)/(home)/community/sitemap.ts):
// the item pages search engines may index and the creator profiles the
// galleries link to. Community galleries usually list theirs this way, in a
// sitemap of their own that robots.txt names. Pure: lib/community/queries.ts
// reads the items.
import { OFFICIAL_HANDLE, profilePath } from "./handles";
import { type CommunityItemType, itemPath } from "./types";

/**
 * Item types whose pages search engines don't index yet (owner decision,
 * 25 Nov 2026: tiered indexing). A frame's page has little text of its
 * own: a name, a line of description, its scan check and the licence; the
 * rest is the site's navigation. More than a thousand of them, official
 * frames for nearly every holiday and trade, would ask a young domain to
 * index pages that can't rank. Member-made frames use the same page, so
 * they're as thin and go the same way. Their pages stay up and `noindex,
 * follow` (app/(app)/(home)/community/[type]/[slug]/page.tsx), out of the
 * sitemap, until they carry more text of their own. Themes, page
 * templates, collections and kits stay listed.
 */
export const UNINDEXED_ITEM_TYPES: readonly CommunityItemType[] = ["frame"];

/** Whether search engines may index `type`'s item pages. */
export const isIndexedItemType = (type: CommunityItemType): boolean =>
  !UNINDEXED_ITEM_TYPES.includes(type);

/** A listed item as the sitemap needs it (queries.ts, sitemapItems). */
export interface SitemapItem {
  type: CommunityItemType;
  slug: string;
  /** null until the creator claims a handle: no profile page then */
  handle: string | null;
  /** ISO date it last changed: published, or updated after */
  lastModified: string;
}

/** One URL of the sitemap. */
export interface CommunitySitemapEntry {
  path: string;
  /** ISO date; absent when there's no real one (lib/seo-dates.ts) */
  lastModified?: string;
}

const later = (a: string | undefined, b: string | undefined) =>
  a && b ? (a > b ? a : b) : (a ?? b);

/**
 * The indexed item pages (isIndexedItemType), then the profiles with any
 * item, frames included: a profile is a gallery of its creator's work. A
 * profile's date is its latest item's. The engine's official frames have
 * pages whether or not the database holds them (queries.ts, getItem), so
 * @qrdx is listed whenever there are any, and keeps the database's date
 * when it holds items of its own.
 */
export function communitySitemapEntries({
  items,
  officialFrameSlugs,
}: {
  items: readonly SitemapItem[];
  officialFrameSlugs: readonly string[];
}): CommunitySitemapEntry[] {
  const pages = new Map<string, string | undefined>();
  const profiles = new Map<string, string | undefined>();
  for (const item of items) {
    if (isIndexedItemType(item.type)) {
      const path = itemPath(item.type, item.slug);
      pages.set(path, later(pages.get(path), item.lastModified));
    }
    if (item.handle) {
      profiles.set(
        item.handle,
        later(profiles.get(item.handle), item.lastModified),
      );
    }
  }
  if (isIndexedItemType("frame")) {
    for (const slug of officialFrameSlugs) {
      const path = itemPath("frame", slug);
      if (!pages.has(path)) pages.set(path, undefined);
    }
  }
  if (officialFrameSlugs.length > 0 && !profiles.has(OFFICIAL_HANDLE)) {
    profiles.set(OFFICIAL_HANDLE, undefined);
  }
  const list = (entries: [string, string | undefined][]) =>
    entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, lastModified]) =>
        lastModified ? { path, lastModified } : { path },
      );
  return [
    ...list([...pages]),
    ...list([...profiles].map(([handle, date]) => [profilePath(handle), date])),
  ];
}
