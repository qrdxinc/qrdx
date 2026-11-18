// BMP from a canvas in any browser. No browser encodes BMP from a canvas
// (toBlob("image/bmp") returns a PNG), so the pixels are read back and written
// by the built-in encoder (utils/bmp.ts). The file is checked by its bytes
// before it is returned, so a PNG is never passed off as BMP.

import { encodeBMP, isBMPFile } from "./utils/bmp";

export { BMP_MAX_DIMENSION, encodeBMP, isBMPFile } from "./utils/bmp";

/**
 * A canvas as a 24-bit BMP. A transparent background is laid over white,
 * since 24-bit BMP has no alpha channel.
 */
export function canvasToBMP(canvas: HTMLCanvasElement): Blob {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context");
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const file = encodeBMP(data, canvas.width, canvas.height);
  if (!isBMPFile(file)) {
    throw new Error("Could not write a BMP file");
  }
  return new Blob([file as BlobPart], { type: "image/bmp" });
}
