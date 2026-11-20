// GIF from pixels or a canvas in any browser, and in Node. No browser encodes
// GIF from a canvas (toBlob("image/gif") returns a PNG), so the pixels are read
// back and written by the built-in encoder (utils/gif.ts). The file is checked
// by its bytes before it is returned, so a PNG is never passed off as a GIF.
//
// A GIF holds 256 colors. A code in flat colors fits as it is and comes out
// pixel for pixel; a gradient, a photo logo or an image fill is reduced to a
// palette first, and when the value is known the reduced image is scanned
// against the original, so a GIF that no longer reads is refused, not saved.

import type { QRArtPixels } from "./art";
import { encodeGIFFromRGBA, indexedToRGBA, isGIFFile } from "./utils/gif";

export {
  encodeGIF,
  encodeGIFFromRGBA,
  GIF_ALPHA_THRESHOLD,
  GIF_MAX_COLORS,
  GIF_MAX_DIMENSION,
  type IndexedImage,
  indexedToRGBA,
  isGIFFile,
  type QuantizedImage,
  quantizeRGBA,
} from "./utils/gif";

/** The MIME type of a GIF. */
export const GIF_MIME = "image/gif";

/** Thrown when reducing a design to GIF's 256 colors would stop it scanning. */
export class GIFScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GIFScanError";
  }
}

export interface GIFResult {
  file: Uint8Array;
  /** Colors in the palette, the transparent one included */
  colors: number;
  /** True when every pixel kept its color and opacity exactly */
  lossless: boolean;
}

const OPAQUE = 255;

/** RGBA pixels laid over white, as a scanner reads a see-through code on paper. */
function overWhite(rgba: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let at = 0; at < rgba.length; at += 4) {
    const alpha = rgba[at + 3] as number;
    for (let channel = 0; channel < 3; channel++) {
      out[at + channel] = Math.round(
        ((rgba[at + channel] as number) * alpha + OPAQUE * (OPAQUE - alpha)) /
          OPAQUE
      );
    }
    out[at + 3] = OPAQUE;
  }
  return out;
}

/** Whether `pixels` hold a QR code that decodes to `expected` as they are. */
function decodesTo(
  decode: typeof import("jsqr").default,
  pixels: QRArtPixels,
  expected: string
): boolean {
  const rgba = Uint8ClampedArray.from(pixels.data);
  const found = decode(rgba, pixels.width, pixels.height, {
    inversionAttempts: "dontInvert",
  });
  if (!found) {
    return false;
  }
  if (found.data === expected) {
    return true;
  }
  try {
    return (
      new TextDecoder().decode(Uint8Array.from(found.binaryData)) === expected
    );
  } catch {
    return false;
  }
}

/**
 * Throws a GIFScanError when `reduced` (the GIF's pixels read back) no longer
 * decodes to `expected` although `original` did. Both are laid over white
 * first, as a scanner reads a see-through code on paper. A design that doesn't
 * decode to begin with (the decoder is stricter than a phone for some styles)
 * isn't blamed on GIF, and pixels that came through unchanged aren't decoded
 * at all. Decoding takes `jsqr`, loaded here when it is needed; if it can't be
 * loaded the GIF can't be checked, so it is refused rather than passed on. The
 * server uses this too, with the pixels of the GIF sharp wrote.
 */
export async function assertGIFStillScans(
  original: QRArtPixels,
  reduced: QRArtPixels,
  expected: string
): Promise<void> {
  const { width, height } = original;
  const before = overWhite(original.data);
  const after = overWhite(reduced.data);
  if (
    reduced.width === width &&
    reduced.height === height &&
    before.every((value, index) => value === after[index])
  ) {
    return;
  }
  let decode: typeof import("jsqr").default;
  try {
    decode = (await import("jsqr")).default;
  } catch {
    throw new GIFScanError(
      "This design uses more colors than a GIF holds (256), and the reduced image could not be checked because jsqr is not available. Download a PNG instead."
    );
  }
  if (!decodesTo(decode, { data: before, width, height }, expected)) {
    return;
  }
  const readable = decodesTo(
    decode,
    { data: after, width: reduced.width, height: reduced.height },
    expected
  );
  if (!readable) {
    throw new GIFScanError(
      "This design uses more colors than a GIF holds (256), and the reduced image would not scan. Download a PNG instead."
    );
  }
}

/**
 * RGBA pixels (`width * height * 4` bytes, top row first) as a GIF. A pixel
 * with alpha under 128 is the GIF's transparent color. When `expected` (the
 * value the code encodes) is given and the colors had to be reduced, the
 * result is scanned against the original and a GIFScanError is thrown if it
 * no longer reads. Throws a RangeError for a bad size.
 */
export async function pixelsToGIF(
  pixels: QRArtPixels,
  expected?: string
): Promise<GIFResult> {
  const { file, image } = encodeGIFFromRGBA(
    pixels.data,
    pixels.width,
    pixels.height
  );
  if (!isGIFFile(file)) {
    throw new Error("Could not write a GIF file");
  }
  if (expected !== undefined && !image.lossless) {
    await assertGIFStillScans(
      pixels,
      {
        data: indexedToRGBA(image),
        width: pixels.width,
        height: pixels.height,
      },
      expected
    );
  }
  return { file, colors: image.colors, lossless: image.lossless };
}

/**
 * A canvas as a GIF, with a transparent background kept (see `pixelsToGIF`).
 * Pass the code's value as `expected` to refuse a GIF that would not scan.
 */
export async function canvasToGIF(
  canvas: HTMLCanvasElement,
  expected?: string
): Promise<Blob> {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context");
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const { file } = await pixelsToGIF(
    { data, width: canvas.width, height: canvas.height },
    expected
  );
  return new Blob([file as BlobPart], { type: GIF_MIME });
}
