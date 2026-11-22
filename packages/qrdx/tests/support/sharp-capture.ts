// Sharp renders (no camera blur), as a downloaded PNG or SVG shows on a
// screen: the SVG drawn by resvg, the rasterizer getQRAsPNG uses in Node, in
// a short-lived child (sharp-reads.mjs: resvg keeps its memory until exit).
// Each render, and each camera-model frame (qr.ts), is decoded with jsQR
// and with ZXing (zxing-wasm, the reader the app's scanner is built on).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { DEFAULT_MARGIN } from "../../src/constants";
import { getLayoutMargin } from "../../src/qr-shape";
import { resolveErrorLevel } from "../../src/utils";
import type { QRProps } from "../../types";
import { childReads } from "./child-reads";
import { renderSvg, symbolSize } from "./qr";
import {
  decodeQR,
  type RasterImage,
  rasterizeSvg,
  simulateCamera,
} from "./raster";

const wasm = readFileSync(
  createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm")
);
prepareZXingModule({
  overrides: {
    wasmBinary: wasm.buffer.slice(
      wasm.byteOffset,
      wasm.byteOffset + wasm.byteLength
    ) as ArrayBuffer,
  },
  fireImmediately: true,
});

/** The child that draws sharp renders with resvg and reads them. */
const SHARP_READS = fileURLToPath(
  new URL("./sharp-reads.mjs", import.meta.url)
);

/** ZXing's reading of the QR code in `image`, or null. */
export async function decodeZXing(image: RasterImage): Promise<string | null> {
  const results = await readBarcodes(image, { formats: ["QRCode"] });
  return results.find((result) => result.isValid)?.text ?? null;
}

/** Modules across the drawn code, margin included. */
function modulesAcross(props: QRProps): number {
  const symbol = symbolSize(props.value, resolveErrorLevel(props));
  return (
    symbol +
    2 * getLayoutMargin(symbol, props.margin ?? DEFAULT_MARGIN, props.shape)
  );
}

/** The camera model's frame of `props`: what capture() decodes. */
export function cameraRender(props: QRProps, modulePx: number): RasterImage {
  const image = rasterizeSvg(renderSvg(props), {
    width: modulesAcross(props) * modulePx,
    pad: 4 * modulePx,
  });
  return simulateCamera(image, modulePx);
}

export interface RenderSizes {
  /** Pixels per module of the sharp (resvg) renders */
  sharp: readonly number[];
  /** Pixels per module through the camera model */
  camera: readonly number[];
}

/**
 * Every render of `style` that a decoder misses, as "sharp 9px jsQR v1":
 * each value at each size, sharp and through the camera model, read by
 * jsQR and by ZXing.
 */
export async function missedRenders(
  style: Omit<QRProps, "value">,
  values: readonly string[],
  sizes: RenderSizes
): Promise<string[]> {
  // Sharp renders: drawn by resvg and read in one short-lived child process
  const jobs = values.flatMap((value) => {
    const props = { ...style, value } as QRProps;
    const svg = renderSvg(props);
    const modules = modulesAcross(props);
    return sizes.sharp.map((modulePx) => ({
      svg,
      width: modules * modulePx,
      pad: 4 * modulePx,
      value,
    }));
  });
  const reads = childReads<{ jsqr: boolean; zxing: boolean }[]>(SHARP_READS, {
    jobs,
  });
  const missed: string[] = [];
  for (const [index, value] of values.entries()) {
    for (const [at, modulePx] of sizes.sharp.entries()) {
      const read = reads[index * sizes.sharp.length + at];
      if (!read?.jsqr) missed.push(`sharp ${modulePx}px jsQR v${index}`);
      if (!read?.zxing) missed.push(`sharp ${modulePx}px ZXing v${index}`);
    }
    const props = { ...style, value } as QRProps;
    for (const modulePx of sizes.camera) {
      const image = cameraRender(props, modulePx);
      if (decodeQR(image) !== value) {
        missed.push(`camera ${modulePx}px jsQR v${index}`);
      }
      if ((await decodeZXing(image)) !== value) {
        missed.push(`camera ${modulePx}px ZXing v${index}`);
      }
    }
  }
  return missed;
}
