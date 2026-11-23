/** biome-ignore-all lint/style/noMagicNumbers: sizes, tags and pixel values */
// The built-in TIFF writer (src/utils/tiff.ts), checked two ways: sharp
// (libvips and libtiff) decodes every file, and the tags and stored samples
// are read straight from the bytes, so a CMYK file's ink values are what
// the file holds, not what a reader's color conversion makes of them.
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeTIFF,
  isTIFFFile,
  TIFF_DPI,
  TIFF_MAX_DIMENSION,
} from "../src/utils/tiff";

/** The first directory's tags (value or offset) of a little-endian TIFF. */
function tags(
  bytes: Uint8Array
): Map<number, { count: number; value: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ifd = view.getUint32(4, true);
  const out = new Map<number, { count: number; value: number }>();
  for (let i = 0; i < view.getUint16(ifd, true); i++) {
    const entry = ifd + 2 + i * 12;
    const type = view.getUint16(entry + 2, true);
    const count = view.getUint32(entry + 4, true);
    const value =
      type === 3 && count === 1
        ? view.getUint16(entry + 8, true)
        : view.getUint32(entry + 8, true);
    out.set(view.getUint16(entry, true), { count, value });
  }
  return out;
}

/** The stored samples of an uncompressed file. */
function strip(bytes: Uint8Array): Uint8Array {
  const t = tags(bytes);
  const offset = t.get(273)?.value ?? 0;
  return bytes.subarray(offset, offset + (t.get(279)?.value ?? 0));
}

/** Black, white, QRdx blue, half-transparent red, fully transparent. */
const SWATCHES = Uint8Array.from([
  0, 0, 0, 255, 255, 255, 255, 255, 0x15, 0x5d, 0xfc, 255, 255, 0, 0, 128, 10,
  20, 30, 0,
]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encodeTIFF", () => {
  it("writes RGBA that decodes to the same pixels, transparency included", async () => {
    const file = await encodeTIFF(SWATCHES, 5, 1);
    expect(isTIFFFile(file)).toBe(true);
    const { data, info } = await sharp(file)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([5, 1, 4]);
    expect([...data]).toEqual([...SWATCHES]);
  });

  it("is Deflate with the predictor, at 300 dpi, RGB with unassociated alpha", async () => {
    const file = await encodeTIFF(SWATCHES, 5, 1);
    const t = tags(file);
    expect(t.get(259)?.value).toBe(8); // Adobe Deflate
    expect(t.get(317)?.value).toBe(2); // horizontal predictor
    expect(t.get(262)?.value).toBe(2); // RGB
    expect(t.get(338)?.value).toBe(2); // unassociated alpha
    expect(t.get(296)?.value).toBe(2); // inch
    const meta = await sharp(file).metadata();
    expect(meta.density).toBe(TIFF_DPI);
  });

  it("writes CMYK by the engine's conversion: black K only, no ink for white", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const file = await encodeTIFF(SWATCHES, 5, 1, { colorMode: "cmyk" });
    const t = tags(file);
    expect(t.get(262)?.value).toBe(5); // separated
    expect(t.get(332)?.value).toBe(1); // InkSet CMYK
    expect(t.has(338)).toBe(false);
    expect(t.get(259)?.value).toBe(1);
    expect([...strip(file)]).toEqual([
      // black: K only
      0, 0, 0, 255,
      // white: no ink
      0, 0, 0, 0,
      // #155dfc: C92 M63 Y0 K1, as rgbToCmyk (and the print PDF) gives
      234, 161, 0, 3,
      // red at half opacity, laid over white: #ff7f7f
      0, 128, 128, 0,
      // transparent: white
      0, 0, 0, 0,
    ]);
    const meta = await sharp(file).metadata();
    expect(meta.space).toBe("cmyk");
    expect(meta.hasProfile).toBe(false);
  });

  it("writes uncompressed samples where Compression Streams are missing", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const file = await encodeTIFF(SWATCHES, 5, 1);
    const t = tags(file);
    expect(t.get(259)?.value).toBe(1);
    expect(t.has(317)).toBe(false);
    expect([...strip(file)]).toEqual([...SWATCHES]);
    const { data } = await sharp(file)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data]).toEqual([...SWATCHES]);
  });

  it("records the dpi it's given", async () => {
    const file = await encodeTIFF(SWATCHES, 5, 1, { dpi: 600 });
    expect((await sharp(file).metadata()).density).toBe(600);
  });

  it("compresses a large flat image well and still decodes it exactly", async () => {
    const size = 600;
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
        rgba.set(
          dark ? [17, 24, 39, 255] : [255, 255, 255, 255],
          (y * size + x) * 4
        );
      }
    }
    const file = await encodeTIFF(rgba, size, size);
    expect(file.length).toBeLessThan(rgba.length / 50);
    const { data } = await sharp(file)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(Buffer.compare(data, Buffer.from(rgba))).toBe(0);
  });

  it("refuses a size it can't write and pixels that don't match", async () => {
    await expect(encodeTIFF(new Uint8Array(4), 0, 1)).rejects.toThrow(
      RangeError
    );
    await expect(
      encodeTIFF(new Uint8Array(4), TIFF_MAX_DIMENSION + 1, 1)
    ).rejects.toThrow(/whole number from 1 to 16384/);
    await expect(encodeTIFF(new Uint8Array(8), 1, 1)).rejects.toThrow(
      /Expected 4 RGBA bytes/
    );
    await expect(
      encodeTIFF(new Uint8Array(4), 1, 1, { dpi: 0 })
    ).rejects.toThrow(/dpi must be a positive number/);
  });
});

describe("isTIFFFile", () => {
  it("knows TIFF's two byte orders and nothing else", () => {
    expect(isTIFFFile([0x49, 0x49, 42, 0, 8, 0, 0, 0])).toBe(true);
    expect(isTIFFFile([0x4d, 0x4d, 0, 42, 0, 0, 0, 8])).toBe(true);
    expect(isTIFFFile([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])).toBe(false);
    expect(isTIFFFile([0x49, 0x49, 42])).toBe(false);
  });
});
