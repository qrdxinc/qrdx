/** biome-ignore-all lint/style/noMagicNumbers: ICO format constants */
// A small reader for the ICOs QRdx writes (PNG images in the directory).
// It is written from the format, not from the encoder, and checks every
// header field the encoder sets. The PNGs inside are decoded with sharp.

export interface IcoEntry {
  width: number;
  height: number;
  planes: number;
  bitCount: number;
  /** Where the image data starts, and how long it is */
  offset: number;
  length: number;
  png: Uint8Array;
}

export function readICO(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0) {
    throw new Error("ICO reserved field is not 0");
  }
  if (view.getUint16(2, true) !== 1) {
    throw new Error("ICO type is not 1 (icon)");
  }
  const count = view.getUint16(4, true);
  const entries: IcoEntry[] = [];
  for (let index = 0; index < count; index++) {
    const at = 6 + 16 * index;
    if (bytes[at + 2] !== 0 || bytes[at + 3] !== 0) {
      throw new Error("ICO palette and reserved bytes are not 0");
    }
    const offset = view.getUint32(at + 12, true);
    const length = view.getUint32(at + 8, true);
    if (offset + length > bytes.length) {
      throw new Error("ICO image data runs past the end of the file");
    }
    entries.push({
      width: bytes[at] || 256,
      height: bytes[at + 1] || 256,
      planes: view.getUint16(at + 4, true),
      bitCount: view.getUint16(at + 6, true),
      offset,
      length,
      png: bytes.subarray(offset, offset + length),
    });
  }
  return entries;
}
