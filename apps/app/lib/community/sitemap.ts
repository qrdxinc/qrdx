// The community's own sitemap (app/(app)/(home)/community/sitemap.ts):
// every item page and creator profile the galleries link to. Community
// galleries usually list theirs this way, in a sitemap of their own that
// robots.txt names. Pure: lib/community/queries.ts reads the items.
import { OFFICIAL_HANDLE, profilePath } from "./handles";
import { type CommunityItemType, itemPath } from "./types";

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
 * The item pages, then the profiles with any of them. A profile's date is
 * its latest item's. The engine's official frames have pages whether or
 * not the database holds them (queries.ts, getItem), so each is listed,
 * and with them @qrdx; one the database holds keeps the database's date.
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
    const path = itemPath(item.type, item.slug);
    pages.set(path, later(pages.get(path), item.lastModified));
    if (item.handle) {
      profiles.set(
        item.handle,
        later(profiles.get(item.handle), item.lastModified),
      );
    }
  }
  for (const slug of officialFrameSlugs) {
    const path = itemPath("frame", slug);
    if (!pages.has(path)) pages.set(path, undefined);
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
