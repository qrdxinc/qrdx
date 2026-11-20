/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// The GIF scan guard when jsqr can't be loaded (a page without it in its
// import map): a GIF that needed its colors reduced can't be checked, so it
// is refused, not handed out unchecked. A GIF that came through exactly needs
// no check and is still written.
import { describe, expect, it, vi } from "vitest";
import { GIFScanError, isGIFFile, pixelsToGIF } from "../src/gif";

vi.mock("jsqr", () => {
  throw new Error("Failed to resolve module specifier 'jsqr'");
});

const VALUE = "https://qrdx.dev/no-decoder";

function pixels(colors: number) {
  const width = 50;
  const height = 50;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const shade = pixel % colors;
    data.set([shade % 256, Math.floor(shade / 256) * 50, 0, 255], pixel * 4);
  }
  return { data, width, height };
}

describe("pixelsToGIF without a decoder", () => {
  it("refuses a GIF whose colors were reduced, and says why", async () => {
    const failure = pixelsToGIF(pixels(900), VALUE);
    await expect(failure).rejects.toBeInstanceOf(GIFScanError);
    await expect(failure).rejects.toThrow(/jsqr is not available/);
    await expect(failure).rejects.toThrow(/Download a PNG instead/);
  });

  it("still writes a GIF that needed no reduction", async () => {
    const result = await pixelsToGIF(pixels(200), VALUE);
    expect(result.lossless).toBe(true);
    expect(isGIFFile(result.file)).toBe(true);
  });

  it("writes any GIF when it isn't asked to check one", async () => {
    const result = await pixelsToGIF(pixels(900));
    expect(isGIFFile(result.file)).toBe(true);
  });
});
