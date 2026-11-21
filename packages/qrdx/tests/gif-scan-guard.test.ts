/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// The GIF scan guard (src/gif.ts): a design that needs more than 256 colors
// is decoded against its original after it is reduced, and refused when the
// original decoded and the GIF would not. The decoder (jsqr) is replaced here,
// since no real design loses its scan to a palette: what is tested is when the
// guard looks, and what it does with the answer.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertGIFStillScans, GIFScanError, pixelsToGIF } from "../src/gif";

// vi.mock is hoisted above the imports, so the module sees the stand-in
const decode = vi.fn();
vi.mock("jsqr", () => ({
  default: (...args: unknown[]) => decode(...args),
}));

const VALUE = "https://qrdx.dev/guard";

/** What jsqr returns for a code it read, and for none. */
const read = (value = VALUE) => ({
  data: value,
  binaryData: [...new TextEncoder().encode(value)],
});
const NOTHING: null = null;

/** More than 256 colors: every pixel its own shade. */
function manyColors(width = 40, height = 40) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    // The red and blue repeat every 256 pixels; the green steps each lap,
    // so no two laps share a color: 1 600 pixels, 1 600 colors
    data.set(
      [pixel % 256, Math.floor(pixel / 256) * 40, (pixel * 3) % 256, 255],
      pixel * 4
    );
  }
  return { data, width, height };
}

/** Two colors only: written exactly. */
function flat(width = 8, height = 8) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    data.set(pixel % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], pixel * 4);
  }
  return { data, width, height };
}

beforeEach(() => {
  decode.mockReset();
});

describe("pixelsToGIF scan guard", () => {
  it("never decodes a lossless GIF: it is the original, pixel for pixel", async () => {
    const result = await pixelsToGIF(flat(), VALUE);
    expect(result.lossless).toBe(true);
    expect(decode).not.toHaveBeenCalled();
  });

  it("doesn't decode when it isn't told the value", async () => {
    const result = await pixelsToGIF(manyColors());
    expect(result.lossless).toBe(false);
    expect(result.colors).toBeGreaterThan(1);
    expect(decode).not.toHaveBeenCalled();
  });

  it("returns the GIF when the reduced image still decodes", async () => {
    decode.mockReturnValue(read());
    const result = await pixelsToGIF(manyColors(), VALUE);
    expect(result.lossless).toBe(false);
    expect(result.colors).toBeLessThanOrEqual(256);
    expect(decode).toHaveBeenCalledTimes(2); // the original, then the GIF
  });

  it("refuses the GIF when the original decoded and the reduced image would not", async () => {
    decode.mockReturnValueOnce(read()).mockReturnValueOnce(NOTHING);
    const failure = pixelsToGIF(manyColors(), VALUE);
    await expect(failure).rejects.toBeInstanceOf(GIFScanError);
    await expect(failure).rejects.toThrow(/Download a PNG instead/);
  });

  it("refuses a GIF that decodes to something else", async () => {
    decode
      .mockReturnValueOnce(read())
      .mockReturnValueOnce(read("https://example.com/other"));
    await expect(pixelsToGIF(manyColors(), VALUE)).rejects.toBeInstanceOf(
      GIFScanError
    );
  });

  it("does not blame the GIF for a design that didn't decode to begin with", async () => {
    decode.mockReturnValue(NOTHING);
    const result = await pixelsToGIF(manyColors(), VALUE);
    expect(result.file.length).toBeGreaterThan(0);
    // Once, on the original: no second decode once that one has failed
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("decodes both images over white, so a transparent code is read as on paper", async () => {
    decode.mockReturnValue(read());
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
      // Half the pixels clear, the rest in over 255 distinct dark shades
      data.set(
        pixel % 2
          ? [0, 0, 0, 0]
          : [pixel % 256, Math.floor(pixel / 256) * 60, 0, 255],
        pixel * 4
      );
    }
    await pixelsToGIF({ data, width, height }, VALUE);
    expect(decode).toHaveBeenCalledTimes(2);
    for (const [pixels, w] of decode.mock.calls as [
      Uint8ClampedArray,
      number,
    ][]) {
      expect(w).toBe(width);
      // Clear pixels are white and opaque, not black
      expect([...pixels.subarray(4, 8)]).toEqual([255, 255, 255, 255]);
    }
  });
});

describe("assertGIFStillScans", () => {
  const same = flat();

  it("doesn't decode pixels that came through unchanged", async () => {
    await assertGIFStillScans(
      same,
      { ...same, data: same.data.slice() },
      VALUE
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it("treats a see-through pixel and a white one as the same", async () => {
    // Clear and white are the same over white paper
    const clear = flat();
    clear.data.set([0, 0, 0, 0], 0);
    const white = flat();
    white.data.set([255, 255, 255, 255], 0);
    await assertGIFStillScans(clear, white, VALUE);
    expect(decode).not.toHaveBeenCalled();
  });

  it("decodes when the image changed size", async () => {
    decode.mockReturnValue(read());
    await assertGIFStillScans(same, flat(4, 4), VALUE);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("reads a code whose text is mangled through its binary data", async () => {
    // jsqr's `data` can be mangled for binary payloads; the bytes are exact
    decode.mockReturnValue({
      data: "mangled",
      binaryData: [...new TextEncoder().encode(VALUE)],
    });
    await assertGIFStillScans(same, manyColors(8, 8), VALUE);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("throws a GIFScanError the caller can tell apart from any other failure", async () => {
    decode.mockReturnValueOnce(read()).mockReturnValueOnce(NOTHING);
    const error = await assertGIFStillScans(
      same,
      manyColors(8, 8),
      VALUE
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GIFScanError);
    expect((error as Error).name).toBe("GIFScanError");
  });
});
