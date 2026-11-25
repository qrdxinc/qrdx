// A community item page's robots: frames' pages are `noindex, follow`
// (owner decision, 25 Nov 2026: tiered indexing; lib/community/sitemap.ts
// leaves them out of the sitemap too), every other type is indexed.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityItemDetail } from "@/lib/community/types";

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

const getItem = vi.fn();
vi.mock("@/lib/community/queries", () => ({
  getItem: (...args: unknown[]) => getItem(...args),
  moreFromCreator: vi.fn(),
  remixesOf: vi.fn(),
}));
vi.mock("@/lib/community/viewer", () => ({ viewerId: async () => null }));
vi.mock("@/app/(app)/admin/_lib/guard", () => ({
  assertAdmin: vi.fn(),
  getAdminUser: async () => null,
}));

const { generateMetadata } = await import(
  "@/app/(app)/(home)/community/[type]/[slug]/page"
);

const detail = (overrides: Partial<CommunityItemDetail>) =>
  ({
    id: "item-1",
    type: "theme",
    slug: "sunset",
    name: "Sunset",
    description: "Warm colours.",
    creator: {
      profileId: "p1",
      handle: "ana",
      displayName: "Ana",
      avatarUrl: null,
      official: false,
      verified: false,
    },
    ...overrides,
  }) as CommunityItemDetail;

const metadata = (segment: string, slug: string) =>
  generateMetadata({ params: Promise.resolve({ type: segment, slug }) });

describe("community item page robots", () => {
  beforeEach(() => getItem.mockReset());

  it("keeps official and members' frames out of search, links followed", async () => {
    for (const official of [true, false]) {
      getItem.mockResolvedValue(
        detail({ type: "frame", slug: "scan-me", isOfficial: official }),
      );
      const meta = await metadata("frames", "scan-me");
      expect(meta.robots, String(official)).toEqual({
        index: false,
        follow: true,
      });
      expect(meta.alternates?.canonical).toBe(
        "http://localhost:3000/community/frames/scan-me",
      );
    }
  });

  it("indexes themes, page templates, collections and kits", async () => {
    for (const [type, segment] of [
      ["theme", "themes"],
      ["page-template", "templates"],
      ["collection", "collections"],
      ["kit", "kits"],
    ] as const) {
      getItem.mockResolvedValue(detail({ type, slug: "x" }));
      expect((await metadata(segment, "x")).robots, type).toBeUndefined();
    }
  });
});
