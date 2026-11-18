/** biome-ignore-all lint/style/noMagicNumbers: BMP format constants */
// A small reader for the BMPs QRdx writes (uncompressed, 24-bit, bottom-up).
// sharp can't read BMP, so the tests decode with this independent reader: it
// is written from the format, not from the encoder, and checks every header
// field the encoder sets.

export interface DecodedBMP {
  width: number;
  height: number;
  /** Top row first, 4 bytes a pixel (alpha always 255) */
  rgba: Uint8ClampedArray;
}

export function readBMP(bytes: Uint8Array): DecodedBMP {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error("Not a BMP: no BM signature");
  }
  if (view.getUint32(2, true) !== bytes.length) {
    throw new Error("BMP file size field doesn't match the file");
  }
  const offset = view.getUint32(10, true);
  if (view.getUint32(14, true) !== 40) {
    throw new Error("Expected a 40-byte BITMAPINFOHEADER");
  }
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const height = Math.abs(signedHeight);
  if (view.getUint16(26, true) !== 1) {
    throw new Error("Expected one colour plane");
  }
  if (view.getUint16(28, true) !== 24) {
    throw new Error("Expected 24 bits per pixel");
  }
  if (view.getUint32(30, true) !== 0) {
    throw new Error("Expected BI_RGB (no compression)");
  }
  const stride = Math.ceil((width * 3) / 4) * 4;
  if (view.getUint32(34, true) !== stride * height) {
    throw new Error("Image size field doesn't match the rows");
  }
  if (bytes.length < offset + stride * height) {
    throw new Error("BMP pixel data is cut short");
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    // Positive height: the first stored row is the bottom one.
    const y = signedHeight > 0 ? height - 1 - row : row;
    for (let x = 0; x < width; x++) {
      const from = offset + row * stride + x * 3;
      const to = (y * width + x) * 4;
      rgba[to] = bytes[from + 2] as number;
      rgba[to + 1] = bytes[from + 1] as number;
      rgba[to + 2] = bytes[from] as number;
      rgba[to + 3] = 255;
    }
  }
  return { width, height, rgba };
}
