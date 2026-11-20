import "server-only";

import {
  assertGIFStillScans,
  encodeBMP,
  encodeICO,
  GIF_MIME,
  ICO_MIME,
  ICO_SIZES,
} from "qrdx";

// The image API's pixel formats beyond PNG, converted on the server from
// the same PNG render with sharp (loaded only when one is asked for). To add
// a format: list it here and in `qrImageFormats` (lib/qr-image-url.ts), give it
// a content type and a case in convertPng; the route and the MCP links pick
// it up from there.

/** Formats made from the PNG render. */
export const CONVERTED_FORMATS = ["webp", "bmp", "ico", "gif"] as const;

/**
 * The size an ICO's render is drawn at before it is scaled down to each of the
 * icon's sizes (16, 32, 48 and 256 px): the request's own `size` doesn't apply.
 */
export const ICO_MASTER_SIZE = 1024;
export type ConvertedFormat = (typeof CONVERTED_FORMATS)[number];

export const IMAGE_CONTENT_TYPES: Record<ConvertedFormat, string> = {
  webp: "image/webp",
  bmp: "image/bmp",
  ico: ICO_MIME,
  gif: GIF_MIME,
};

export const isConvertedFormat = (format: string): format is ConvertedFormat =>
  (CONVERTED_FORMATS as readonly string[]).includes(format);

/**
 * PNG bytes in another format. WebP is lossless: the same pixels,
 * transparency included, in a smaller file. BMP is an uncompressed 24-bit
 * bitmap written by the engine's encoder (sharp can't write BMP), with a
 * transparent background laid over white. ICO is a favicon: the PNG scaled
 * to 16, 32, 48 and 256 px (kept whole and centered if it isn't square),
 * each stored as a PNG inside the engine's ICO writer, transparency kept.
 * GIF is written by sharp with at most 256 colors, no dithering (its noise
 * stops a code scanning) and one transparent color. A design that needs more
 * colors is checked against the PNG when `expected` (the value the code
 * encodes) is given, and a GIFScanError is thrown if the original scanned and
 * the GIF would not.
 */
export async function convertPng(
  png: ArrayBuffer | Uint8Array,
  format: ConvertedFormat,
  expected?: string,
): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const image = sharp(new Uint8Array(png));
  switch (format) {
    case "webp":
      return new Uint8Array(
        await image.webp({ lossless: true, effort: 4 }).toBuffer(),
      );
    case "bmp": {
      const { data, info } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return encodeBMP(data, info.width, info.height);
    }
    case "ico": {
      const images = await Promise.all(
        ICO_SIZES.map(async (size) => {
          const resized = await image
            .clone()
            .resize(size, size, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
              kernel: "lanczos3",
            })
            .png()
            .toBuffer();
          return { width: size, height: size, png: new Uint8Array(resized) };
        }),
      );
      return encodeICO(images);
    }
    case "gif": {
      const file = new Uint8Array(
        await image
          .clone()
          .gif({ colors: 256, dither: 0, effort: 7 })
          .toBuffer(),
      );
      // The "GIF8" every GIF starts with: nothing else leaves as image/gif
      if (String.fromCharCode(...file.subarray(0, 4)) !== "GIF8") {
        throw new Error("Could not write a GIF file");
      }
      if (expected !== undefined) {
        const pixels = async (source: typeof image) => {
          const { data, info } = await source
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          return { data, width: info.width, height: info.height };
        };
        await assertGIFStillScans(
          await pixels(image.clone()),
          await pixels(sharp(file)),
          expected,
        );
      }
      return file;
    }
    default:
      throw new TypeError(`Unknown image format: ${format satisfies never}`);
  }
}
