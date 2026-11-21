// Sharp renders (no camera blur), as a downloaded PNG or SVG shows on a
// screen: the SVG drawn by resvg, the rasterizer getQRAsPNG uses in Node.
// Each render, and each camera-model frame (qr.ts), is decoded with jsQR
// and with ZXing (zxing-wasm, the reader the app's scanner is built on).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { DEFAULT_MARGIN } from "../../src/constants";
import { getLayoutMargin } from "../../src/qr-shape";
import { resolveErrorLevel } from "../../src/utils";
import type { QRProps } from "../../types";
import { renderSvg, symbolSize } from "./qr";
import {
  createImage,
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

/**
 * `props` drawn by resvg at `modulePx` per module, on a white page with a
 * 4-module border (the layout capture() uses).
 */
export function sharpRender(props: QRProps, modulePx: number): RasterImage {
  const width = modulesAcross(props) * modulePx;
  const rendered = new Resvg(renderSvg(props), {
    fitTo: { mode: "width", value: width },
    background: "#ffffff",
  }).render();
  const pad = 4 * modulePx;
  const page = createImage(rendered.width + 2 * pad, rendered.height + 2 * pad);
  for (let y = 0; y < rendered.height; y++) {
    page.data.set(
      rendered.pixels.subarray(
        y * rendered.width * 4,
        (y + 1) * rendered.width * 4
      ),
      ((y + pad) * page.width + pad) * 4
    );
  }
  return page;
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
  const missed: string[] = [];
  for (const [index, value] of values.entries()) {
    const props = { ...style, value } as QRProps;
    for (const kind of ["sharp", "camera"] as const) {
      for (const modulePx of sizes[kind]) {
        const image =
          kind === "sharp"
            ? sharpRender(props, modulePx)
            : cameraRender(props, modulePx);
        if (decodeQR(image) !== value) {
          missed.push(`${kind} ${modulePx}px jsQR v${index}`);
        }
        if ((await decodeZXing(image)) !== value) {
          missed.push(`${kind} ${modulePx}px ZXing v${index}`);
        }
      }
    }
  }
  return missed;
}
