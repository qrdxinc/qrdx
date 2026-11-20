/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: reading packed GIF fields and color keys */
// The GIF writer (src/utils/gif.ts): a quantizer that keeps an image's own
// colors when they fit in 256 and reduces them otherwise, an LZW encoder
// whose output sharp (an independent reader) decodes to the same pixels, and a
// file check that rejects anything that isn't the GIF it writes.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  encodeGIF,
  encodeGIFFromRGBA,
  GIF_MAX_DIMENSION,
  type IndexedImage,
  indexedToRGBA,
  isGIFFile,
  quantizeRGBA,
} from "../src/utils/gif";

/** RGBA from a list of colors, one per pixel. */
function pixels(...colors: number[][]): Uint8ClampedArray {
  return Uint8ClampedArray.from(
    colors.flatMap(([r, g, b, a]) => [
      r as number,
      g as number,
      b as number,
      a ?? 255,
    ])
  );
}

/** A deterministic RGBA image with `palette` colors (0 for every pixel different). */
function noise(width: number, height: number, palette = 0, seed = 7) {
  const data = new Uint8ClampedArray(width * height * 4);
  const colors: number[][] = [];
  let state = seed;
  const next = () => {
    // Park-Miller: a small deterministic generator, exact in a double
    state = (state * 48_271) % 2_147_483_647;
    return state;
  };
  for (let index = 0; index < palette; index++) {
    colors.push([next() % 256, next() % 256, next() % 256]);
  }
  for (let pixel = 0; pixel < width * height; pixel++) {
    const [r, g, b] = palette
      ? (colors[next() % palette] as number[])
      : [next() % 256, next() % 256, next() % 256];
    data.set([r as number, g as number, b as number, 255], pixel * 4);
  }
  return data;
}

/** What sharp (libvips and giflib) reads out of GIF bytes: RGBA, top row first. */
async function decode(file: Uint8Array) {
  const { data, info } = await sharp(Buffer.from(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, rgba: new Uint8Array(data) };
}

describe("quantizeRGBA", () => {
  it("keeps an image's own colors when there are 256 or fewer", () => {
    const image = quantizeRGBA(
      pixels([0, 0, 0], [255, 255, 255], [0, 0, 0], [12, 34, 56]),
      2,
      2
    );
    expect(image.lossless).toBe(true);
    expect(image.colors).toBe(3);
    expect(image.transparentIndex).toBeNull();
    // In the order the colors first appear
    expect([...image.palette]).toEqual([0, 0, 0, 255, 255, 255, 12, 34, 56]);
    expect([...image.indices]).toEqual([0, 1, 0, 2]);
  });

  it("is lossless for exactly 256 opaque colors", () => {
    const image = quantizeRGBA(noise(64, 64, 256), 64, 64);
    // A random draw may not hit all 256; build exactly 256 by hand instead
    const all = new Uint8ClampedArray(256 * 4);
    for (let index = 0; index < 256; index++) {
      all.set([index, 255 - index, (index * 7) % 256, 255], index * 4);
    }
    const full = quantizeRGBA(all, 16, 16);
    expect(full.colors).toBe(256);
    expect(full.lossless).toBe(true);
    expect([...indexedToRGBA(full)]).toEqual([...all]);
    expect(image.colors).toBeLessThanOrEqual(256);
  });

  it("marks alpha under 128 as the one transparent color and the rest opaque", () => {
    const image = quantizeRGBA(
      pixels(
        [10, 20, 30, 0],
        [10, 20, 30, 127],
        [10, 20, 30, 128],
        [1, 2, 3, 255]
      ),
      4,
      1
    );
    expect(image.transparentIndex).toBe(2); // after the two opaque colors
    expect(image.colors).toBe(3);
    expect([...image.indices]).toEqual([2, 2, 0, 1]);
    // Half-transparent pixels changed, so this is not lossless
    expect(image.lossless).toBe(false);
  });

  it("is lossless with fully transparent and fully opaque pixels only", () => {
    const image = quantizeRGBA(
      pixels([0, 0, 0, 0], [5, 5, 5, 255], [0, 0, 0, 0]),
      3,
      1
    );
    expect(image.lossless).toBe(true);
    expect(image.transparentIndex).toBe(1);
  });

  it("keeps 255 colors and a transparent one when 256 opaque colors meet transparency", () => {
    const data = new Uint8ClampedArray(257 * 4);
    for (let index = 0; index < 256; index++) {
      data.set([index, 0, 255 - index, 255], index * 4);
    }
    data.set([0, 0, 0, 0], 256 * 4);
    const image = quantizeRGBA(data, 257, 1);
    // Reduced to fewer than 256 (nearby colors share a bucket), with the
    // transparent color last and never one of the 256 slots taken twice
    expect(image.colors).toBeLessThanOrEqual(256);
    expect(image.transparentIndex).toBe(image.colors - 1);
    expect(image.lossless).toBe(false);
  });

  it("handles an image with nothing opaque", () => {
    const image = quantizeRGBA(new Uint8ClampedArray(4 * 4), 2, 2);
    expect(image.colors).toBe(1);
    expect(image.transparentIndex).toBe(0);
    expect(image.lossless).toBe(true);
    expect(isGIFFile(encodeGIF(image))).toBe(true);
  });

  it("reduces more than 256 colors to at most 256, and keeps black and white exact", () => {
    // A black and white code with a smooth ramp laid over a corner
    const width = 128;
    const data = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        const inRamp = x < 64 && y < 64;
        const value = inRamp ? (x * 4 + y) % 256 : (x + y) % 2 ? 255 : 0;
        const green = inRamp ? (x * 3) % 256 : value;
        data.set([value, green, inRamp ? y * 4 : value, 255], at);
      }
    }
    const image = quantizeRGBA(data, width, width);
    expect(image.lossless).toBe(false);
    expect(image.colors).toBeLessThanOrEqual(256);
    const back = indexedToRGBA(image);
    // The black and white squares outside the ramp are exact
    for (let y = 0; y < width; y++) {
      for (let x = 64; x < width; x++) {
        const at = (y * width + x) * 4;
        expect([...back.subarray(at, at + 4)], `${x},${y}`).toEqual([
          ...data.subarray(at, at + 4),
        ]);
      }
    }
  });

  it("is deterministic", () => {
    const data = noise(40, 40);
    expect([...quantizeRGBA(data, 40, 40).indices]).toEqual([
      ...quantizeRGBA(data, 40, 40).indices,
    ]);
  });

  it("keeps a reduced image close to the original", () => {
    const data = noise(60, 60);
    const image = quantizeRGBA(data, 60, 60);
    const back = indexedToRGBA(image);
    let total = 0;
    for (let at = 0; at < data.length; at += 4) {
      for (let channel = 0; channel < 3; channel++) {
        total += Math.abs(
          (data[at + channel] as number) - (back[at + channel] as number)
        );
      }
    }
    // Pure noise is the worst case for 256 colors; the mean error per
    // channel stays well under what a random palette would give (about 85)
    expect(total / (60 * 60 * 3)).toBeLessThan(40);
  });

  it("rejects a bad size or pixel count", () => {
    expect(() => quantizeRGBA(new Uint8ClampedArray(4), 0, 1)).toThrow(
      RangeError
    );
    expect(() => quantizeRGBA(new Uint8ClampedArray(4), 1.5, 1)).toThrow(
      RangeError
    );
    expect(() =>
      quantizeRGBA(new Uint8ClampedArray(4), GIF_MAX_DIMENSION + 1, 1)
    ).toThrow(RangeError);
    expect(() => quantizeRGBA(new Uint8ClampedArray(7), 1, 2)).toThrow(
      /RGBA bytes/
    );
  });
});

describe("encodeGIF file", () => {
  const indexed = (over: Partial<IndexedImage> = {}): IndexedImage => ({
    width: 2,
    height: 2,
    palette: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 0, 0]),
    indices: Uint8Array.from([0, 1, 2, 0]),
    transparentIndex: null,
    ...over,
  });

  it("writes a GIF89a header, a padded color table and a trailer", () => {
    const file = encodeGIF(indexed());
    const view = new DataView(file.buffer);
    expect(String.fromCharCode(...file.subarray(0, 6))).toBe("GIF89a");
    expect(view.getUint16(6, true)).toBe(2);
    expect(view.getUint16(8, true)).toBe(2);
    // Table present, 8-bit color, 3 colors -> a table of 4 (size field 1)
    expect(file[10]).toBe(0x80 | (7 << 4) | 1);
    expect([...file.subarray(13, 25)]).toEqual([
      0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0,
    ]);
    expect(file[25]).toBe(0x2c); // no graphic control extension without transparency
    expect(file.at(-1)).toBe(0x3b);
    expect(isGIFFile(file)).toBe(true);
  });

  it("writes the transparent index in a graphic control extension", () => {
    const file = encodeGIF(indexed({ transparentIndex: 2 }));
    expect([...file.subarray(25, 33)]).toEqual([
      0x21, 0xf9, 4, 0x01, 0, 0, 2, 0,
    ]);
    expect(file[33]).toBe(0x2c);
    expect(isGIFFile(file)).toBe(true);
  });

  it("uses a minimum code size of 2 for small tables and the table's bits for larger", () => {
    const at = (colors: number) => {
      const file = encodeGIF({
        width: colors,
        height: 1,
        palette: new Uint8Array(colors * 3),
        indices: Uint8Array.from({ length: colors }, (_, i) => i),
        transparentIndex: null,
      });
      const tableBytes = 3 * (1 << (((file[10] as number) & 7) + 1));
      return file[13 + tableBytes + 10] as number;
    };
    expect(at(1)).toBe(2);
    expect(at(2)).toBe(2);
    expect(at(4)).toBe(2);
    expect(at(5)).toBe(3);
    expect(at(17)).toBe(5);
    expect(at(129)).toBe(8);
    expect(at(256)).toBe(8);
  });

  it("splits the data into blocks of at most 255 bytes", () => {
    const file = encodeGIF(quantizeRGBA(noise(100, 100), 100, 100));
    const view = file;
    const tableBytes = 3 * (1 << (((view[10] as number) & 7) + 1));
    let at = 13 + tableBytes + 10 + 1; // after the image descriptor and code size
    let blocks = 0;
    while (view[at] !== 0) {
      expect(view[at]).toBeLessThanOrEqual(255);
      at += (view[at] as number) + 1;
      blocks++;
    }
    expect(blocks).toBeGreaterThan(1);
    expect(at + 2).toBe(file.length); // the zero, then the trailer
  });

  it("rejects what a GIF can't hold", () => {
    expect(() => encodeGIF(indexed({ width: 0 }))).toThrow(RangeError);
    expect(() => encodeGIF(indexed({ palette: new Uint8Array(0) }))).toThrow(
      /palette/
    );
    expect(() =>
      encodeGIF(indexed({ palette: new Uint8Array(257 * 3) }))
    ).toThrow(/palette/);
    expect(() => encodeGIF(indexed({ palette: new Uint8Array(4) }))).toThrow(
      /palette/
    );
    expect(() => encodeGIF(indexed({ indices: new Uint8Array(3) }))).toThrow(
      /indices/
    );
    expect(() =>
      encodeGIF(indexed({ indices: Uint8Array.from([0, 1, 3, 0]) }))
    ).toThrow(/past the palette/);
    expect(() => encodeGIF(indexed({ transparentIndex: 3 }))).toThrow(
      /transparent index/
    );
    expect(() => encodeGIF(indexed({ transparentIndex: -1 }))).toThrow(
      /transparent index/
    );
  });
});

describe("a GIF read by sharp", () => {
  const sizes: [number, number][] = [
    [1, 1],
    [2, 3],
    [17, 13],
    [64, 64],
    [200, 150],
  ];

  for (const [width, height] of sizes) {
    it(`gives back every pixel of a ${width} x ${height} image in a few colors`, async () => {
      const data = noise(width, height, 5);
      const { file, image } = encodeGIFFromRGBA(data, width, height);
      expect(image.lossless).toBe(true);
      const decoded = await decode(file);
      expect([decoded.width, decoded.height]).toEqual([width, height]);
      expect([...decoded.rgba]).toEqual([...data]);
    });
  }

  it("gives back every pixel of an image with 256 colors", async () => {
    const data = noise(120, 90, 256, 99);
    const { file, image } = encodeGIFFromRGBA(data, 120, 90);
    expect(image.lossless).toBe(true);
    expect([...(await decode(file)).rgba]).toEqual([...data]);
  });

  it("survives LZW's table filling up and restarting", async () => {
    // Noise in 256 colors fills the 4096-entry table many times over
    const data = noise(300, 300, 256, 5);
    const { file, image } = encodeGIFFromRGBA(data, 300, 300);
    expect(image.lossless).toBe(true);
    expect([...(await decode(file)).rgba]).toEqual([...data]);
  });

  it("survives long runs of one color", async () => {
    const data = new Uint8ClampedArray(500 * 500 * 4).fill(255);
    data.set([0, 0, 0, 255], 0);
    const { file } = encodeGIFFromRGBA(data, 500, 500);
    expect([...(await decode(file)).rgba]).toEqual([...data]);
    // Compresses a flat image to a sliver
    expect(file.length).toBeLessThan(2000);
  });

  it("keeps a transparent background transparent", async () => {
    const width = 40;
    const data = new Uint8ClampedArray(width * width * 4);
    for (let pixel = 0; pixel < width * width; pixel++) {
      const dark = (pixel + Math.floor(pixel / width)) % 3 === 0;
      data.set(dark ? [10, 20, 30, 255] : [0, 0, 0, 0], pixel * 4);
    }
    const { file, image } = encodeGIFFromRGBA(data, width, width);
    expect(image.transparentIndex).not.toBeNull();
    const decoded = await decode(file);
    for (let pixel = 0; pixel < width * width; pixel++) {
      const at = pixel * 4;
      const expected = (data[at + 3] as number) === 0 ? 0 : 255;
      expect(decoded.rgba[at + 3], `alpha ${pixel}`).toBe(expected);
      if (expected === 255) {
        expect([...decoded.rgba.subarray(at, at + 3)]).toEqual([10, 20, 30]);
      }
    }
  });

  it("reads back the reduced palette when there are more than 256 colors", async () => {
    const data = noise(80, 80);
    const { file, image } = encodeGIFFromRGBA(data, 80, 80);
    expect(image.lossless).toBe(false);
    expect([...(await decode(file)).rgba]).toEqual([...indexedToRGBA(image)]);
  });

  it("is a file sharp calls a GIF", async () => {
    const { file } = encodeGIFFromRGBA(noise(30, 20, 9), 30, 20);
    const meta = await sharp(Buffer.from(file)).metadata();
    expect(meta.format).toBe("gif");
    expect(meta.pages ?? 1).toBe(1);
  });
});

describe("isGIFFile", () => {
  const good = () => encodeGIFFromRGBA(noise(20, 20, 6), 20, 20).file;

  it("accepts what encodeGIF writes", () => {
    expect(isGIFFile(good())).toBe(true);
    expect(isGIFFile(encodeGIFFromRGBA(pixels([0, 0, 0, 0]), 1, 1).file)).toBe(
      true
    );
  });

  it("rejects a PNG, an empty file and text", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(isGIFFile(new Uint8Array(png))).toBe(false);
    expect(isGIFFile(new Uint8Array(0))).toBe(false);
    expect(
      isGIFFile(new TextEncoder().encode("GIF89a but not really a gif file"))
    ).toBe(false);
  });

  it("rejects a GIF87a signature, a missing trailer and a truncated file", () => {
    const file = good();
    const old = file.slice();
    old[4] = 0x37; // GIF87a
    expect(isGIFFile(old)).toBe(false);
    expect(isGIFFile(file.subarray(0, file.length - 1))).toBe(false);
    expect(isGIFFile(file.subarray(0, 40))).toBe(false);
    const extra = new Uint8Array(file.length + 1);
    extra.set(file);
    expect(isGIFFile(extra)).toBe(false);
  });

  it("rejects an image whose size differs from the header's", () => {
    const file = good();
    const bent = file.slice();
    const tableBytes = 3 * (1 << (((file[10] as number) & 7) + 1));
    bent[13 + tableBytes + 5] = 21; // image descriptor width
    expect(isGIFFile(bent)).toBe(false);
  });

  it("rejects a file with no color table", () => {
    const file = good();
    const bent = file.slice();
    bent[10] = (bent[10] as number) & 0x7f;
    expect(isGIFFile(bent)).toBe(false);
  });
});
