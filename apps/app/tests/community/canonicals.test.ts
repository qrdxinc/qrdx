// Canonical URLs of the community's paged lists, and the profile's tab
// links. Each page of a gallery's or a profile's full list is its own
// canonical page, so search engines reach the items past the first page; a
// filtered view points at the full list. Search Console showed the pages
// after the first pointing at page 1.
import { describe, expect, it, vi } from "vitest";

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

import {
  galleryCanonical,
  parseGalleryQuery,
} from "@/app/(app)/(home)/community/[type]/gallery";
import { profileCanonical, profileHref } from "@/lib/community/handles";
import { TYPE_SEGMENTS, typeFromSegment } from "@/lib/community/types";

const query = (type: string, params: Record<string, string> = {}) => {
  const parsed = parseGalleryQuery(type, params);
  if (!parsed) throw new Error(`not a gallery type: ${type}`);
  return parsed;
};

describe("galleryCanonical", () => {
  it("is the gallery itself on its first page", () => {
    expect(galleryCanonical(query("theme"), 1)).toBe("/community/themes");
    expect(galleryCanonical(query("page-template"), 1)).toBe(
      "/community/templates",
    );
  });

  it("keeps the page number on the pages after the first", () => {
    expect(galleryCanonical(query("theme"), 2)).toBe(
      "/community/themes?page=2",
    );
    expect(galleryCanonical(query("frame"), 41)).toBe(
      "/community/frames?page=41",
    );
  });

  it("points a filtered, re-sorted, grouped or tagged view at the full list", () => {
    const views: Record<string, string>[] = [
      { from: "official" },
      { from: "mine" },
      { sort: "newest" },
      { tag: "elegant" },
    ];
    for (const params of views) {
      expect(galleryCanonical(query("theme", params), 3)).toBe(
        "/community/themes",
      );
    }
    // One of the URLs in Search Console's report.
    expect(
      galleryCanonical(
        query("frame", { from: "official", sort: "newest", group: "holidays" }),
        3,
      ),
    ).toBe("/community/frames");
  });

  it("ignores parameters the gallery doesn't read", () => {
    expect(galleryCanonical(query("theme", { filter: "liked" }), 2)).toBe(
      "/community/themes?page=2",
    );
  });
});

describe("profileHref", () => {
  it("links every type's tab to the segment the profile reads back", () => {
    for (const [type, segment] of Object.entries(TYPE_SEGMENTS)) {
      const href = profileHref("qrdx", {
        tab: type as keyof typeof TYPE_SEGMENTS,
      });
      expect(href).toBe(`/community/@qrdx?type=${segment}`);
      const read = new URL(href, "https://qrdx.dev").searchParams.get("type");
      expect(typeFromSegment(read ?? "")).toBe(type);
    }
  });

  it("keeps the tab on the pages after the first", () => {
    expect(profileHref("ana", { tab: "kit", page: 3 })).toBe(
      "/community/@ana?type=kits&page=3",
    );
    expect(profileHref("ana", { page: 2 })).toBe("/community/@ana?page=2");
    expect(profileHref("ana", { page: 1 })).toBe("/community/@ana");
  });
});

describe("profileCanonical", () => {
  it("keeps the page number of the full list", () => {
    expect(profileCanonical("qrdx", null, 1)).toBe("/community/@qrdx");
    expect(profileCanonical("qrdx", null, 7)).toBe("/community/@qrdx?page=7");
  });

  it("points a tab at the full list", () => {
    expect(profileCanonical("qrdx", "frame", 4)).toBe("/community/@qrdx");
  });
});
