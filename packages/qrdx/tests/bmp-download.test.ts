/** biome-ignore-all lint/style/noMagicNumbers: sizes and pixel values */
// BMP downloads on the fake DOM (tests/support): no browser encodes BMP from a
// canvas (toBlob("image/bmp") returns a PNG), so the file always comes from
// the built-in encoder. It is a real BMP at the canvas size, a transparent
// background comes out white, and it scans.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canvasToBMP } from "../src/bmp";
import {
  downloadQRCode,
  getDownloadFilename,
  getQRAsBMP,
  getQRCodeDataUrl,
} from "../src/download";
import { getQRAsCanvas } from "../src/export";
import { getFrameDimensions } from "../src/frame";
import { isBMPFile } from "../src/utils/bmp";
import type { QRProps } from "../types";
import { readBMP } from "./support/bmp";
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

const VALUE = "https://qrdx.dev/bmp";

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const fromDataUrl = (url: string) =>
  new Uint8Array(Buffer.from(url.split(",")[1] ?? "", "base64"));

describe("getQRAsBMP", () => {
  it("is a 24-bit BMP of the canvas's size that scans", async () => {
    const blob = await getQRAsBMP({ value: VALUE, size: 320 });
    expect(blob.type).toBe("image/bmp");
    const bytes = await bytesOf(blob);
    expect(isBMPFile(bytes)).toBe(true);
    const { width, height, rgba } = readBMP(bytes);
    expect([width, height]).toEqual([320, 320]);
    expect(decodeQR({ data: rgba, width, height })).toBe(VALUE);
  });

  it("is pixel for pixel the canvas, for an opaque background", async () => {
    const canvas = (await getQRAsCanvas(
      { value: VALUE, size: 200 },
      "image/png",
      true
    )) as unknown as CanvasLike;
    const { data } = canvas.getContext("2d").getImageData(0, 0, 200, 200);
    const decoded = readBMP(
      await bytesOf(canvasToBMP(canvas as unknown as HTMLCanvasElement))
    );
    expect(Buffer.compare(Buffer.from(decoded.rgba), Buffer.from(data))).toBe(
      0
    );
  });

  it("comes out white where the background is transparent, and still scans", async () => {
    const blob = await getQRAsBMP({
      value: VALUE,
      size: 240,
      bgColor: "transparent",
      margin: 4,
    });
    const { width, height, rgba } = readBMP(await bytesOf(blob));
    // The quiet zone's corners are white, not black
    expect([...rgba.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...rgba.subarray((width * height - 1) * 4)]).toEqual([
      255, 255, 255, 255,
    ]);
    expect(decodeQR({ data: rgba, width, height })).toBe(VALUE);
  });

  it("includes a frame in its size", async () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const blob = await getQRAsBMP({ value: VALUE, size: 300, frame });
    const { width, height } = readBMP(await bytesOf(blob));
    const expected = getFrameDimensions(300, frame);
    expect([width, height]).toEqual([
      Math.round(expected.width),
      Math.round(expected.height),
    ]);
  });

  it("says so when the canvas has no 2d context", () => {
    const canvas = {
      width: 4,
      height: 4,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(() => canvasToBMP(canvas)).toThrow(/canvas context/);
  });
});

describe("BMP downloads", () => {
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

  it("saves a .bmp named after its pixel size that holds a BMP", async () => {
    await downloadQRCode(
      { value: VALUE },
      { format: "bmp", size: { width: 400, height: 400 } }
    );
    expect(saved).toHaveLength(1);
    const [file] = saved;
    expect(file?.name).toBe("qr-code-400x400.bmp");
    expect(file?.href.startsWith("data:image/bmp;base64,")).toBe(true);
    const bytes = fromDataUrl(file?.href ?? "");
    expect(isBMPFile(bytes)).toBe(true);
    const { width, height } = readBMP(bytes);
    expect([width, height]).toEqual([400, 400]);
  });

  it("names a framed BMP after its canvas", () => {
    const frame = { style: "banner-bottom", text: "Scan me" } as const;
    const { width, height } = getFrameDimensions(400, frame);
    expect(getDownloadFilename("bmp", { width: 400, height: 400 }, frame)).toBe(
      `qr-code-${Math.round(width)}x${Math.round(height)}.bmp`
    );
  });

  it("returns BMP data URLs, through getQRCodeDataUrl and getQRAsCanvas, never a PNG", async () => {
    const props: QRProps = { value: VALUE };
    const urls = [
      await getQRCodeDataUrl(props, "bmp", { width: 128, height: 128 }),
      (await getQRAsCanvas({ ...props, size: 128 }, "image/bmp")) as string,
    ];
    for (const url of urls) {
      expect(url.startsWith("data:image/bmp;base64,")).toBe(true);
      const bytes = fromDataUrl(url);
      expect(bytes[0]).not.toBe(0x89); // a PNG starts with 0x89
      expect(isBMPFile(bytes)).toBe(true);
    }
  });

  it("refuses a size outside the download limits, like the other formats", async () => {
    await expect(
      downloadQRCode(
        { value: VALUE },
        { format: "bmp", size: { width: 10, height: 10 } }
      )
    ).rejects.toThrow(/at least/);
    expect(saved).toHaveLength(0);
  });
});
