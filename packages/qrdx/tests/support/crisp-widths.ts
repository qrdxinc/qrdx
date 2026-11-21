// The crisp-render width sweep for official frames
// (tests/official-frames/crisp-widths-*.test.ts). Dark lettering on a light
// ground near the code once made jsQR miss some frames at some code widths:
// it took the letters for finder patterns. Their labels now sit on dark
// pills; these tests render each such frame with resvg at every code width
// from 160 to 450 px in 10 px steps and decode every render.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getFrameDimensions } from "../../src/frame";
import { OFFICIAL_FRAMES } from "../../src/frames/official";
import type { AnyQRFrame, QRProps } from "../../types";
import { childReads } from "./child-reads";
import { SAMPLE_PAYLOADS } from "./frames";
import { renderSvg } from "./qr";

/**
 * The frames that missed at some width in a sweep (10 px steps, or 2 px
 * steps at level Q), under any of the fonts checked (macOS system fonts,
 * Liberation Sans, DejaVu Sans, Geist) or error levels (M, Q).
 */
export const CRISP_FRAMES = [
  "billboard-light",
  "border-thick",
  "bottle-label",
  "cassette-tape",
  "cat-with-card-light",
  "cinema-marquee",
  "clapperboard-light",
  "comic-panel",
  "corner-tab-light",
  "delivery-box-light",
  "fish-tank",
  "flag-light",
  "gallery-frame",
  "jigsaw-piece-light",
  "laptop-screen",
  "magnifying-glass",
  "mailbox-light",
  "matchbox-drawer",
  "milk-carton",
  "museum-plaque",
  "octagon-light",
  "open-book",
  "passport-stamp",
  "pizza-box",
  "popcorn-bucket",
  "raised-card-thin",
  "ribbon-top-light",
  "roll-up-banner-light",
  "scroll-story",
  "soda-can",
  "spiral-notebook",
  "tablet-screen",
  "treasure-map",
];

export const CRISP_WIDTHS = Array.from({ length: 30 }, (_, i) => 160 + i * 10);

/**
 * One font for every label, from the repository (the design system's Geist),
 * and no system fonts: the frames' font stack resolves to different fonts on
 * macOS and Linux, and the lettering's shapes decide what the decoder sees.
 */
const FONT_DIR = fileURLToPath(
  new URL("../../../design-system/og/fonts", import.meta.url)
);

const READER = fileURLToPath(new URL("./crisp-reads.mjs", import.meta.url));

/**
 * The widths in CRISP_WIDTHS at which the framed code doesn't decode. The
 * codes are drawn by resvg and read by jsQR in a child process
 * (crisp-reads.mjs: resvg-js keeps every render's memory until its process
 * exits).
 */
export function crispMisses(
  frame: AnyQRFrame,
  level: QRProps["level"]
): number[] {
  const value = SAMPLE_PAYLOADS.link;
  const jobs = CRISP_WIDTHS.map((width) => ({
    svg: renderSvg({ value, size: width, level, frame }),
    width: Math.round(getFrameDimensions(width, frame).width),
    margin: Math.round(width * 0.12),
  }));
  const reads = childReads<boolean[]>(READER, {
    value,
    fontDir: FONT_DIR,
    jobs,
  });
  return CRISP_WIDTHS.filter((_, i) => !reads[i]);
}

/** Every frame in CRISP_FRAMES decodes at every width at error level `level`. */
export function describeCrispWidths(level: QRProps["level"]) {
  describe(`frames that once missed decode crisp at every width (level ${level})`, () => {
    it.each(CRISP_FRAMES)("%s", { timeout: 120_000 }, (id) => {
      const official = OFFICIAL_FRAMES.find((frame) => frame.id === id);
      if (!official) throw new Error(`No official frame ${id}`);
      const frame: AnyQRFrame = { style: "custom", spec: official.spec };
      expect(crispMisses(frame, level)).toEqual([]);
    });
  });
}
