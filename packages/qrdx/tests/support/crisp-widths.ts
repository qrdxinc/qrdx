// The crisp-render width sweep for official frames
// (tests/official-frames/crisp-widths-*.test.ts). Dark lettering on a light
// ground near the code once made jsQR miss some frames at some code widths:
// it took the letters for finder patterns. Their labels now sit on dark
// pills; these tests render each such frame with resvg at every code width
// from 160 to 450 px in 10 px steps and decode every render.
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { getFrameDimensions } from "../../src/frame";
import { OFFICIAL_FRAMES } from "../../src/frames/official";
import type { AnyQRFrame, QRProps } from "../../types";
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
const FONT = {
  fontDirs: [
    fileURLToPath(new URL("../../../design-system/og/fonts", import.meta.url)),
  ],
  loadSystemFonts: false,
  defaultFontFamily: "Geist",
  sansSerifFamily: "Geist",
};

/** Renders the framed code `width` px wide with resvg and decodes it with jsQR. */
export function decodesCrisp(
  frame: AnyQRFrame,
  width: number,
  level: QRProps["level"]
): boolean {
  const value = SAMPLE_PAYLOADS.link;
  const svg = renderSvg({ value, size: width, level, frame });
  const artwork = getFrameDimensions(width, frame);
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(artwork.width) },
    background: "#ffffff",
    font: FONT,
  }).render();
  // A white margin around the artwork, as a page or a screen gives it
  const pad = Math.round(width * 0.12);
  const w = image.width + 2 * pad;
  const h = image.height + 2 * pad;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  // Read once: each read of `pixels` copies the whole image
  const pixels = image.pixels;
  const row = image.width * 4;
  for (let y = 0; y < image.height; y++) {
    data.set(
      pixels.subarray(y * row, (y + 1) * row),
      ((y + pad) * w + pad) * 4
    );
  }
  const result = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
  return result?.data === value;
}

/** Every frame in CRISP_FRAMES decodes at every width at error level `level`. */
export function describeCrispWidths(level: QRProps["level"]) {
  describe(`frames that once missed decode crisp at every width (level ${level})`, () => {
    it.each(CRISP_FRAMES)("%s", { timeout: 120_000 }, (id) => {
      const official = OFFICIAL_FRAMES.find((frame) => frame.id === id);
      if (!official) throw new Error(`No official frame ${id}`);
      const frame: AnyQRFrame = { style: "custom", spec: official.spec };
      expect(
        CRISP_WIDTHS.filter((width) => !decodesCrisp(frame, width, level))
      ).toEqual([]);
    });
  });
}
