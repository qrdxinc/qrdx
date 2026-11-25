// The community's sitemap (/community/sitemap.xml): its indexed item pages
// and the profiles with any item, as lib/community/sitemap.ts builds it.
// Frames' pages are left out (owner decision, 25 Nov 2026: tiered indexing).

import { describe, expect, it } from "vitest";
import {
  communitySitemapEntries,
  isIndexedItemType,
  type SitemapItem,
} from "@/lib/community/sitemap";
import { COMMUNITY_TYPES } from "@/lib/community/types";

const item = (overrides: Partial<SitemapItem>): SitemapItem => ({
  type: "theme",
  slug: "sunset",
  handle: "ana",
  lastModified: "2026-11-10T08:00:00.000Z",
  ...overrides,
});

describe("communitySitemapEntries", () => {
  it("lists each item page, then each profile, with real dates", () => {
    const entries = communitySitemapEntries({
      items: [
        item({ type: "theme", slug: "sunset" }),
        item({
          type: "page-template",
          slug: "menu",
          lastModified: "2026-11-12T08:00:00.000Z",
        }),
        item({ type: "kit", slug: "cafe", handle: "bo" }),
      ],
      officialFrameSlugs: [],
    });
    expect(entries).toEqual([
      {
        path: "/community/kits/cafe",
        lastModified: "2026-11-10T08:00:00.000Z",
      },
      {
        path: "/community/templates/menu",
        lastModified: "2026-11-12T08:00:00.000Z",
      },
      {
        path: "/community/themes/sunset",
        lastModified: "2026-11-10T08:00:00.000Z",
      },
      // A profile's date is its latest item's.
      { path: "/community/@ana", lastModified: "2026-11-12T08:00:00.000Z" },
      { path: "/community/@bo", lastModified: "2026-11-10T08:00:00.000Z" },
    ]);
  });

  it("lists no profile for a creator without a handle", () => {
    const entries = communitySitemapEntries({
      items: [item({ handle: null })],
      officialFrameSlugs: [],
    });
    expect(entries.map((entry) => entry.path)).toEqual([
      "/community/themes/sunset",
    ]);
  });

  it("indexes every item type but frames", () => {
    expect(COMMUNITY_TYPES.filter(isIndexedItemType)).toEqual([
      "theme",
      "collection",
      "page-template",
      "kit",
    ]);
  });

  it("leaves out the engine's official frames, but lists @qrdx, without invented dates", () => {
    const entries = communitySitemapEntries({
      items: [
        // Stored: the database's row and date win for the profile.
        item({ type: "frame", slug: "scan-me", handle: "qrdx" }),
        item({ type: "theme", slug: "holiday", handle: "qrdx" }),
      ],
      officialFrameSlugs: ["scan-me", "tap-here"],
    });
    expect(entries).toEqual([
      {
        path: "/community/themes/holiday",
        lastModified: "2026-11-10T08:00:00.000Z",
      },
      { path: "/community/@qrdx", lastModified: "2026-11-10T08:00:00.000Z" },
    ]);
  });

  it("leaves out members' frames too, but lists their profiles", () => {
    const entries = communitySitemapEntries({
      items: [
        item({
          type: "frame",
          slug: "my-frame",
          handle: "ana",
          lastModified: "2026-11-20T08:00:00.000Z",
        }),
      ],
      officialFrameSlugs: [],
    });
    expect(entries).toEqual([
      { path: "/community/@ana", lastModified: "2026-11-20T08:00:00.000Z" },
    ]);
  });

  it("lists @qrdx with no stored items, from the engine's frames alone", () => {
    expect(
      communitySitemapEntries({ items: [], officialFrameSlugs: ["scan-me"] }),
    ).toEqual([{ path: "/community/@qrdx" }]);
  });

  it("is empty with no items and no official frames", () => {
    expect(
      communitySitemapEntries({ items: [], officialFrameSlugs: [] }),
    ).toEqual([]);
  });
});
