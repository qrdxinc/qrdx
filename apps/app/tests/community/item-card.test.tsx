// A community card's caption: the name with its saves on the first line, the
// creator with the item's type (an icon and its name) on the second.

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

import { ItemGrid, TYPE_ICONS } from "@/components/community/item-card";
import {
  type CommunityItemCard,
  type CommunityItemType,
  TYPE_LABELS,
} from "@/lib/community/types";

const card = (overrides: Partial<CommunityItemCard>): CommunityItemCard => ({
  id: "it_1",
  type: "theme",
  slug: "harbour-blue-ab12",
  name: "Harbour Blue",
  description: null,
  creator: {
    profileId: "pr_1",
    handle: "ana",
    displayName: "Ana Ruiz",
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
  ...overrides,
});

/** The caption's second line: from the creator's name to the card's end. */
const typeEnd = (html: string) => html.slice(html.indexOf("Ana Ruiz"));

describe("community card captions", () => {
  it("give every type an icon", () => {
    for (const type of Object.keys(TYPE_LABELS) as CommunityItemType[]) {
      expect(TYPE_ICONS[type], type).toBeTruthy();
    }
    // Each type is told apart by its own mark.
    expect(new Set(Object.values(TYPE_ICONS)).size).toBe(
      Object.keys(TYPE_LABELS).length,
    );
  });

  it("show the type with its icon after the creator, with no separator", () => {
    const html = renderIntl(ItemGrid({ cards: [card({ type: "frame" })] }));
    const end = typeEnd(html);
    expect(end).toMatch(/<svg[\s\S]*?<\/svg>Frame</);
    expect(html).not.toContain("·");
  });

  it("show the saves with their icon when there are any", () => {
    const saved = renderIntl(ItemGrid({ cards: [card({ saveCount: 1234 })] }));
    expect(saved).toMatch(
      /<svg[\s\S]*?<\/svg><span class="sr-only">[^<]+<\/span>1.2K/,
    );

    const unsaved = renderIntl(ItemGrid({ cards: [card({ saveCount: 0 })] }));
    expect(unsaved).not.toContain("sr-only");
  });

  it("show a collection's size in place of its type", () => {
    const html = renderIntl(
      ItemGrid({
        cards: [card({ type: "collection", itemCount: 4, stack: [] })],
      }),
    );
    expect(typeEnd(html)).toMatch(/<svg[\s\S]*?<\/svg>4 items</);
    expect(typeEnd(html)).not.toContain(">Collection<");
  });
});
