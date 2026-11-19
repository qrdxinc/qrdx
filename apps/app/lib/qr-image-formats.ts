import "server-only";

import { encodeBMP, encodeICO, ICO_MIME, ICO_SIZES } from "qrdx";

// The image API's pixel formats beyond PNG, converted on the server from
// the same PNG render with sharp (loaded only when one is asked for). To add
// a format: list it here and in `qrImageFormats` (lib/qr-image-url.ts), give it
// a content type and a case in convertPng; the route and the MCP links pick
// it up from there.

/** Formats made from the PNG render. */
export const CONVERTED_FORMATS = ["webp", "bmp", "ico"] as const;

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
 */
export async function convertPng(
  png: ArrayBuffer | Uint8Array,
  format: ConvertedFormat,
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
    default:
      throw new TypeError(`Unknown image format: ${format satisfies never}`);
  }
}
