/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// TIFF downloads on the fake DOM (tests/support): no browser encodes TIFF from
// a canvas (toBlob("image/tiff") returns a PNG), so the file always comes from
// the built-in encoder. It is a real TIFF at the canvas size, RGBA keeps a
// transparent background, CMYK lays it over white, and both scan.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DOWNLOAD_FORMATS,
  downloadQRCode,
  getDownloadFilename,
  getQRAsTIFF,
  getQRCodeDataUrl,
} from "../src/download";
import { getQRAsCanvas } from "../src/export";
import { getFrameDimensions } from "../src/frame";
import { canvasToTIFF } from "../src/tiff";
import { isTIFFFile } from "../src/utils/tiff";
import { installFakeDom } from "./support/fake-dom";
import { decodeQR } from "./support/raster";

interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): {
    getImageData(
      x: number,
      y: number,
      w: number,
      h: number
    ): { data: Uint8ClampedArray };
  };
}

let uninstall: () => void = () => undefined;

beforeEach(() => {
  uninstall = installFakeDom();
});

afterEach(() => {
  uninstall();
});

const VALUE = "https://qrdx.dev/tiff";

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const fromDataUrl = (url: string) =>
  new Uint8Array(Buffer.from(url.split(",")[1] ?? "", "base64"));

/** A TIFF as RGBA (sharp converts CMYK to sRGB). */
async function read(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width: info.width, height: info.height };
}

describe("getQRAsTIFF", () => {
  it("is an RGBA TIFF of the canvas's size, at 300 dpi, that scans", async () => {
    const blob = await getQRAsTIFF({ value: VALUE, size: 320 });
    expect(blob.type).toBe("image/tiff");
    const bytes = await bytesOf(blob);
    expect(isTIFFFile(bytes)).toBe(true);
    const meta = await sharp(bytes).metadata();
    expect([meta.space, meta.channels, meta.density]).toEqual(["srgb", 4, 300]);
    const { width, height, rgba } = await read(bytes);
    expect([width, height]).toEqual([320, 320]);
    expect(decodeQR({ data: rgba, width, height })).toBe(VALUE);
  });

  it("is pixel for pixel the canvas", async () => {
    const canvas = (await getQRAsCanvas(
      { value: VALUE, size: 200 },
      "image/png",
      true
    )) as unknown as CanvasLike;
    const { data } = canvas.getContext("2d").getImageData(0, 0, 200, 200);
    const { rgba } = await read(
      await bytesOf(await canvasToTIFF(canvas as unknown as HTMLCanvasElement))
    );
    expect(Buffer.compare(Buffer.from(rgba), Buffer.from(data))).toBe(0);
  });

  it("keeps a transparent background in RGBA", async () => {
    const blob = await getQRAsTIFF({
      value: VALUE,
      size: 240,
      bgColor: "transparent",
    });
    const { rgba } = await read(await bytesOf(blob));
    expect(rgba[3]).toBe(0);
  });

  it("writes CMYK for print: a transparent background comes out white, and it scans", async () => {
    const blob = await getQRAsTIFF(
      { value: VALUE, size: 240, bgColor: "transparent" },
      { colorMode: "cmyk" }
    );
    const bytes = await bytesOf(blob);
    const meta = await sharp(bytes).metadata();
    expect([meta.space, meta.channels]).toEqual(["cmyk", 4]);
    const { width, height, rgba } = await read(bytes);
    // The quiet zone's corner: no ink, which sharp shows as white
    expect([...rgba.subarray(0, 3)]).toEqual([255, 255, 255]);
    expect(decodeQR({ data: rgba, width, height })).toBe(VALUE);
  });

  it("includes a frame in its size", async () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const blob = await getQRAsTIFF({ value: VALUE, size: 300, frame });
    const { width, height } = await read(await bytesOf(blob));
    const expected = getFrameDimensions(300, frame);
    expect([width, height]).toEqual([
      Math.round(expected.width),
      Math.round(expected.height),
    ]);
  });

  it("says so when the canvas has no 2d context", async () => {
    const canvas = {
      width: 4,
      height: 4,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    await expect(canvasToTIFF(canvas)).rejects.toThrow(/canvas context/);
  });
});

describe("TIFF downloads", () => {
  let saved: { name: string; href: string }[] = [];

  beforeEach(() => {
    saved = [];
    const createCanvas = document.createElement.bind(document);
    Object.assign(globalThis.document, {
      createElement(tag: string) {
        if (tag === "a") {
          const link = {
            href: "",
            download: "",
            click: () => saved.push({ name: link.download, href: link.href }),
          };
          return link;
        }
        return createCanvas(tag);
      },
      body: { appendChild: () => undefined, removeChild: () => undefined },
    });
  });

  it("saves a .tif named after its pixel size, and -cmyk for CMYK", async () => {
    await downloadQRCode(
      { value: VALUE },
      { format: "tiff", size: { width: 400, height: 400 } }
    );
    await downloadQRCode(
      { value: VALUE },
      { format: "tiff-cmyk", size: { width: 400, height: 400 } }
    );
    expect(saved.map((file) => file.name)).toEqual([
      "qr-code-400x400.tif",
      "qr-code-400x400-cmyk.tif",
    ]);
    for (const [index, space] of ["srgb", "cmyk"].entries()) {
      const href = saved[index]?.href ?? "";
      expect(href.startsWith("data:image/tiff;base64,")).toBe(true);
      expect((await sharp(fromDataUrl(href)).metadata()).space).toBe(space);
    }
  });

  it("names both after the frame's size too", () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const { width, height } = getFrameDimensions(400, frame);
    const size = `${Math.round(width)}x${Math.round(height)}`;
    expect(
      getDownloadFilename("tiff", { width: 400, height: 400 }, frame)
    ).toBe(`qr-code-${size}.tif`);
    expect(
      getDownloadFilename("tiff-cmyk", { width: 400, height: 400 }, frame)
    ).toBe(`qr-code-${size}-cmyk.tif`);
    expect(DOWNLOAD_FORMATS.tiff.mimeType).toBe("image/tiff");
  });

  it("gives both as data URLs", async () => {
    for (const [format, space] of [
      ["tiff", "srgb"],
      ["tiff-cmyk", "cmyk"],
    ] as const) {
      const url = await getQRCodeDataUrl({ value: VALUE }, format, {
        width: 200,
        height: 200,
      });
      expect(url.startsWith("data:image/tiff;base64,")).toBe(true);
      expect((await sharp(fromDataUrl(url)).metadata()).space).toBe(space);
    }
  });

  it("gives an RGBA TIFF from getQRAsCanvas for image/tiff", async () => {
    const url = (await getQRAsCanvas(
      { value: VALUE, size: 120 },
      "image/tiff"
    )) as string;
    expect(url.startsWith("data:image/tiff;base64,")).toBe(true);
    const { width, height, rgba } = await read(fromDataUrl(url));
    expect(decodeQR({ data: rgba, width, height })).toBe(VALUE);
  });
});
