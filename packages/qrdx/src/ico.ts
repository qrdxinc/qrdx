// ICO from canvases in any browser. No browser encodes ICO from a canvas
// (toBlob("image/x-icon") returns a PNG), so each canvas is written as a PNG,
// which every browser can do, and the built-in encoder (utils/ico.ts) wraps
// the PNGs in an ICO. The file is checked by its bytes before it is returned,
// so a PNG is never passed off as ICO.

import { encodeICO, ICO_MIME, isICOFile } from "./utils/ico";

export {
  encodeICO,
  ICO_MAX_DIMENSION,
  ICO_MIME,
  ICO_SIZES,
  type IcoImage,
  isICOFile,
} from "./utils/ico";

const PNG_DATA_URL = "data:image/png;base64,";

/** A canvas as PNG file bytes. Throws where the browser can't write PNG. */
export function canvasToPNGBytes(canvas: HTMLCanvasElement): Uint8Array {
  const url = canvas.toDataURL("image/png");
  if (!url.startsWith(PNG_DATA_URL)) {
    throw new Error("This browser can't write a PNG from a canvas");
  }
  const binary = atob(url.slice(PNG_DATA_URL.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Canvases (each 1 to 256 px a side) as one ICO, an image for each, in the
 * order given. A transparent background stays transparent.
 */
export function canvasesToICO(canvases: readonly HTMLCanvasElement[]): Blob {
  const file = encodeICO(
    canvases.map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      png: canvasToPNGBytes(canvas),
    }))
  );
  if (!isICOFile(file)) {
    throw new Error("Could not write an ICO file");
  }
  return new Blob([file as BlobPart], { type: ICO_MIME });
}

/** One canvas (1 to 256 px a side) as an ICO with a single image. */
export function canvasToICO(canvas: HTMLCanvasElement): Blob {
  return canvasesToICO([canvas]);
}
