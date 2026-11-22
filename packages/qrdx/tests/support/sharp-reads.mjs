// Draws codes with resvg and reads them with jsQR and ZXing, in a child
// process (tests/support/sharp-capture.ts). resvg-js keeps the native memory
// of every render until its process exits, so each batch of sharp renders
// runs in a short-lived process instead of growing one test worker.
//
// Input (a JSON file named by the first argument, support/child-reads.ts):
// { jobs: [{ svg, width, pad, value }] }: the artwork's width and the white
// border around it in pixels; stdout: [{ jsqr, zxing }] per job, true when
// that decoder read `value`.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

const wasm = readFileSync(
  createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm")
);
prepareZXingModule({
  overrides: {
    wasmBinary: wasm.buffer.slice(
      wasm.byteOffset,
      wasm.byteOffset + wasm.byteLength
    ),
  },
  fireImmediately: true,
});

const { jobs } = JSON.parse(readFileSync(process.argv[2], "utf8"));

const out = [];
for (const { svg, width, pad, value } of jobs) {
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#ffffff",
  }).render();
  const w = rendered.width + 2 * pad;
  const h = rendered.height + 2 * pad;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < rendered.height; y++) {
    data.set(
      rendered.pixels.subarray(
        y * rendered.width * 4,
        (y + 1) * rendered.width * 4
      ),
      ((y + pad) * w + pad) * 4
    );
  }
  const jsqr =
    jsQR(data, w, h, { inversionAttempts: "attemptBoth" })?.data === value;
  const results = await readBarcodes(
    { data, width: w, height: h },
    { formats: ["QRCode"] }
  );
  const zxing = results.some(
    (result) => result.isValid && result.text === value
  );
  out.push({ jsqr, zxing });
}
process.stdout.write(JSON.stringify(out));
