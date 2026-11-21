// The "New" tag on community cards: an item published in the last thirty
// days wears the pill and its link says so; older ones don't. The shared
// helper for catalogue batches (lib/whats-new/index.ts) stops the day after
// a batch's date.
import { describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

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
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { ItemCard } from "@/components/community/item-card";
import type { CommunityItemCard } from "@/lib/community/types";
import { isNewIn } from "@/lib/whats-new";
import { isNewPublished, NEW_FOR_DAYS } from "@/lib/whats-new/community";

const DAY = 86_400_000;
const daysAgo = (days: number, now = new Date()) =>
  new Date(now.getTime() - days * DAY).toISOString();

const card = (publishedAt: string | null): CommunityItemCard => ({
  id: "it_1",
  type: "theme",
  slug: "paper-ink",
  name: "Paper and ink",
  description: null,
  creator: {
    profileId: null,
    handle: "qrdx",
    displayName: "QRdx",
    avatarUrl: null,
    official: true,
    verified: true,
  },
  isOfficial: true,
  version: 1,
  likeCount: 0,
  saveCount: 0,
  useCount: 0,
  tags: [],
  publishedAt,
  preview: {},
});

describe("isNewPublished", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("is true within the last thirty days, false after", () => {
    expect(isNewPublished(daysAgo(0, now), now)).toBe(true);
    expect(isNewPublished(daysAgo(NEW_FOR_DAYS - 1, now), now)).toBe(true);
    expect(isNewPublished(daysAgo(NEW_FOR_DAYS, now), now)).toBe(true);
    expect(isNewPublished(daysAgo(NEW_FOR_DAYS + 1, now), now)).toBe(false);
    expect(isNewPublished(daysAgo(90, now), now)).toBe(false);
  });

  it("takes a Date too, and nothing without a date is new", () => {
    expect(isNewPublished(new Date(now.getTime() - DAY), now)).toBe(true);
    expect(isNewPublished(null, now)).toBe(false);
    expect(isNewPublished(undefined, now)).toBe(false);
    expect(isNewPublished("not a date", now)).toBe(false);
  });
});

describe("isNewIn", () => {
  const batches = [{ ids: ["leaf", "drop"], until: "2026-12-31" }];

  it("is true for a batch's id until its date, false the day after", () => {
    expect(isNewIn(batches, "leaf", new Date("2026-11-20T12:00:00Z"))).toBe(
      true,
    );
    expect(isNewIn(batches, "leaf", new Date("2026-12-31T23:59:59Z"))).toBe(
      true,
    );
    expect(isNewIn(batches, "leaf", new Date("2027-01-01T00:00:00Z"))).toBe(
      false,
    );
    expect(isNewIn(batches, "square", new Date("2026-11-20T12:00:00Z"))).toBe(
      false,
    );
  });
});

describe("the item card", () => {
  it("wears the New pill and says so in its link when just published", () => {
    const html = renderIntl(<ItemCard card={card(daysAgo(1))} />);
    expect(html).toContain("data-new-tag");
    expect(html).toMatch(/<span class="[^"]*rounded-full[^"]*">New<\/span>/);
    expect(html).toContain('aria-label="Paper and ink, new, Theme"');
  });

  it("shows no pill on an item published long ago, or without a date", () => {
    for (const publishedAt of [daysAgo(45), null]) {
      const html = renderIntl(<ItemCard card={card(publishedAt)} />);
      expect(html).not.toContain("data-new-tag");
      expect(html).not.toMatch(/>New</);
      expect(html).toContain('aria-label="Paper and ink, Theme"');
    }
  });
});
