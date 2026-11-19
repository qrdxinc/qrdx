/** biome-ignore-all lint/style/noMagicNumbers: ICO and PNG format constants */
// An ICO writer in plain TypeScript with no DOM. Canvases can't encode ICO
// (toBlob("image/x-icon") returns a PNG), so every browser, the CLI and the
// server use this one.
//
// An ICO file is a 6-byte header, one 16-byte directory entry per image, then
// the images. Each image here is a whole PNG file: Windows Vista and later,
// and every browser, read PNG-in-ICO, and it keeps the alpha channel and
// needs no pixel conversion. The sizes are 1 to 256 px: the directory stores a
// size as one byte, with 0 meaning 256.

/** The sizes a favicon holds: 16 and 32 px for tabs, 48 for Windows, 256 for large icons. */
export const ICO_SIZES: readonly number[] = [16, 32, 48, 256];

/** The MIME type of an ICO (the one IANA registers; some servers send image/x-icon). */
export const ICO_MIME = "image/vnd.microsoft.icon";

/** Largest width or height an ICO image can have. */
export const ICO_MAX_DIMENSION = 256;

/** Most images one file can list (a 16-bit count; this keeps it sane). */
export const ICO_MAX_IMAGES = 64;

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Where a PNG's IHDR width and height sit: after the signature, length and type. */
const PNG_WIDTH_AT = 16;
const PNG_HEIGHT_AT = 20;
/** 32 bits a pixel: PNG-in-ICO entries say so, and keep their alpha. */
const BITS_PER_PIXEL = 32;

/** One image of an ICO: a PNG file and its size. */
export interface IcoImage {
  width: number;
  height: number;
  png: Uint8Array;
}

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= PNG_HEIGHT_AT + 4 &&
  PNG_SIGNATURE.every((value, index) => bytes[index] === value);

const pngSize = (bytes: Uint8Array): { width: number; height: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(PNG_WIDTH_AT),
    height: view.getUint32(PNG_HEIGHT_AT),
  };
};

/**
 * PNG images (each a whole PNG file, 1 to 256 px a side, the size they say
 * they are) as one ICO file, in the order given. Throws a RangeError for no
 * images, too many, a size outside 1 to 256, or a file that isn't a PNG of the
 * size stated: a mislabelled image would make a file readers reject.
 */
export function encodeICO(images: readonly IcoImage[]): Uint8Array {
  if (images.length < 1 || images.length > ICO_MAX_IMAGES) {
    throw new RangeError(
      `An ICO holds 1 to ${ICO_MAX_IMAGES} images, got ${images.length}`
    );
  }
  for (const { width, height, png } of images) {
    const sizeOk = (value: number) =>
      Number.isInteger(value) && value >= 1 && value <= ICO_MAX_DIMENSION;
    if (!(sizeOk(width) && sizeOk(height))) {
      throw new RangeError(
        `ICO images must be whole numbers from 1 to ${ICO_MAX_DIMENSION} px, got ${width} x ${height}`
      );
    }
    if (!isPng(png)) {
      throw new RangeError("Every ICO image must be a PNG file");
    }
    const actual = pngSize(png);
    if (actual.width !== width || actual.height !== height) {
      throw new RangeError(
        `An ICO image says ${width} x ${height} but its PNG is ${actual.width} x ${actual.height}`
      );
    }
  }

  const directorySize = HEADER_SIZE + ENTRY_SIZE * images.length;
  const total = images.reduce((sum, image) => sum + image.png.length, 0);
  const file = new Uint8Array(directorySize + total);
  const view = new DataView(file.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 is an icon, 2 a cursor
  view.setUint16(4, images.length, true);

  let offset = directorySize;
  images.forEach(({ width, height, png }, index) => {
    const at = HEADER_SIZE + ENTRY_SIZE * index;
    // A byte a side, where 0 means 256
    file[at] = width === ICO_MAX_DIMENSION ? 0 : width;
    file[at + 1] = height === ICO_MAX_DIMENSION ? 0 : height;
    file[at + 2] = 0; // colours in the palette: none
    file[at + 3] = 0; // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, BITS_PER_PIXEL, true);
    view.setUint32(at + 8, png.length, true); // size of the image data
    view.setUint32(at + 12, offset, true); // where the image data starts
    file.set(png, offset);
    offset += png.length;
  });
  return file;
}

/**
 * True when `bytes` is an ICO this writer would make: the icon header, a
 * directory whose entries fit the file, and a PNG of the stated size at each
 * offset. Used to check a file before it is saved, so nothing else is handed
 * out as an ICO.
 */
export function isICOFile(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE + ENTRY_SIZE) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  if (
    view.getUint16(0, true) !== 0 ||
    view.getUint16(2, true) !== 1 ||
    count < 1 ||
    count > ICO_MAX_IMAGES ||
    bytes.length < HEADER_SIZE + ENTRY_SIZE * count
  ) {
    return false;
  }
  for (let index = 0; index < count; index++) {
    const at = HEADER_SIZE + ENTRY_SIZE * index;
    const width = bytes[at] || ICO_MAX_DIMENSION;
    const height = bytes[at + 1] || ICO_MAX_DIMENSION;
    const length = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (offset + length > bytes.length) {
      return false;
    }
    const png = bytes.subarray(offset, offset + length);
    if (!isPng(png)) {
      return false;
    }
    const actual = pngSize(png);
    if (actual.width !== width || actual.height !== height) {
      return false;
    }
  }
  return true;
}
