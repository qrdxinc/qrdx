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
import { FrameInUse, ThemeInUse } from "@/components/community/item-previews";
import { officialFramePreview } from "@/lib/community/catalog";
import { frameParts } from "@/lib/community/design-parts";
import { FRAME_BASE_STYLE } from "@/lib/community/payloads";
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

  it("draws a frame in use in the browser only", () => {
    const html = renderIntl(<FrameInUse style={FRAME_STYLE} />);
    expect(text(html)).toBe("On a table tent On a poster As a sticker");
    expect(html).not.toContain("<svg");
  });

  it("draws a theme in use in the browser only", () => {
    const html = renderIntl(
      <ThemeInUse
        frames={sampleFrames({ ...THEME, frame: FRAME })}
        look={THEME}
        plain={FRAME_BASE_STYLE}
      />,
    );
    expect(text(html)).toBe(
      "A plain code The same code with this theme On a business card With its own frame In the Scan me tile frame In the Learn more card frame",
    );
    expect(html).not.toContain("<svg");
  });
});
