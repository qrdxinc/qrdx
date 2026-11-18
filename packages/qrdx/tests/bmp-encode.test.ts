/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// The BMP writer (src/utils/bmp.ts): a valid 24-bit file for any size, every
// pixel exact, alpha laid over white, and a file check that rejects anything
// that isn't the BMP it writes. Decoded with an independent reader
// (tests/support/bmp.ts), since sharp can't read BMP.
import { describe, expect, it } from "vitest";
import { BMP_MAX_DIMENSION, encodeBMP, isBMPFile } from "../src/utils/bmp";
import { readBMP } from "./support/bmp";

/** A deterministic opaque RGBA image. */
function image(width: number, height: number, seed = 1) {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed;
  for (let index = 0; index < data.length; index += 4) {
    // Park-Miller: a small deterministic generator, exact in a double
    state = (state * 48_271) % 2_147_483_647;
    data[index] = state % 256;
    data[index + 1] = Math.floor(state / 256) % 256;
    data[index + 2] = Math.floor(state / 65_536) % 256;
    data[index + 3] = 255;
  }
  return data;
}

describe("encodeBMP header", () => {
  it("writes the file and info headers of a 24-bit uncompressed bitmap", () => {
    const file = encodeBMP(image(3, 2), 3, 2);
    const view = new DataView(file.buffer);
    // 3 px = 9 bytes, padded to 12 a row; two rows
    expect(file.length).toBe(54 + 12 * 2);
    expect(String.fromCharCode(file[0] as number, file[1] as number)).toBe(
      "BM"
    );
    expect(view.getUint32(2, true)).toBe(file.length); // file size
    expect(view.getUint32(6, true)).toBe(0); // reserved
    expect(view.getUint32(10, true)).toBe(54); // pixel data offset
    expect(view.getUint32(14, true)).toBe(40); // BITMAPINFOHEADER
    expect(view.getInt32(18, true)).toBe(3); // width
    expect(view.getInt32(22, true)).toBe(2); // height, bottom-up
    expect(view.getUint16(26, true)).toBe(1); // planes
    expect(view.getUint16(28, true)).toBe(24); // bits per pixel
    expect(view.getUint32(30, true)).toBe(0); // BI_RGB
    expect(view.getUint32(34, true)).toBe(24); // pixel data size
    expect(view.getInt32(38, true)).toBe(2835);
    expect(view.getInt32(42, true)).toBe(2835);
    expect(view.getUint32(46, true)).toBe(0); // colours used
    expect(view.getUint32(50, true)).toBe(0); // important colours
  });

  it("pads each row to a multiple of 4 bytes, with zeros", () => {
    for (let width = 1; width <= 9; width++) {
      const file = encodeBMP(image(width, 3, width), width, 3);
      const stride = Math.ceil((width * 3) / 4) * 4;
      expect(file.length, `width ${width}`).toBe(54 + stride * 3);
      expect(isBMPFile(file), `width ${width}`).toBe(true);
      for (let row = 0; row < 3; row++) {
        for (let pad = width * 3; pad < stride; pad++) {
          expect(file[54 + row * stride + pad]).toBe(0);
        }
      }
    }
  });

  it("stores pixels blue, green, red with the bottom row first", () => {
    // 2 x 2: top row red, green; bottom row blue, white
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const file = encodeBMP(rgba, 2, 2);
    // Stored first: the bottom row, blue then white, as B G R
    expect([...file.subarray(54, 54 + 6)]).toEqual([255, 0, 0, 255, 255, 255]);
    // Then the top row: red then green
    expect([...file.subarray(54 + 8, 54 + 8 + 6)]).toEqual([
      0, 0, 255, 0, 255, 0,
    ]);
  });
});

describe("encodeBMP pixels", () => {
  it.each([
    [1, 1],
    [2, 1],
    [1, 7],
    [3, 3],
    [5, 4],
    [64, 64],
    [255, 17],
    [400, 400],
  ])("%i x %i: every pixel comes back exact", (width, height) => {
    const rgba = image(width, height, width * 31 + height);
    const decoded = readBMP(encodeBMP(rgba, width, height));
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    expect(Buffer.compare(Buffer.from(decoded.rgba), Buffer.from(rgba))).toBe(
      0
    );
  });

  it("lays see-through pixels over white", () => {
    const rgba = new Uint8ClampedArray([
      0,
      0,
      0,
      0, // fully transparent black -> white
      0,
      0,
      0,
      255, // opaque black stays black
      0,
      0,
      0,
      128, // half black -> mid grey
      200,
      100,
      50,
      255, // opaque colour is untouched
    ]);
    const { rgba: out } = readBMP(encodeBMP(rgba, 4, 1));
    expect([...out.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...out.subarray(4, 8)]).toEqual([0, 0, 0, 255]);
    const grey = out[8] as number;
    expect(grey).toBeGreaterThanOrEqual(126);
    expect(grey).toBeLessThanOrEqual(128);
    expect([out[9], out[10]]).toEqual([grey, grey]);
    expect([...out.subarray(12, 16)]).toEqual([200, 100, 50, 255]);
  });

  it("ignores the colour of a fully transparent pixel", () => {
    const rgba = new Uint8ClampedArray([12, 200, 99, 0]);
    expect([...readBMP(encodeBMP(rgba, 1, 1)).rgba]).toEqual([
      255, 255, 255, 255,
    ]);
  });
});

describe("encodeBMP input checks", () => {
  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [BMP_MAX_DIMENSION + 1, 1],
  ])("refuses a %s x %s size", (width, height) => {
    expect(() => encodeBMP(new Uint8Array(16), width, height)).toThrow(
      RangeError
    );
  });

  it("refuses pixels that don't match the size", () => {
    expect(() => encodeBMP(new Uint8Array(15), 2, 2)).toThrow(/Expected 16/);
    expect(() => encodeBMP(new Uint8Array(17), 2, 2)).toThrow(RangeError);
  });
});

describe("isBMPFile", () => {
  const good = encodeBMP(image(4, 4), 4, 4);

  it("accepts what the writer makes", () => {
    expect(isBMPFile(good)).toBe(true);
  });

  it("rejects a PNG, an empty file, text and a file cut short", () => {
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(60).fill(0),
    ]);
    expect(isBMPFile(png)).toBe(false);
    expect(isBMPFile(new Uint8Array(0))).toBe(false);
    expect(isBMPFile(new TextEncoder().encode("BM not really a bitmap"))).toBe(
      false
    );
    expect(isBMPFile(good.subarray(0, good.length - 1))).toBe(false);
  });

  it("rejects a header that disagrees with the file", () => {
    const wrongSize = good.slice();
    new DataView(wrongSize.buffer).setUint32(2, good.length + 4, true);
    expect(isBMPFile(wrongSize)).toBe(false);

    const wrongDepth = good.slice();
    new DataView(wrongDepth.buffer).setUint16(28, 32, true);
    expect(isBMPFile(wrongDepth)).toBe(false);

    const compressed = good.slice();
    new DataView(compressed.buffer).setUint32(30, 1, true);
    expect(isBMPFile(compressed)).toBe(false);

    const wide = good.slice();
    new DataView(wide.buffer).setInt32(18, 40, true);
    expect(isBMPFile(wide)).toBe(false);
  });
});
