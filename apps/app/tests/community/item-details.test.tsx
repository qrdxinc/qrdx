// A frame's or theme's page: the sentence under its title says what the
// type is and what you get, "What's in it" lists its parts from the data,
// and "How it looks" shows it in use, drawn in the browser (none of its
// designs are in the page's HTML).

import { getOfficialFrame } from "qrdx";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  designSentence,
  FrameContents,
  sampleFrames,
  ThemeContents,
  withoutFrame,
} from "@/components/community/item-details";
import {
  aspectOf,
  FrameInUse,
  ThemeInUse,
  toneOf,
} from "@/components/community/item-previews";
import { officialFramePreview } from "@/lib/community/catalog";
import { frameParts } from "@/lib/community/design-parts";
import type { ThemeStyles } from "@/types/theme";
import { renderIntl } from "../support/intl";

const TABLE_TENT = getOfficialFrame("table-tent");
if (!TABLE_TENT) throw new Error("table-tent is missing");
const FRAME_STYLE = officialFramePreview(TABLE_TENT);
const FRAME = FRAME_STYLE.frame;
if (!FRAME) throw new Error("no frame");

const THEME: ThemeStyles = {
  fgColor: "#0B3D91",
  eyeColor: "#0b3d91",
  dotColor: "#0b3d91",
  bgColor: "#FFFFFF",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
};

/** The SVGs in server HTML other than 24-unit icons: designs, if any. */
const designSvgs = (html: string) =>
  (html.match(/<svg[^>]*>/g) ?? []).filter(
    (tag) => !tag.includes('viewBox="0 0 24 24"'),
  );

/** Text without tags, spaces collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

describe("the sentence under the title", () => {
  it("says what a frame is and what can change, from its parts", () => {
    expect(designSentence({ type: "frame", preview: FRAME_STYLE })).toBe(
      "A frame goes around your QR code: the border, icon and label. Your code goes in the middle and keeps its own look, and you can change the label, colors and icon.",
    );
  });

  it("says what a theme is, and when it comes with a frame", () => {
    const base =
      "A theme is the look of the code itself: dot pattern, eye shape and colors. Use it with any content, with or without a frame.";
    expect(designSentence({ type: "theme", preview: THEME })).toBe(base);
    expect(
      designSentence({ type: "theme", preview: { ...THEME, frame: FRAME } }),
    ).toBe(
      `${base} This one comes with a frame, which you can change or take off in the editor.`,
    );
  });

  it("is left out for the other types", () => {
    for (const type of ["page-template", "collection", "kit"] as const) {
      expect(designSentence({ type, preview: THEME })).toBeNull();
    }
  });
});

describe("What's in it", () => {
  it("names a theme's parts as the editor does, with its colors' hex", () => {
    const html = renderToStaticMarkup(<ThemeContents style={THEME} />);
    expect(text(html)).toContain(
      "Dot pattern Rounded Eye shape Rounded Eye dot Rounded Colors #0b3d91 Dots, eyes, eye dots #ffffff Background",
    );
    expect(html).not.toContain("Frame");
    expect(html).not.toContain("Code shape");
  });

  it("says when a theme comes with a frame or has a shape", () => {
    const html = renderToStaticMarkup(
      <ThemeContents style={{ ...THEME, frame: FRAME, shape: "circle" }} />,
    );
    expect(text(html)).toContain("Code shape Circle");
    expect(text(html)).toContain(
      "Frame Included, labelled “Scan for our menu”",
    );
  });

  it("lists a frame's label, colors and what you can change", () => {
    const parts = frameParts(FRAME);
    if (!parts) throw new Error("no parts");
    const html = renderToStaticMarkup(<FrameContents parts={parts} />);
    expect(text(html)).toBe(
      "What's in it Label “Scan for our menu” Colors #111111 Frame #ffffff Text You can change Label, second line, colors, icon and text size",
    );
  });
});

describe("How it looks", () => {
  it("shows a theme in its own frame first, then official ones, three in all", () => {
    const framed = sampleFrames({ ...THEME, frame: FRAME });
    expect(framed.map((entry) => entry.name)).toEqual([
      null,
      "Scan me tile",
      "Learn more card",
    ]);
    expect(framed[0]?.frame).toBe(FRAME);
    expect(sampleFrames(THEME).map((entry) => entry.name)).toEqual([
      "Scan me tile",
      "Learn more card",
      "Scan me card",
    ]);
    expect(withoutFrame({ ...THEME, frame: FRAME })).toEqual(THEME);
  });

  it("draws a frame in use in the browser only, its tiles named for screen readers", () => {
    const html = renderIntl(<FrameInUse style={FRAME_STYLE} />);
    // The names are the tiles' only text, and only screen readers get them
    expect(text(html)).toBe(
      "As a sticker On a phone, on its hosted page On a business card On a table tent qrdx.dev/community On a poster On a badge As ASCII art",
    );
    expect(html.match(/<figcaption class="sr-only">/g)).toHaveLength(7);
    expect(designSvgs(html)).toEqual([]);
  });

  it("draws a theme in use in the browser only: no plain code, a tile for its frames", () => {
    const html = renderIntl(
      <ThemeInUse
        frames={sampleFrames({ ...THEME, frame: FRAME })}
        look={THEME}
      />,
    );
    expect(text(html)).toBe(
      "As a sticker On a phone, on its hosted page On a business card On a table tent qrdx.dev/community On a poster In frames On a badge As ASCII art",
    );
    expect(html.match(/<figcaption class="sr-only">/g)).toHaveLength(8);
    expect(designSvgs(html)).toEqual([]);
  });

  it("sizes each tile to the design's own shape", () => {
    // A code is square; the table tent frame is taller than it's wide
    expect(aspectOf(THEME)).toBe(1);
    const tent = aspectOf(FRAME_STYLE);
    expect(tent).toBeGreaterThan(0.4);
    expect(tent).toBeLessThan(1);
    // Every tile that shows the framed design carries its shape
    const html = renderIntl(<FrameInUse style={FRAME_STYLE} />);
    const shapes = html.match(/--fa:([\d.]+)/g) ?? [];
    expect(shapes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(shapes)).toEqual(new Set([`--fa:${tent.toFixed(4)}`]));
  });

  it("lights the tiles with the design's most colorful color", () => {
    // The blue dots, not the white background
    expect(toneOf(THEME).toLowerCase()).toBe("#0b3d91");
    // A theme on a colored background: the background
    expect(
      toneOf({
        ...THEME,
        bgColor: "#D0FA4E",
        dotColor: "#0B0B0B",
        fgColor: "#0B0B0B",
        eyeColor: "#0B0B0B",
      }),
    ).toBe("#D0FA4E");
    // Black on white: a quiet silver
    expect(
      toneOf({
        ...THEME,
        bgColor: "#ffffff",
        dotColor: "#000000",
        fgColor: "#000000",
        eyeColor: "#000000",
      }),
    ).toBe("#b8b8c0");
  });
});
