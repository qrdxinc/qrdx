// Draws SVG codes with resvg and reads them with jsQR and ZXing, in a child
// process (tests/halo-decode.test.ts). resvg-js keeps the native memory of
// every render until its process exits (about 1 to 15 MB a code, by
// measurement), so a test that draws thousands of codes runs the renders in
// a short-lived process per batch instead of growing one worker past what a
// CI runner has.
//
// Input (a JSON file named by the first argument, support/child-reads.ts):
// { value, modules, jobs: [{ svg, page, modulePx }] }; stdout: one boolean
// pair [jsQR, ZXing] per job.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

const require = createRequire(import.meta.url);
const { value, modules, jobs } = JSON.parse(
  readFileSync(process.argv[2], "utf8")
);
const wasm = readFileSync(
  require.resolve("zxing-wasm/reader/zxing_reader.wasm")
);
await prepareZXingModule({
  overrides: {
    wasmBinary: wasm.buffer.slice(
      wasm.byteOffset,
      wasm.byteOffset + wasm.byteLength
    ),
  },
  fireImmediately: true,
});

const rgb = (hex) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** The code drawn at `modulePx`, with four modules of page around it. */
function draw(svg, page, modulePx) {
  const pad = 4 * modulePx;
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: modules * modulePx },
    background: page,
  }).render();
  const width = image.width + 2 * pad;
  const height = image.height + 2 * pad;
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = rgb(page);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
  const pixels = image.pixels;
  for (let y = 0; y < image.height; y++) {
    data.set(
      pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      ((y + pad) * width + pad) * 4
    );
  }
  return { data, width, height };
}

const out = [];
for (const { svg, page, modulePx } of jobs) {
  const image = draw(svg, page, modulePx);
  const byJsQR =
    jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    })?.data === value;
  const results = await readBarcodes(image, {
    formats: ["QRCode"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  out.push([byJsQR, results.some((result) => result.text === value)]);
}
process.stdout.write(JSON.stringify(out));
