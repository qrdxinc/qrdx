// The server draws barcodes with bwip-js's Node build (lib/barcode/server.ts)
// and the generator with its browser build (lib/barcode/render.ts). Both get
// their options from lib/barcode/draw.ts, so for every format and option the
// SVG must be the same string, and the server's raster files must be the
// generator's PNG size, pixel for pixel, and decode as the same value. A BMP
// is the PNG's pixels in a 24-bit bitmap, read back here with an independent
// reader (sharp can't read BMP).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BarcodeDetector,
  type BarcodeFormat as DetectorFormat,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import { isBMPFile } from "qrdx";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  decodedMatches,
  getBarcodeFormat,
  isScanCheckable,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { renderBarcodeSVG } from "@/lib/barcode/render";
import { SCAN_CHECK_FORMATS } from "@/lib/barcode/scan-check";
import {
  rasterBarcode,
  renderBarcodeFile,
  renderBarcodeServer,
} from "@/lib/barcode/server";
import { type BarcodeStyle, defaultBarcodeStyle } from "@/lib/barcode/style";
import { readBMP } from "../../../../packages/qrdx/tests/support/bmp";
import { MICRO_QR_CORNER_MISSES } from "../support/micro-qr-corner-misses";

(globalThis as { DOMRectReadOnly?: unknown }).DOMRectReadOnly ??= class {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
};

let detector: BarcodeDetector;

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
  detector = new BarcodeDetector({ formats: SCAN_CHECK_FORMATS });
});

const value = (id: BarcodeFormatId) => {
  const checked = validateBarcodeInput(id, getBarcodeFormat(id).example);
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
};

/** Each format with its defaults, and with every option changed. */
const variants = (id: BarcodeFormatId): [string, BarcodeStyle][] => {
  const base = defaultBarcodeStyle(id);
  return [
    ["defaults", base],
    [
      "changed",
      {
        foreground: "#1e3a8a",
        background: "#fffbeb",
        showText: false,
        barHeightMm: 10,
        quietZone: getBarcodeFormat(id).quietZone.min,
        scale: 2,
        rotation: 90,
      },
    ],
    ["upside down", { ...base, rotation: 180, scale: 3 }],
    ["turned left", { ...base, rotation: 270 }],
  ];
};

const cases = BARCODE_FORMATS.flatMap((format) =>
  variants(format.id).map(
    ([name, style]) => [format.label, name, format.id, style] as const,
  ),
);

describe("browser and server draw the same SVG", () => {
  it.each(cases)("%s, %s", (_, __, id, style) => {
    const browser = renderBarcodeSVG(id, value(id), style);
    const server = renderBarcodeServer(id, value(id), style);
    expect(server.svg).toBe(browser.svg);
    expect([server.width, server.height]).toEqual([
      browser.width,
      browser.height,
    ]);
  });

  it("pick the same Micro QR mask where bwip-js's own would be missed", () => {
    // drawMicroQr reads each build's own SVG to choose (lib/barcode/draw.ts).
    for (const text of MICRO_QR_CORNER_MISSES) {
      for (const [name, style] of variants("microqr")) {
        expect(
          renderBarcodeServer("microqr", text, style).svg,
          `${text}, ${name}`,
        ).toBe(renderBarcodeSVG("microqr", text, style).svg);
      }
    }
  });

  it("rotation turns the drawing a quarter or half", () => {
    const style = defaultBarcodeStyle("code128");
    const upright = renderBarcodeServer("code128", "QRDX", style);
    const turned = renderBarcodeServer("code128", "QRDX", {
      ...style,
      rotation: 90,
    });
    expect([turned.width, turned.height]).toEqual([
      upright.height,
      upright.width,
    ]);
  });
});

/**
 * Formats a reader here decodes. DotCode and Intelligent Mail aren't among
 * them (tests/barcode/decode.test.ts), so their files are compared pixel for
 * pixel and drawn as vectors below, but not decoded.
 */
const DECODABLE = BARCODE_FORMATS.filter((format) =>
  isScanCheckable(format.id),
);

/** `found` holds the value drawn, in one of the format's reader formats. */
const expectDecodes = async (
  id: BarcodeFormatId,
  found: Awaited<ReturnType<BarcodeDetector["detect"]>>,
) => {
  const expected = getBarcodeFormat(id).detectorFormats as readonly string[];
  expect(
    found.some(
      (code) =>
        expected.includes(code.format as DetectorFormat) &&
        decodedMatches(id, value(id), code.rawValue),
    ),
    `decoded ${JSON.stringify(found.map((code) => [code.format, code.rawValue]))}`,
  ).toBe(true);
};

async function decode(bytes: Uint8Array) {
  // ZXing reads PNG; JPG, WebP and AVIF are decoded to PNG with sharp first.
  const png = await sharp(bytes).png().toBuffer();
  return detector.detect(
    new Blob([new Uint8Array(png)], { type: "image/png" }),
  );
}

describe("server raster files are the generator's PNG", () => {
  it.each(BARCODE_FORMATS.map((format) => [format.label, format.id] as const))(
    "%s: the browser SVG and the server PNG have the same pixels",
    async (_, id) => {
      const style = defaultBarcodeStyle(id);
      const browser = renderBarcodeSVG(id, value(id), style);
      const file = await renderBarcodeFile(id, value(id), style, "png");
      const server = await sharp(file.body as Uint8Array)
        .raw()
        .toBuffer({ resolveWithObject: true });
      // The browser's SVG rasterized the same way: identical SVG, identical pixels.
      const reference = await sharp(Buffer.from(browser.svg), { density: 72 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([server.info.width, server.info.height]).toEqual([
        browser.width,
        browser.height,
      ]);
      expect(server.data.equals(reference.data)).toBe(true);
    },
  );

  it.each(
    DECODABLE.flatMap((format) =>
      (["png", "jpg", "webp", "avif"] as const).map(
        (type) => [format.label, type, format.id] as const,
      ),
    ),
  )("%s as %s decodes as the value drawn", async (_, type, id) => {
    const style = defaultBarcodeStyle(id);
    const file = await renderBarcodeFile(id, value(id), style, type);
    const meta = await sharp(file.body as Uint8Array).metadata();
    expect(meta.format).toBe(
      type === "jpg" ? "jpeg" : type === "avif" ? "heif" : type,
    );
    await expectDecodes(id, await decode(file.body as Uint8Array));
  });
});

/** RGBA pixels, as a PNG the decoder reads. */
const rgbaToPng = (rgba: Uint8ClampedArray, width: number, height: number) =>
  sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

describe("server BMP files are the PNG's pixels", () => {
  it.each(cases)("%s, %s", async (_, __, id, style) => {
    const [bmp, png] = await Promise.all([
      renderBarcodeFile(id, value(id), style, "bmp"),
      renderBarcodeFile(id, value(id), style, "png"),
    ]);
    expect(bmp.contentType).toBe("image/bmp");
    expect(bmp.extension).toBe("bmp");
    expect([bmp.width, bmp.height]).toEqual([png.width, png.height]);
    const bytes = bmp.body as Uint8Array;
    // A real BMP, never a PNG under another name.
    expect(isBMPFile(bytes)).toBe(true);
    expect(isBMPFile(png.body as Uint8Array)).toBe(false);
    const decoded = readBMP(bytes);
    const pixels = await sharp(png.body as Uint8Array)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([decoded.width, decoded.height]).toEqual([
      pixels.info.width,
      pixels.info.height,
    ]);
    // Every pixel, the background's color included (the PNG is opaque).
    expect(Buffer.from(decoded.rgba).equals(pixels.data)).toBe(true);
  });

  it.each(DECODABLE.map((format) => [format.label, format.id] as const))(
    "%s as BMP decodes as the value drawn",
    async (_, id) => {
      const file = await renderBarcodeFile(
        id,
        value(id),
        defaultBarcodeStyle(id),
        "bmp",
      );
      const { rgba, width, height } = readBMP(file.body as Uint8Array);
      const png = await rgbaToPng(rgba, width, height);
      await expectDecodes(
        id,
        await detector.detect(
          new Blob([new Uint8Array(png)], { type: "image/png" }),
        ),
      );
    },
  );

  it("lays a transparent background over white, since 24-bit BMP has no alpha", async () => {
    // Barcodes are drawn on a solid background today; without its rectangle
    // the drawing is see-through around the bars, as a transparent one would be.
    const id = "ean13";
    const style = { ...defaultBarcodeStyle(id), foreground: "#1e3a8a" };
    const { svg } = renderBarcodeServer(id, value(id), style);
    const seeThrough = svg.replace(
      /<rect width="100%" height="100%" fill="#[0-9a-f]{6}" \/>/,
      "",
    );
    expect(seeThrough).not.toBe(svg);
    const [png, bmp] = await Promise.all([
      rasterBarcode({ svg: seeThrough }, "png"),
      rasterBarcode({ svg: seeThrough }, "bmp"),
    ]);
    expect(isBMPFile(bmp)).toBe(true);
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphas = new Set<number>();
    for (let i = 3; i < data.length; i += 4) alphas.add(data[i] as number);
    // The PNG has transparent pixels (and opaque bars).
    expect(alphas.has(0)).toBe(true);
    expect(alphas.has(255)).toBe(true);

    const decoded = readBMP(bmp);
    expect([decoded.width, decoded.height]).toEqual([info.width, info.height]);
    // The top-left corner is in the quiet zone: transparent in the PNG,
    // white in the BMP.
    expect(data[3]).toBe(0);
    expect([...decoded.rgba.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    // Every pixel is the PNG's laid over white: opaque ones unchanged.
    const overWhite = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] as number;
      for (let c = 0; c < 3; c++) {
        overWhite[i + c] = Math.floor(
          ((data[i + c] as number) * alpha + 255 * (255 - alpha) + 127) / 255,
        );
      }
      overWhite[i + 3] = 255;
    }
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(overWhite))).toBe(true);
    // And it still scans.
    const scanned = await rgbaToPng(
      decoded.rgba,
      decoded.width,
      decoded.height,
    );
    await expectDecodes(
      id,
      await detector.detect(
        new Blob([new Uint8Array(scanned)], { type: "image/png" }),
      ),
    );
  });
});

describe("server vector files", () => {
  it.each(BARCODE_FORMATS.map((format) => [format.label, format.id] as const))(
    "%s as SVG, PDF and EPS",
    async (_, id) => {
      const style = defaultBarcodeStyle(id);
      const rendered = renderBarcodeServer(id, value(id), style);

      const svg = await renderBarcodeFile(id, value(id), style, "svg");
      expect(svg.body).toMatch(/^<svg width="[\d.]+mm" height="[\d.]+mm"/);

      const pdf = await renderBarcodeFile(id, value(id), style, "pdf");
      const text = Buffer.from(pdf.body as Uint8Array).toString("latin1");
      expect(text.startsWith("%PDF-1.4")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
      const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
      expect(Number(box?.[1])).toBeCloseTo(rendered.widthUnits, 2);
      expect(Number(box?.[2])).toBeCloseTo(rendered.heightUnits, 2);
      // The cross-reference table points at each object.
      const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
      expect(text.slice(startxref, startxref + 4)).toBe("xref");
      for (const match of text
        .slice(startxref)
        .matchAll(/^(\d{10}) 00000 n $/gm)) {
        const offset = Number(match[1]);
        expect(text.slice(offset).match(/^\d+ 0 obj/)).not.toBeNull();
      }

      const eps = await renderBarcodeFile(id, value(id), style, "eps");
      expect(String(eps.body)).toMatch(/^%!PS-Adobe-3\.0 EPSF-3\.0/);
    },
  );

  it("refuses a raster too large to make", async () => {
    await expect(
      renderBarcodeFile(
        "pdf417",
        "x".repeat(900),
        {
          ...defaultBarcodeStyle("pdf417"),
          scale: 10,
          rotation: 0,
        },
        "png",
      ),
    ).resolves.toBeDefined();
    await expect(
      renderBarcodeFile(
        "code128",
        "A".repeat(80),
        {
          ...defaultBarcodeStyle("code128"),
          scale: 10,
        },
        "png",
      ),
    ).rejects.toThrow(/over the 6,000 px limit/);
  });
});
