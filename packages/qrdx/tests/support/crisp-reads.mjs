// Draws framed codes with resvg and reads them with jsQR, in a child process
// (tests/support/crisp-widths.ts). resvg-js keeps the native memory of every
// render until its process exits, so the width sweep draws each frame's
// codes in a short-lived process instead of growing one test worker by
// gigabytes on a CI runner.
//
// stdin: { value, fontDir, jobs: [{ svg, width, margin }] }: the artwork's
// width and the white margin around it in pixels; stdout: one boolean per
// job (jsQR read `value`).
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";

const { value, fontDir, jobs } = JSON.parse(readFileSync(0, "utf8"));

/** One font for every label, and no system fonts (see crisp-widths.ts). */
const font = {
  fontDirs: [fontDir],
  loadSystemFonts: false,
  defaultFontFamily: "Geist",
  sansSerifFamily: "Geist",
};

const out = [];
for (const { svg, width, margin } of jobs) {
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#ffffff",
    font,
  }).render();
  // A white margin around the artwork, as a page or a screen gives it
  const w = image.width + 2 * margin;
  const h = image.height + 2 * margin;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  // Read once: each read of `pixels` copies the whole image
  const pixels = image.pixels;
  const row = image.width * 4;
  for (let y = 0; y < image.height; y++) {
    data.set(
      pixels.subarray(y * row, (y + 1) * row),
      ((y + margin) * w + margin) * 4
    );
  }
  out.push(
    jsQR(data, w, h, { inversionAttempts: "attemptBoth" })?.data === value
  );
}
process.stdout.write(JSON.stringify(out));
