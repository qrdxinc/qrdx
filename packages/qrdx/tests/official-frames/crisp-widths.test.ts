// The official frames whose labels once made jsQR miss the code in a crisp
// render at some code widths: dark lettering on a light ground near the code
// looked like finder patterns to it. Their labels now sit on dark pills (or
// went); this renders each with resvg, in the default look with a link, at
// every code width from 160 to 450 px in 10 px steps, and decodes every one.
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { getFrameDimensions } from "../../src/frame";
import { OFFICIAL_FRAMES } from "../../src/frames/official";
import type { AnyQRFrame } from "../../types";
import { SAMPLE_PAYLOADS } from "../support/frames";
import { renderSvg } from "../support/qr";

const FRAMES = [
  "border-thick",
  "bottle-label",
  "cinema-marquee",
  "clapperboard-light",
  "comic-panel",
  "delivery-box-light",
  "fish-tank",
  "flag-light",
  "jigsaw-piece-light",
  "laptop-screen",
  "mailbox-light",
  "matchbox-drawer",
  "milk-carton",
  "museum-plaque",
  "octagon-light",
  "passport-stamp",
  "pizza-box",
  "raised-card-thin",
  "ribbon-top-light",
  "roll-up-banner-light",
  "scroll-story",
  "soda-can",
  "spiral-notebook",
  "tablet-screen",
];

const WIDTHS = Array.from({ length: 30 }, (_, i) => 160 + i * 10);

/** Renders the framed code `width` px wide with resvg and decodes it with jsQR. */
function decodesAt(frame: AnyQRFrame, width: number): boolean {
  const value = SAMPLE_PAYLOADS.link;
  const svg = renderSvg({ value, size: width, level: "M", frame });
  const artwork = getFrameDimensions(width, frame);
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(artwork.width) },
    background: "#ffffff",
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

describe("frames that once missed at some widths decode crisp at every width", () => {
  it.each(FRAMES)("%s", { timeout: 120_000 }, (id) => {
    const official = OFFICIAL_FRAMES.find((frame) => frame.id === id);
    if (!official) throw new Error(`No official frame ${id}`);
    const frame: AnyQRFrame = { style: "custom", spec: official.spec };
    expect(WIDTHS.filter((width) => !decodesAt(frame, width))).toEqual([]);
  });
});
