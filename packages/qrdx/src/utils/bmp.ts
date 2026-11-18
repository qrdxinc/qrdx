/** biome-ignore-all lint/style/noMagicNumbers: BMP format constants */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: row padding and little-endian fields */
// A BMP writer in plain TypeScript with no DOM. Canvases can't encode BMP
// (toBlob("image/bmp") hands back a PNG), so every browser, and the server,
// uses this one.
//
// The file is an uncompressed 24-bit bitmap: a 14-byte file header, a 40-byte
// BITMAPINFOHEADER, then the pixel rows bottom-up in blue-green-red order,
// each row padded to a multiple of 4 bytes. 24-bit has no alpha channel, so
// a transparent or see-through pixel is laid over white (the legacy readers
// BMP is for don't agree on 32-bit alpha).

/** Largest width or height written. */
export const BMP_MAX_DIMENSION = 16_384;

const FILE_HEADER_SIZE = 14;
const INFO_HEADER_SIZE = 40;
const HEADER_SIZE = FILE_HEADER_SIZE + INFO_HEADER_SIZE;
const BYTES_PER_PIXEL = 3;
/** 72 pixels per inch, in pixels per metre, as most writers record it. */
const PIXELS_PER_METRE = 2835;
const OPAQUE = 255;

/** Bytes in one stored row: the pixels, padded to a multiple of 4. */
const rowStride = (width: number): number => (width * BYTES_PER_PIXEL + 3) & ~3;

/** A colour channel laid over white at `alpha` (0 to 255). */
const overWhite = (channel: number, alpha: number): number =>
  Math.floor((channel * alpha + OPAQUE * (OPAQUE - alpha) + 127) / OPAQUE);

/**
 * RGBA pixels (as a canvas's getImageData returns them: `width * height * 4`
 * bytes, top row first) as a 24-bit BMP file. Throws a RangeError for a size
 * that is not a whole number from 1 to BMP_MAX_DIMENSION, or pixels that
 * don't match it.
 */
export function encodeBMP(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Uint8Array {
  if (
    !(Number.isInteger(width) && Number.isInteger(height)) ||
    width < 1 ||
    height < 1 ||
    width > BMP_MAX_DIMENSION ||
    height > BMP_MAX_DIMENSION
  ) {
    throw new RangeError(
      `BMP width and height must be whole numbers from 1 to ${BMP_MAX_DIMENSION}, got ${width} x ${height}`
    );
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError(
      `Expected ${width * height * 4} RGBA bytes for ${width} x ${height}, got ${rgba.length}`
    );
  }

  const stride = rowStride(width);
  const imageSize = stride * height;
  const file = new Uint8Array(HEADER_SIZE + imageSize);
  const view = new DataView(file.buffer);

  file[0] = 0x42; // "B"
  file[1] = 0x4d; // "M"
  view.setUint32(2, file.length, true);
  view.setUint32(10, HEADER_SIZE, true); // where the pixels start
  view.setUint32(14, INFO_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: rows run bottom to top
  view.setUint16(26, 1, true); // colour planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // BI_RGB: no compression
  view.setUint32(34, imageSize, true);
  view.setInt32(38, PIXELS_PER_METRE, true);
  view.setInt32(42, PIXELS_PER_METRE, true);
  // The colour table counts (offsets 46 and 50) stay 0: all colours, no table.

  for (let y = 0; y < height; y++) {
    let source = y * width * 4;
    let target = HEADER_SIZE + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const alpha = rgba[source + 3] as number;
      const red = rgba[source] as number;
      const green = rgba[source + 1] as number;
      const blue = rgba[source + 2] as number;
      if (alpha === OPAQUE) {
        file[target] = blue;
        file[target + 1] = green;
        file[target + 2] = red;
      } else {
        file[target] = overWhite(blue, alpha);
        file[target + 1] = overWhite(green, alpha);
        file[target + 2] = overWhite(red, alpha);
      }
      source += 4;
      target += BYTES_PER_PIXEL;
    }
  }
  return file;
}

/**
 * True when `bytes` is a BMP this writer would make: the "BM" signature, a
 * file size that matches, the 40-byte header, one plane and 24 bits. Used to
 * check a file before it is saved, so nothing else is handed out as BMP.
 */
export function isBMPFile(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  return (
    view.getUint32(2, true) === bytes.length &&
    view.getUint32(10, true) === HEADER_SIZE &&
    view.getUint32(14, true) === INFO_HEADER_SIZE &&
    width > 0 &&
    height > 0 &&
    view.getUint16(26, true) === 1 &&
    view.getUint16(28, true) === 24 &&
    view.getUint32(30, true) === 0 &&
    bytes.length === HEADER_SIZE + rowStride(width) * height
  );
}
