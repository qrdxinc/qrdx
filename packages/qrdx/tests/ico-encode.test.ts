/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// The ICO writer (src/utils/ico.ts): a valid directory and PNG images for any
// sizes from 1 to 256, with the images kept byte for byte, and a file check
// that rejects anything that isn't the ICO it writes. Read back with an
// independent reader (tests/support/ico.ts); the PNGs are decoded with sharp.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  encodeICO,
  ICO_MAX_DIMENSION,
  ICO_SIZES,
  isICOFile,
} from "../src/utils/ico";
import { readICO } from "./support/ico";
import { encodePngSync } from "./support/png-sync";

/** A solid RGBA square as a PNG file. */
function png(width: number, height = width, shade = 0) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = shade;
    rgba[index + 1] = 255 - shade;
    rgba[index + 2] = (index / 4) % 256;
    rgba[index + 3] = index % 8 === 0 ? 255 : 128;
  }
  return { rgba, file: encodePngSync(rgba, width, height) };
}

const image = (size: number, shade = 0) => ({
  width: size,
  height: size,
  png: png(size, size, shade).file,
});

describe("encodeICO header and directory", () => {
  it("writes an icon header and a 16-byte entry for each image", () => {
    const images = [image(16), image(32, 40), image(256, 80)];
    const file = encodeICO(images);
    const view = new DataView(file.buffer);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type: icon
    expect(view.getUint16(4, true)).toBe(3); // images
    const directory = 6 + 16 * 3;
    // 256 is stored as 0 in a byte
    expect([file[6], file[7]]).toEqual([16, 16]);
    expect([file[22], file[23]]).toEqual([32, 32]);
    expect([file[38], file[39]]).toEqual([0, 0]);
    let offset = directory;
    for (let index = 0; index < 3; index++) {
      const at = 6 + 16 * index;
      expect(file[at + 2], "palette").toBe(0);
      expect(file[at + 3], "reserved").toBe(0);
      expect(view.getUint16(at + 4, true), "planes").toBe(1);
      expect(view.getUint16(at + 6, true), "bits per pixel").toBe(32);
      expect(view.getUint32(at + 8, true), "length").toBe(
        images[index]?.png.length
      );
      expect(view.getUint32(at + 12, true), "offset").toBe(offset);
      offset += images[index]?.png.length as number;
    }
    expect(file.length).toBe(offset);
  });

  it("keeps each PNG byte for byte, in the order given", () => {
    const images = ICO_SIZES.map((size, index) => image(size, index * 50));
    const entries = readICO(encodeICO(images));
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual(
      ICO_SIZES.map((size) => [size, size])
    );
    entries.forEach((entry, index) => {
      expect(Buffer.compare(entry.png, images[index]?.png as Uint8Array)).toBe(
        0
      );
    });
  });

  it("decodes each image to its pixels, alpha included", async () => {
    const solid = png(48, 48, 120);
    const entries = readICO(
      encodeICO([{ width: 48, height: 48, png: solid.file }])
    );
    const { data, info } = await sharp(
      Buffer.from(entries[0]?.png as Uint8Array)
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([48, 48]);
    expect(Buffer.compare(data, Buffer.from(solid.rgba))).toBe(0);
  });

  it("takes a single image, and non-square ones up to 256", () => {
    const one = readICO(encodeICO([image(1)]));
    expect(one).toHaveLength(1);
    const wide = {
      width: 200,
      height: 40,
      png: png(200, 40).file,
    };
    expect(readICO(encodeICO([wide]))[0]).toMatchObject({
      width: 200,
      height: 40,
    });
  });
});

describe("encodeICO input checks", () => {
  it("refuses no images and too many", () => {
    expect(() => encodeICO([])).toThrow(RangeError);
    expect(() =>
      encodeICO(Array.from({ length: 65 }, () => image(16)))
    ).toThrow(/1 to 64 images/);
  });

  it.each([
    [0, 16],
    [16, 0],
    [ICO_MAX_DIMENSION + 1, 16],
    [16.5, 16],
    [Number.NaN, 16],
    [-16, 16],
  ])("refuses a %s x %s image", (width, height) => {
    expect(() => encodeICO([{ width, height, png: png(16).file }])).toThrow(
      RangeError
    );
  });

  it("refuses a file that isn't a PNG", () => {
    expect(() =>
      encodeICO([{ width: 16, height: 16, png: new Uint8Array(64) }])
    ).toThrow(/must be a PNG/);
    expect(() =>
      encodeICO([
        {
          width: 16,
          height: 16,
          png: new TextEncoder().encode("GIF89a not a png at all......."),
        },
      ])
    ).toThrow(/must be a PNG/);
  });

  it("refuses a PNG whose size isn't the one stated", () => {
    expect(() =>
      encodeICO([{ width: 32, height: 32, png: png(16).file }])
    ).toThrow(/says 32 x 32 but its PNG is 16 x 16/);
  });
});

describe("isICOFile", () => {
  const good = encodeICO([image(16), image(32), image(256)]);

  it("accepts what the writer makes", () => {
    expect(isICOFile(good)).toBe(true);
  });

  it("rejects a PNG, an empty file, text and a file cut short", () => {
    expect(isICOFile(png(32).file)).toBe(false);
    expect(isICOFile(new Uint8Array(0))).toBe(false);
    expect(isICOFile(new TextEncoder().encode("not an icon at all, no"))).toBe(
      false
    );
    expect(isICOFile(good.subarray(0, good.length - 1))).toBe(false);
    expect(isICOFile(good.subarray(0, 20))).toBe(false);
  });

  it("rejects a header or directory that disagrees with the file", () => {
    const cursor = good.slice();
    new DataView(cursor.buffer).setUint16(2, 2, true); // a cursor, not an icon
    expect(isICOFile(cursor)).toBe(false);

    const noImages = good.slice();
    new DataView(noImages.buffer).setUint16(4, 0, true);
    expect(isICOFile(noImages)).toBe(false);

    const tooMany = good.slice();
    new DataView(tooMany.buffer).setUint16(4, 500, true);
    expect(isICOFile(tooMany)).toBe(false);

    const pastEnd = good.slice();
    new DataView(pastEnd.buffer).setUint32(6 + 12, good.length, true);
    expect(isICOFile(pastEnd)).toBe(false);

    const wrongSize = good.slice();
    wrongSize[6] = 17; // the first entry says 17 px; its PNG is 16
    expect(isICOFile(wrongSize)).toBe(false);

    const notPng = good.slice();
    const firstOffset = new DataView(notPng.buffer).getUint32(6 + 12, true);
    notPng[firstOffset] = 0; // break the PNG signature
    expect(isICOFile(notPng)).toBe(false);
  });
});
