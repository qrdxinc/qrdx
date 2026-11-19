// A community card: its picture says what the item is (a frame around an
// empty slot, a theme as a swatch, a kit as look + page), and its caption
// gives the name with its saves on the first line, the creator with the
// item's type (an icon and its name) on the second.

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

import { getOfficialFrame } from "qrdx";
import { ItemGrid, TYPE_ICONS } from "@/components/community/item-card";
import { MAX_CHIPS } from "@/components/community/theme-swatch";
import { SWATCH_VIEW_BOX } from "@/components/community/type-previews";
import { officialFramePreview } from "@/lib/community/catalog";
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

const TABLE_TENT = getOfficialFrame("table-tent");
if (!TABLE_TENT) throw new Error("table-tent is missing");
const FRAME_PREVIEW = officialFramePreview(TABLE_TENT);

/** A card drawn as on the first screen (its picture in the HTML). */
const eagerCard = (overrides: Partial<CommunityItemCard>) =>
  renderIntl(ItemGrid({ cards: [card(overrides)], eager: 1 }));

/** The colors of a swatch's chips, in order. */
const chips = (html: string) =>
  [
    ...(
      html.match(/data-swatch-colors="">([\s\S]*?)<\/ul>/)?.[1] ?? ""
    ).matchAll(/background-color:(#[0-9a-f]+)/g),
  ].map((match) => match[1]);

describe("community card pictures", () => {
  it("draw a frame around an empty slot, not a code", () => {
    const html = eagerCard({ type: "frame", preview: FRAME_PREVIEW });
    expect(html).toContain('data-qrdx-frame="custom"');
    expect(html).toContain(">Your QR code</text>");
    expect(html).toContain("Scan for our menu");
    // No code: its 128 × 128 <svg> isn't drawn
    expect(html).not.toContain('viewBox="0 0 128 128"');
    expect(html).not.toContain(SWATCH_VIEW_BOX);
  });

  it("show a theme as a swatch: a close-up and its colors, once each", () => {
    const html = eagerCard({
      type: "theme",
      preview: {
        fgColor: "#1D4ED8",
        eyeColor: "#1d4ed8",
        dotColor: "#0f172a",
        bgColor: "#ffffff",
      },
    });
    expect(html).toContain(`viewBox="${SWATCH_VIEW_BOX}"`);
    expect(chips(html)).toEqual(["#1d4ed8", "#0f172a", "#ffffff"]);
    expect(html).not.toContain("Your QR code");
  });

  it("show a theme that carries a frame as a swatch too", () => {
    const html = eagerCard({
      type: "theme",
      preview: {
        fgColor: "#3b2a20",
        bgColor: "#fbf6ee",
        frame: FRAME_PREVIEW.frame,
      },
    });
    expect(html).toContain(`viewBox="${SWATCH_VIEW_BOX}"`);
    expect(html).not.toContain("data-qrdx-frame");
  });

  it("cap a swatch's chips", () => {
    const stops = [
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
    ];
    const html = eagerCard({
      type: "theme",
      preview: {
        fgColor: {
          type: "linear",
          angle: 0,
          stops: stops.map((color, index) => ({ color, offset: index * 20 })),
        },
      },
    });
    expect(chips(html)).toHaveLength(MAX_CHIPS);
  });

  it("draw a kit's look as a swatch, or as its frame when it has no theme", () => {
    const withTheme = eagerCard({
      type: "kit",
      kit: { page: "p", theme: "t", frame: "f" },
      preview: { fgColor: "#0f766e", frame: FRAME_PREVIEW.frame },
    });
    expect(withTheme).toContain(`viewBox="${SWATCH_VIEW_BOX}"`);
    expect(withTheme).not.toContain("Your QR code");

    const frameOnly = eagerCard({
      type: "kit",
      kit: { page: "p", frame: "f" },
      preview: FRAME_PREVIEW,
    });
    expect(frameOnly).toContain("Your QR code");
    expect(frameOnly).not.toContain(SWATCH_VIEW_BOX);
  });

  it("leave the pictures of cards past the first screen to the browser", () => {
    const html = renderIntl(
      ItemGrid({
        cards: [
          card({ type: "frame", preview: FRAME_PREVIEW }),
          card({ type: "theme", preview: { fgColor: "#1d4ed8" } }),
        ],
      }),
    );
    expect(html).not.toContain("Your QR code");
    expect(html).not.toContain(SWATCH_VIEW_BOX);
    // The chips are plain HTML, there from the start
    expect(chips(html)).toEqual(["#1d4ed8", "#ffffff"]);
  });
});

describe("community card captions on hover", () => {
  /** The class list of the caption: the element holding the card's name. */
  const captionClass = (html: string) => {
    const at = html.indexOf(">Harbour Blue<");
    const open = html.lastIndexOf(
      '<div class="',
      html.lastIndexOf('<div class="', at) - 1,
    );
    return html.slice(open + 12, html.indexOf('"', open + 12)).split(" ");
  };

  it("wait out of sight where a pointer can hover, and keep their room", () => {
    const classes = captionClass(renderIntl(ItemGrid({ cards: [card({})] })));
    // Hidden only on mouse and trackpad devices: touch screens always show it
    expect(classes).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
    );
    expect(
      classes.some((c) => /^(hidden|invisible)$|:(hidden|invisible)$/.test(c)),
    ).toBe(false);
  });

  it("come back when the card is hovered or holds keyboard focus", () => {
    const classes = captionClass(renderIntl(ItemGrid({ cards: [card({})] })));
    expect(classes).toContain("group-hover:opacity-100");
    expect(classes).toContain("group-has-[a:focus-visible]:opacity-100");
  });
});

describe("community card rows", () => {
  it("leave room above the cards for a hovered card to lift into", async () => {
    const { RAIL, CARD_ART } = await import(
      "@/components/community/card-layout"
    );
    const classes = RAIL.split(" ");
    // A row that scrolls sideways clips up and down too: the room above
    // must be at least the lift, and taken back so the row doesn't move.
    const lift = CARD_ART.match(/group-hover:-translate-y-(\d+(?:\.\d+)?)/);
    const room = RAIL.match(/(?:^| )pt-(\d+(?:\.\d+)?)(?: |$)/);
    expect(lift).not.toBeNull();
    expect(room).not.toBeNull();
    expect(Number(room?.[1])).toBeGreaterThan(Number(lift?.[1]));
    expect(classes).toContain(`-mt-${room?.[1]}`);
  });
});
