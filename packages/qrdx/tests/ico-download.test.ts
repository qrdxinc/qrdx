/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// ICO downloads on the fake DOM (tests/support): no browser encodes ICO from a
// canvas (toBlob("image/x-icon") returns a PNG), so the file is made from a PNG
// of the code at each size and the built-in ICO writer. It is a real ICO with
// the code at 16, 32, 48 and 256 px, a transparent background stays
// transparent, a frame is left out, and the biggest size scans.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadQRCode,
  getDownloadFilename,
  getQRAsICO,
  getQRCodeDataUrl,
} from "../src/download";
import { getQRAsCanvas } from "../src/export";
import { getFrameDimensions } from "../src/frame";
import { ICO_MIME, ICO_SIZES } from "../src/ico";
import { isICOFile } from "../src/utils/ico";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { readICO } from "./support/ico";
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
let toDataURL: (canvas: CanvasLike) => string = () => "";

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
  toDataURL = browserPng;
  const canvas = document.createElement("canvas");
  const prototype = Object.getPrototypeOf(canvas) as {
    toDataURL: (this: CanvasLike) => string;
  };
  prototype.toDataURL = function toDataURLOfCanvas(this: CanvasLike) {
    return toDataURL(this);
  };
});

afterEach(() => {
  uninstall();
});

const VALUE = "https://qrdx.dev/ico";

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const fromDataUrl = (url: string) =>
  new Uint8Array(Buffer.from(url.split(",")[1] ?? "", "base64"));

async function pixelsOf(png: Uint8Array) {
  const { data, info } = await sharp(Buffer.from(png))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), info };
}

describe("getQRAsICO", () => {
  it("is an ICO holding the code at 16, 32, 48 and 256 px", async () => {
    const blob = await getQRAsICO({ value: VALUE });
    expect(blob.type).toBe(ICO_MIME);
    const bytes = await bytesOf(blob);
    expect(isICOFile(bytes)).toBe(true);
    const entries = readICO(bytes);
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual(
      ICO_SIZES.map((size) => [size, size])
    );
    for (const entry of entries) {
      expect(entry.planes).toBe(1);
      expect(entry.bitCount).toBe(32);
      const { info } = await pixelsOf(entry.png);
      expect([info.width, info.height]).toEqual([entry.width, entry.height]);
    }
  });

  it("scans at 256 px, and every size has both dark and light modules", async () => {
    const entries = readICO(await bytesOf(await getQRAsICO({ value: VALUE })));
    const large = entries.at(-1);
    const { data, info } = await pixelsOf(large?.png as Uint8Array);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      VALUE
    );
    for (const entry of entries) {
      const pixels = (await pixelsOf(entry.png)).data;
      const lumas = new Set<boolean>();
      for (let index = 0; index < pixels.length; index += 4) {
        lumas.add(((pixels[index] as number) ?? 0) < 128);
      }
      expect(lumas.size, `${entry.width} px`).toBe(2);
    }
  });

  it("holds each size as the canvas draws it, pixel for pixel", async () => {
    const entries = readICO(await bytesOf(await getQRAsICO({ value: VALUE })));
    for (const entry of entries) {
      const canvas = (await getQRAsCanvas(
        { value: VALUE, size: entry.width },
        "image/png",
        true
      )) as unknown as CanvasLike;
      const { data } = canvas
        .getContext("2d")
        .getImageData(0, 0, entry.width, entry.height);
      const decoded = await pixelsOf(entry.png);
      expect(
        Buffer.compare(Buffer.from(decoded.data), Buffer.from(data)),
        `${entry.width} px`
      ).toBe(0);
    }
  });

  it("keeps a transparent background transparent", async () => {
    const entries = readICO(
      await bytesOf(
        await getQRAsICO({ value: VALUE, bgColor: "transparent", margin: 4 })
      )
    );
    for (const entry of entries) {
      const { data } = await pixelsOf(entry.png);
      const alphas = new Set<number>();
      for (let index = 3; index < data.length; index += 4) {
        alphas.add(data[index] as number);
      }
      expect(data[3], `${entry.width} px corner`).toBe(0);
      // The modules are there at every size...
      expect(Math.max(...alphas), `${entry.width} px modules`).toBeGreaterThan(
        0
      );
      // ...and solid from 32 px up. At 16 px a module is smaller than a pixel,
      // so every pixel of the code is antialiased: the small sizes are for
      // icons, not for scanning.
      if (entry.width >= 32) {
        expect(alphas.has(255), `${entry.width} px solid`).toBe(true);
      }
    }
  });

  it("leaves a frame out, so every image stays square", async () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    // With the frame, the 256 px code's canvas would be taller than 256.
    expect(getFrameDimensions(256, frame).height).toBeGreaterThan(256);
    const entries = readICO(
      await bytesOf(await getQRAsICO({ value: VALUE, size: 300, frame }))
    );
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual(
      ICO_SIZES.map((size) => [size, size])
    );
  });

  it("takes the sizes it is given, up to 256", async () => {
    const entries = readICO(
      await bytesOf(await getQRAsICO({ value: VALUE }, [24, 64]))
    );
    expect(entries.map((entry) => entry.width)).toEqual([24, 64]);
    await expect(getQRAsICO({ value: VALUE }, [300])).rejects.toThrow(
      RangeError
    );
  });

  it("never hands out a PNG as an ICO: a browser that can't write PNG fails", async () => {
    toDataURL = () => "data:image/jpeg;base64,AAAA";
    await expect(getQRAsICO({ value: VALUE })).rejects.toThrow(
      /can't write a PNG/
    );
  });
});

describe("ICO downloads", () => {
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

  it("saves a .ico with no pixel size in its name that holds an ICO", async () => {
    await downloadQRCode(
      { value: VALUE },
      { format: "ico", size: { width: 400, height: 400 } }
    );
    expect(saved).toHaveLength(1);
    const [file] = saved;
    expect(file?.name).toBe("qr-code.ico");
    expect(file?.href.startsWith(`data:${ICO_MIME};base64,`)).toBe(true);
    const bytes = fromDataUrl(file?.href ?? "");
    expect(isICOFile(bytes)).toBe(true);
    expect(readICO(bytes)).toHaveLength(ICO_SIZES.length);
  });

  it("names it the same with a frame or a different size", () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    expect(getDownloadFilename("ico", { width: 400, height: 400 }, frame)).toBe(
      "qr-code.ico"
    );
    expect(getDownloadFilename("ico", { width: 2000, height: 2000 })).toBe(
      "qr-code.ico"
    );
  });

  it("returns an ICO data URL from getQRCodeDataUrl, never a PNG", async () => {
    const url = await getQRCodeDataUrl({ value: VALUE }, "ico", {
      width: 128,
      height: 128,
    });
    expect(url.startsWith(`data:${ICO_MIME};base64,`)).toBe(true);
    const bytes = fromDataUrl(url);
    expect(bytes[0]).not.toBe(0x89); // a PNG starts with 0x89
    expect(isICOFile(bytes)).toBe(true);
  });

  it("makes a one-image ICO of a canvas, through getQRAsCanvas", async () => {
    const props: QRProps = { value: VALUE };
    const url = (await getQRAsCanvas(
      { ...props, size: 128 },
      ICO_MIME
    )) as string;
    expect(url.startsWith(`data:${ICO_MIME};base64,`)).toBe(true);
    const entries = readICO(fromDataUrl(url));
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual([
      [128, 128],
    ]);
    // Bigger than an ICO can hold: it fails, it isn't a PNG in disguise.
    await expect(
      getQRAsCanvas({ ...props, size: 300 }, "image/x-icon")
    ).rejects.toThrow(/ICO images/);
  });

  it("refuses a size outside the download limits, like the other formats", async () => {
    await expect(
      downloadQRCode(
        { value: VALUE },
        { format: "ico", size: { width: 10, height: 10 } }
      )
    ).rejects.toThrow(/at least/);
    expect(saved).toHaveLength(0);
  });

  it("saves nothing when the browser can't write the PNGs", async () => {
    toDataURL = () => "data:,";
    await expect(
      downloadQRCode(
        { value: VALUE },
        { format: "ico", size: { width: 400, height: 400 } }
      )
    ).rejects.toThrow(/can't write a PNG/);
    expect(saved).toHaveLength(0);
  });
});
