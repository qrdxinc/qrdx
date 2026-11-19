/** biome-ignore-all lint/style/noMagicNumbers: PNG format constants */
// A synchronous 8-bit RGBA PNG writer for tests. Canvas.toDataURL is
// synchronous, and sharp is not, so the fake DOM's canvases use this to give
// the PNG a browser would. It writes unfiltered rows in one IDAT chunk; the
// files are read back with sharp, an independent decoder.
import { crc32, deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) {
    out[4 + index] = type.charCodeAt(index);
  }
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePngSync(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA

  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const at = y * (width * 4 + 1);
    rows[at] = 0; // filter: none
    for (let x = 0; x < width * 4; x++) {
      rows[at + 1 + x] = rgba[y * width * 4 + x] as number;
    }
  }
  const parts = [
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
