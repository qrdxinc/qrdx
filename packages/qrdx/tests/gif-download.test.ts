/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: reading packed GIF fields and color keys */
// GIF downloads on the fake DOM (tests/support): no browser encodes GIF from a
// canvas (toBlob("image/gif") returns a PNG), so the file is made from the
// canvas's pixels and the built-in GIF writer. A code in flat colors comes
// out pixel for pixel, a gradient is reduced to a palette and still scans, a
// transparent background stays transparent, and a PNG is never passed off as
// a GIF.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadQRCode,
  getDownloadFilename,
  getQRAsGIF,
  getQRCodeDataUrl,
} from "../src/download";
import { getQRAsCanvas } from "../src/export";
import { GIF_MIME, isGIFFile } from "../src/gif";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { encodePngSync } from "./support/png-sync";
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

/** What a browser's canvas gives for toDataURL: a PNG of its pixels. */
const browserPng = (canvas: CanvasLike) => {
  const { data } = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height);
  return `data:image/png;base64,${Buffer.from(
    encodePngSync(data, canvas.width, canvas.height)
  ).toString("base64")}`;
};

beforeEach(() => {
  uninstall = installFakeDom();
  const canvas = document.createElement("canvas");
  const prototype = Object.getPrototypeOf(canvas) as {
    toDataURL: (this: CanvasLike) => string;
  };
  prototype.toDataURL = function toDataURLOfCanvas(this: CanvasLike) {
    return browserPng(this);
  };
});

afterEach(() => {
  uninstall();
});

const VALUE = "https://qrdx.dev/gif";

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const fromDataUrl = (url: string) =>
  new Uint8Array(Buffer.from(url.split(",")[1] ?? "", "base64"));

/** What sharp reads out of GIF bytes: RGBA, top row first. */
async function pixelsOf(gif: Uint8Array) {
  const { data, info } = await sharp(Buffer.from(gif))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), info };
}

/** The canvas's own pixels for the same props: what the GIF has to equal. */
async function canvasPixels(props: QRProps) {
  const canvas = (await getQRAsCanvas(
    props,
    "image/png",
    true
  )) as unknown as CanvasLike;
  const { data } = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height };
}

describe("getQRAsGIF", () => {
  it("is a GIF the writer's own check and sharp both accept", async () => {
    const blob = await getQRAsGIF({ value: VALUE, size: 300 });
    expect(blob.type).toBe(GIF_MIME);
    const bytes = await bytesOf(blob);
    expect(isGIFFile(bytes)).toBe(true);
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe("GIF89a");
    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect(meta.format).toBe("gif");
    expect([meta.width, meta.height]).toEqual([300, 300]);
  });

  it("holds a code in flat colors pixel for pixel, and it scans", async () => {
    const props: QRProps = { value: VALUE, size: 300 };
    const expected = await canvasPixels(props);
    const { data, info } = await pixelsOf(
      await bytesOf(await getQRAsGIF(props))
    );
    expect([info.width, info.height]).toEqual([
      expected.width,
      expected.height,
    ]);
    // Antialiased module edges add shades, but all within 256 colors
    expect(Buffer.compare(Buffer.from(data), Buffer.from(expected.data))).toBe(
      0
    );
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      VALUE
    );
  });

  it("keeps a colored code's colors", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 300,
      fgColor: "#1d4ed8",
      bgColor: "#fef3c7",
      bodyPattern: "rounded",
    };
    const expected = await canvasPixels(props);
    const { data } = await pixelsOf(await bytesOf(await getQRAsGIF(props)));
    expect(Buffer.compare(Buffer.from(data), Buffer.from(expected.data))).toBe(
      0
    );
  });

  it("reduces a gradient to a palette and the GIF still scans", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 400,
      level: "Q",
      bodyPattern: "rounded",
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#0f172a", offset: 100 },
        ],
      },
    };
    const { data, info } = await pixelsOf(
      await bytesOf(await getQRAsGIF(props))
    );
    const colors = new Set<number>();
    for (let at = 0; at < data.length; at += 4) {
      colors.add(
        ((data[at] as number) << 16) |
          ((data[at + 1] as number) << 8) |
          (data[at + 2] as number)
      );
    }
    expect(colors.size).toBeLessThanOrEqual(256);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      VALUE
    );
  });

  it("keeps a transparent background transparent", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 300,
      bgColor: "transparent",
      margin: 4,
    };
    const { data } = await pixelsOf(await bytesOf(await getQRAsGIF(props)));
    const alphas = new Set<number>();
    for (let at = 3; at < data.length; at += 4) {
      alphas.add(data[at] as number);
    }
    expect(data[3], "corner").toBe(0);
    // GIF has one transparent color: every pixel is clear or solid
    expect([...alphas].sort()).toEqual([0, 255]);
  });

  it("puts a frame in the image, as it does for the other formats", async () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const props: QRProps = { value: VALUE, size: 300, frame };
    const expected = await canvasPixels(props);
    const { info } = await pixelsOf(await bytesOf(await getQRAsGIF(props)));
    expect([info.width, info.height]).toEqual([
      expected.width,
      expected.height,
    ]);
    expect(info.height).toBeGreaterThan(info.width);
  });

  it("never hands out a PNG as a GIF: a browser that can't write PNG fails", async () => {
    const canvas = document.createElement("canvas");
    const prototype = Object.getPrototypeOf(canvas) as {
      getContext: () => null;
    };
    const saved = prototype.getContext;
    prototype.getContext = () => null;
    try {
      await expect(getQRAsGIF({ value: VALUE })).rejects.toThrow();
    } finally {
      prototype.getContext = saved;
    }
  });
});

describe("GIF downloads", () => {
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

  it("saves a .gif named after its pixel size that holds a GIF", async () => {
    await downloadQRCode(
      { value: VALUE },
      { format: "gif", size: { width: 400, height: 400 } }
    );
    expect(saved).toHaveLength(1);
    const [file] = saved;
    expect(file?.name).toBe("qr-code-400x400.gif");
    expect(file?.href.startsWith(`data:${GIF_MIME};base64,`)).toBe(true);
    const bytes = fromDataUrl(file?.href ?? "");
    expect(isGIFFile(bytes)).toBe(true);
    const { info } = await pixelsOf(bytes);
    expect([info.width, info.height]).toEqual([400, 400]);
  });

  it("names a framed GIF after the whole image, like the other formats", () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const name = getDownloadFilename("gif", { width: 400, height: 400 }, frame);
    expect(name).toMatch(/^qr-code-\d+x\d+\.gif$/);
    expect(name).not.toBe("qr-code-400x400.gif");
  });

  it("returns a GIF data URL from getQRCodeDataUrl, never a PNG", async () => {
    const url = await getQRCodeDataUrl({ value: VALUE }, "gif", {
      width: 128,
      height: 128,
    });
    expect(url.startsWith(`data:${GIF_MIME};base64,`)).toBe(true);
    const bytes = fromDataUrl(url);
    expect(bytes[0]).not.toBe(0x89); // a PNG starts with 0x89
    expect(isGIFFile(bytes)).toBe(true);
  });

  it("makes a GIF of a canvas, through getQRAsCanvas", async () => {
    const url = (await getQRAsCanvas(
      { value: VALUE, size: 128 },
      GIF_MIME
    )) as string;
    expect(url.startsWith(`data:${GIF_MIME};base64,`)).toBe(true);
    const bytes = fromDataUrl(url);
    expect(isGIFFile(bytes)).toBe(true);
    const { info } = await pixelsOf(bytes);
    expect([info.width, info.height]).toEqual([128, 128]);
  });

  it("refuses a size outside the download limits, like the other formats", async () => {
    await expect(
      downloadQRCode(
        { value: VALUE },
        { format: "gif", size: { width: 10, height: 10 } }
      )
    ).rejects.toThrow(/at least/);
    expect(saved).toHaveLength(0);
  });
});
