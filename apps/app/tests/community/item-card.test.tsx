// A community card: its preview stands on a light stage and says what the
// item is (a frame around a sample code, a theme as a swatch, a page on a
// phone, a kit as look + page, a collection as a fan of its items), with
// the item's type on a quiet label in the stage's corner. The caption gives
// the name with its saves, then (on touch screens) the creator.

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
import { GALLERY_GRID } from "@/components/community/browse-sidebar";
import {
  CARD_ART,
  CARD_GRID,
  RAIL,
  STAGE,
  STAGE_LABEL,
} from "@/components/community/card-layout";
import { ItemGrid } from "@/components/community/item-card";
import stage from "@/components/community/stage.module.css";
import { MAX_CHIPS } from "@/components/community/theme-swatch";
import { officialFramePreview } from "@/lib/community/catalog";
import type { CommunityItemCard } from "@/lib/community/types";
import { buildTemplateContent } from "@/lib/landing/templates";

/** A card's like or bookmark button, from its opening tag to its end. */
const buttonOf = (html: string, reaction: "like" | "bookmark") => {
  const start = html.indexOf(`data-reaction="${reaction}"`);
  if (start < 0) throw new Error(`no ${reaction} button`);
  const open = html.lastIndexOf("<button", start);
  return html.slice(
    open,
    html.indexOf("</button>", start) + "</button>".length,
  );
};

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

const TABLE_TENT = getOfficialFrame("table-tent");
if (!TABLE_TENT) throw new Error("table-tent is missing");
const FRAME_PREVIEW = officialFramePreview(TABLE_TENT);
const PAGE = { type: "links", content: buildTemplateContent("links") };

/** A card drawn as on the first screen (its picture in the HTML). */
const eagerCard = (overrides: Partial<CommunityItemCard>) =>
  renderIntl(ItemGrid({ cards: [card(overrides)], eager: 1 }));

/** The words on the stage's type label. */
const typeLabel = (html: string) =>
  html.match(/data-type-label="">([^<]*)</)?.[1];

/** The caption's second line: from the creator's name to the card's end. */
const creatorLine = (html: string) => html.slice(html.indexOf("Ana Ruiz"));

/** The colors of a swatch's chips, in order. */
const chips = (html: string) =>
  [
    ...(
      html.match(/data-swatch-colors="">([\s\S]*?)<\/ul>/)?.[1] ?? ""
    ).matchAll(/background-color:(#[0-9a-f]+)/g),
  ].map((match) => match[1]);

/** The opening tag of the first element carrying `attribute`. */
const tagWith = (html: string, attribute: string) =>
  html.match(new RegExp(`<[a-z]+ [^>]*${attribute}[^>]*>`))?.[0] ?? "";

describe("community card stages", () => {
  it("are light in both colour schemes, and stay put on hover", () => {
    expect(STAGE).toContain("bg-zinc-100");
    expect(STAGE).toContain("dark:bg-zinc-200");
    expect(CARD_ART).toContain(STAGE);
    // The box doesn't move (what stands on it does), and isn't muted grey
    expect(CARD_ART).not.toMatch(/group-hover:|bg-muted/);
    const html = renderIntl(ItemGrid({ cards: [card({})] }));
    expect(tagWith(html, "data-stage")).toContain("bg-zinc-100");
  });

  it("keep room in a sideways row for a focused card's ring", () => {
    // A row that scrolls sideways clips up and down too: the room above
    // must hold the 3px ring, and be taken back so the row doesn't move.
    expect(CARD_ART).toContain("group-has-[a:focus-visible]:ring-[3px]");
    const room = RAIL.match(/(?:^| )pt-(\d+(?:\.\d+)?)(?: |$)/)?.[1];
    expect(Number(room)).toBeGreaterThanOrEqual(1);
    expect(RAIL.split(" ")).toContain(`-mt-${room}`);
  });
});

describe("community card type labels", () => {
  it("name every type on the stage, a collection with its size", () => {
    const labels = {
      frame: eagerCard({ type: "frame", preview: FRAME_PREVIEW }),
      theme: eagerCard({ type: "theme" }),
      page: eagerCard({ type: "page-template", page: PAGE }),
      kit: eagerCard({ type: "kit", page: PAGE }),
      collection: eagerCard({ type: "collection", itemCount: 6, stack: [] }),
    };
    expect(typeLabel(labels.frame)).toBe("Frame");
    expect(typeLabel(labels.theme)).toBe("Theme");
    expect(typeLabel(labels.page)).toBe("Page");
    expect(typeLabel(labels.kit)).toBe("Kit");
    expect(typeLabel(labels.collection)).toBe("Collection · 6");
    expect(tagWith(labels.frame, "data-type-label")).toContain(
      STAGE_LABEL.split(" ")[0],
    );
  });

  it("leave the caption to the name, saves and creator", () => {
    const html = renderIntl(ItemGrid({ cards: [card({ type: "frame" })] }));
    expect(creatorLine(html)).not.toContain("Frame");
    expect(html).not.toContain("·");
  });

  it("have a like and a bookmark button, with their counts", () => {
    const html = renderIntl(
      ItemGrid({ cards: [card({ likeCount: 12, saveCount: 1234 })] }),
    );
    const like = buttonOf(html, "like");
    expect(like).toContain('aria-pressed="false"');
    expect(like).toContain('<span class="sr-only">Like</span>12');
    const bookmark = buttonOf(html, "bookmark");
    expect(bookmark).toContain('aria-pressed="false"');
    expect(bookmark).toContain('<span class="sr-only">Bookmark</span>1.2K');
    // Pressable over the card's link, which covers the card: the caption
    // sits above it and lets clicks through everywhere but the buttons
    expect(like).toContain("pointer-events-auto");
    const reveal = html.indexOf("group-hover:opacity-100");
    const captionTag = html.slice(
      html.lastIndexOf("<div", reveal),
      html.indexOf(">", reveal),
    );
    expect(captionTag).toContain("pointer-events-none relative z-20");
    // Never "save": they're bookmarks
    expect(html).not.toMatch(/\bsaves?\b/i);

    // No counts until someone likes or bookmarks it
    const fresh = renderIntl(ItemGrid({ cards: [card({})] }));
    expect(buttonOf(fresh, "like")).toMatch(/Like<\/span><\/button>/);
    expect(buttonOf(fresh, "bookmark")).toMatch(/Bookmark<\/span><\/button>/);
  });

  it("leave the buttons off items that aren't stored yet", () => {
    // An official frame the seed hasn't stored, a theme from before the backfill
    for (const unstored of [card({ id: null }), card({ slug: "" })]) {
      const html = renderIntl(ItemGrid({ cards: [unstored] }));
      expect(html).not.toContain("data-reaction");
    }
  });
});

describe("community card pictures", () => {
  it("draw a frame around a real sample code, standing on the stage", () => {
    const html = eagerCard({ type: "frame", preview: FRAME_PREVIEW });
    expect(html).toContain('data-qrdx-frame="custom"');
    expect(html).toContain("Scan for our menu");
    // The code inside it, at rest: no empty holder
    expect(html).toContain('viewBox="0 0 128 128"');
    expect(html).not.toContain("Your QR code");
    expect(html).not.toContain("stroke-dasharray");
    expect(tagWith(html, "data-frame-piece")).toContain(stage.frame);
  });

  it("show a theme as a swatch that fills the stage, with its colors", () => {
    const html = eagerCard({
      type: "theme",
      preview: {
        fgColor: "#1D4ED8",
        eyeColor: "#1d4ed8",
        dotColor: "#0f172a",
        bgColor: "#eff6ff",
      },
    });
    // Its own background, edge to edge, sizing the pulled-back code
    const swatch = tagWith(html, "data-theme-swatch");
    expect(swatch).toContain("absolute inset-0");
    expect(swatch).toContain("[container-type:size]");
    expect(swatch).toContain("background-color:#eff6ff");
    // The whole code, cropped to a close-up by a transform that can pull back
    const crop = tagWith(html, "data-swatch-code");
    expect(crop).toContain(stage.swatchCode);
    expect(crop).toContain("width:150%");
    expect(crop).toMatch(/--swatch-rest:translate\([^)]*\) scale\(1\)/);
    expect(crop).toMatch(
      /--swatch-full:translate\(calc\([^;]*cqh[^;]*scale\(tan\(atan2\(/,
    );
    expect(chips(html)).toEqual(["#1d4ed8", "#0f172a", "#eff6ff"]);
    expect(html).not.toContain("data-qrdx-frame");
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
    expect(html).toContain("data-swatch-code");
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

  it("show a page template's page on a light phone that can scroll", () => {
    const html = eagerCard({ type: "page-template", page: PAGE });
    const phone = tagWith(html, "data-light-phone");
    expect(phone).toContain(stage.phone);
    expect(phone).toContain("aspect-[9/19.5]");
    expect(tagWith(html, "data-page-scroll")).toContain(stage.pageScroll);
  });

  it("draw a kit's look as a swatch, or as its frame with a code", () => {
    const withTheme = eagerCard({
      type: "kit",
      kit: { page: "p", theme: "t", frame: "f" },
      page: PAGE,
      preview: { fgColor: "#0f766e", frame: FRAME_PREVIEW.frame },
    });
    expect(withTheme).toContain("data-swatch-code");
    expect(withTheme).toContain("data-light-phone");
    expect(withTheme).not.toContain("data-qrdx-frame");

    const frameOnly = eagerCard({
      type: "kit",
      kit: { page: "p", frame: "f" },
      page: PAGE,
      preview: FRAME_PREVIEW,
    });
    expect(frameOnly).toContain('data-qrdx-frame="custom"');
    expect(frameOnly).toContain('viewBox="0 0 128 128"');
    expect(frameOnly).not.toContain("data-swatch-code");
  });

  it("draw a collection's items each as its own type, the first in front", () => {
    const html = eagerCard({
      type: "collection",
      itemCount: 6,
      stack: [
        { type: "frame", preview: FRAME_PREVIEW },
        { type: "theme", preview: { fgColor: "#be123c" } },
        { type: "page-template", preview: {}, page: PAGE },
      ],
    });
    const pieces = [
      ...html.matchAll(/<div [^>]*data-stack-piece="([^"]+)"[^>]*>/g),
    ];
    // Left to right: the second item, the first (in the middle), the third
    expect(pieces.map((piece) => piece[1])).toEqual([
      "theme",
      "frame",
      "page-template",
    ]);
    expect(pieces[1]?.[0]).toContain("z-index:2");
    expect(pieces.every((piece) => piece[0].includes(stage.piece))).toBe(true);
    // Only the front one draws on the server; the others in the browser
    expect(html).toContain('data-qrdx-frame="custom"');
    expect(html).toContain("data-light-phone");
  });

  it("show an empty collection as empty", () => {
    const html = eagerCard({ type: "collection", itemCount: 0, stack: [] });
    expect(html).toContain(">Empty<");
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
    expect(html).not.toContain("data-qrdx-frame");
    expect(html).not.toContain("data-swatch-code");
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
    // Its link's focus, or its like and bookmark buttons
    expect(classes).toContain("group-has-[:focus-visible]:opacity-100");
  });

  it("are one line where a pointer can hover, the creator left to screen readers", () => {
    const html = renderIntl(ItemGrid({ cards: [card({})] }));
    const at = html.indexOf("Ana Ruiz");
    expect(at).toBeGreaterThan(-1);
    // The creator's line: the nearest element above it that's a caption line
    const open = html.lastIndexOf('<div class="', at);
    const line = html.slice(open, html.indexOf(">", open));
    expect(line).toContain("[@media(hover:hover)_and_(pointer:fine)]:sr-only");
    // Never hidden from screen readers
    expect(line).not.toMatch(/\b(hidden|invisible)\b|aria-hidden/);
  });

  it("let rows of cards sit as close as their columns where a pointer can hover", () => {
    for (const grid of [CARD_GRID, GALLERY_GRID]) {
      const classes = grid.split(" ");
      expect(classes).toContain("gap-x-6");
      // Touch screens show the whole caption, so their rows keep more room
      expect(classes).toContain("gap-y-10");
      expect(classes).toContain(
        "[@media(hover:hover)_and_(pointer:fine)]:gap-y-6",
      );
    }
  });
});
