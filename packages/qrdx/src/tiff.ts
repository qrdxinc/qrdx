// TIFF from a canvas in any browser. No browser encodes TIFF from a canvas
// (toBlob("image/tiff") returns a PNG), so the pixels are read back and
// written by the built-in encoder (utils/tiff.ts). The file is checked by its
// bytes before it is returned, so a PNG is never passed off as TIFF.

import { encodeTIFF, isTIFFFile, type TIFFOptions } from "./utils/tiff";

export {
  encodeTIFF,
  isTIFFFile,
  TIFF_DPI,
  TIFF_MAX_DIMENSION,
  type TIFFColorMode,
  type TIFFOptions,
} from "./utils/tiff";

export const TIFF_MIME = "image/tiff";

/**
 * A canvas as a TIFF: RGBA with its transparency by default, or CMYK for
 * print (`colorMode: "cmyk"`, transparency laid over white), at 300 dpi
 * unless `dpi` says otherwise.
 */
export async function canvasToTIFF(
  canvas: HTMLCanvasElement,
  options: TIFFOptions = {}
): Promise<Blob> {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context");
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const file = await encodeTIFF(data, canvas.width, canvas.height, options);
  if (!isTIFFFile(file)) {
    throw new Error("Could not write a TIFF file");
  }
  return new Blob([file as BlobPart], { type: TIFF_MIME });
}
