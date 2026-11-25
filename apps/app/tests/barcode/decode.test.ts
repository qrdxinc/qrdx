// Every barcode the generator draws must scan. Each format is rendered
// (lib/barcode/render.ts), rasterized from its SVG with sharp and decoded
// with the scanner's own reader: the `barcode-detector` ponyfill that
// components/scanner/detector.ts and the generator's scan check use (ZXing
// compiled to WebAssembly), loaded here from the local package instead of
// the CDN. The coupon block's own encoder (lib/landing/blocks/coupon-barcode.tsx)
// is decoded the same way.
//
// DotCode and USPS Intelligent Mail are skipped on purpose: neither this
// reader nor zbar decodes them, so the catalogue gives them no reader names
// and the generator's scan check says it can't check them. The last block
// here pins that: the reader finds nothing in them, and the check comes back
// "unchecked", never "fail". Their bars are checked another way: Intelligent
// Mail against USPS-B-3200's worked examples (intelligent-mail.test.ts),
// DotCode's dots against its grid (dotcode.test.ts).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BarcodeDetector,
  type BarcodeFormat as DetectorFormat,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import { drawingSVG, microqrcode } from "bwip-js/node";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { FORMAT_LABELS, SCAN_FORMATS } from "@/components/scanner/detector";
import { type DrawOptions, drawOptions } from "@/lib/barcode/draw";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  decodedMatches,
  getBarcodeFormat,
  isScanCheckable,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { type BarcodeStyle, renderBarcodeSVG } from "@/lib/barcode/render";
import { checkBarcodeScan, SCAN_CHECK_FORMATS } from "@/lib/barcode/scan-check";
import { Barcode as CouponBarcode } from "@/lib/landing/blocks/coupon-barcode";
import { MICRO_QR_CORNER_MISSES } from "../support/micro-qr-corner-misses";

// The ponyfill builds a DOMRectReadOnly for each result's bounding box; Node
// has none. Decoding doesn't touch it.
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

async function decodeSvg(svg: string, density = 72) {
  const png = await sharp(Buffer.from(svg), { density })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  return detector.detect(
    new Blob([new Uint8Array(png)], { type: "image/png" }),
  );
}

const BASE: BarcodeStyle = {
  foreground: "#000000",
  background: "#ffffff",
  showText: true,
  barHeightMm: 15,
  quietZone: 10,
  scale: 3,
};

/** Values beyond each format's example: long, short and edge cases. */
const EXTRA_VALUES: Partial<Record<BarcodeFormatId, string[]>> = {
  ean13: ["400638133393", "978030640615"],
  ean8: ["9638507"],
  upca: ["01234500005"],
  upce: ["654321", "01234558", "065100004327"],
  isbn: ["0-306-40615-2", "978-0-571-08989-5 52499", "979-10-90636-07-1 12"],
  issn: ["0378-5955", "0311-175X 99 12345", "9770317847001 05"],
  ismn: ["M-2306-7118-7", "979-0-099-12345-2 90000"],
  code128: ["12345678", "abc DEF 123 !#%", "QRDX 0042-ALPHA/beta"],
  code39: ["ABC-123 $/+%."],
  code93: ["ABC-123 $/+%.", "1234567890", "Q".repeat(40)],
  codabar: ["C12-$:/.+34D"],
  itf14: ["1001234567890"],
  "gs1-128": [
    "(00)10614141123456789",
    "(01)09501101530003(10)LOT-7(17)261231",
    "(01)09501101530003(3103)000123",
  ],
  "gs1-databar": ["(01)0950110153000", "(01)05901234123457"],
  "gs1-databar-expanded": [
    "(01)09501101530003(3103)000123",
    "(01)09501101530003(10)abc-def",
    // 66 digits: more than GS1-128 holds
    "(01)09501101530003(3103)000123(11)261231(13)261231(15)261231(17)261231(16)261231",
    // 49 characters with letters: the most that fits
    "(01)09501101530003(10)ABCDEFGHIJKLMNOPQRST(21)ABCDEFGHI",
  ],
  datamatrix: ["héllo ✓ 日本", "A".repeat(300)],
  pdf417: ["Line one\nLine two", "1234567890".repeat(20)],
  aztec: ["héllo ✓", "https://qrdx.dev/barcode-generator?x=1"],
  // Each of the four sizes, the most of each kind of text, accents, other
  // scripts and a line break, and the values drawn at another mask so
  // ZXing's detector finds them (the last block).
  microqr: [
    ...MICRO_QR_CORNER_MISSES,
    "12345",
    "123456",
    "PCB-0042",
    "héllo ✓",
    "日本語テキ",
    "line\ntwo",
    "9".repeat(35),
    "A".repeat(21),
    "x".repeat(15),
  ],
  // The smallest and largest sizes, and the most of each kind of text.
  rmqr: [
    "1",
    "héllo ✓ 日本",
    "https://qrdx.dev/c/AB12CD",
    "9".repeat(361),
    "A".repeat(219),
    "x".repeat(150),
  ],
  // Text (mode 4) at its limits, both carrier modes, a 5-digit ZIP Code
  // (padded) and the [)> header.
  maxicode: [
    "Caf\u00e9 cr\u00e8me 42",
    "1".repeat(138),
    "A".repeat(93),
    "15238<GS>840<GS>001<GS>X",
    "B1050<GS>056<GS>999<GS>CANADA PARCEL",
    "[)><RS>01<GS>96152382802<GS>840<GS>001<GS>1Z00004951<GS>UPSN<RS><EOT>",
  ],
};

/** Every format a reader here decodes: all but DotCode and Intelligent Mail. */
const CHECKED = BARCODE_FORMATS.filter((format) => isScanCheckable(format.id));
const UNCHECKED = BARCODE_FORMATS.filter(
  (format) => !isScanCheckable(format.id),
);

const cases = CHECKED.flatMap((format) =>
  [format.example, ...(EXTRA_VALUES[format.id] ?? [])].map(
    (raw) => [format.label, raw, format.id] as const,
  ),
);

describe("generated barcodes decode with the scanner's reader", () => {
  it.each(cases)("%s %j", async (_, raw, id) => {
    const checked = validateBarcodeInput(id, raw);
    if (!checked.ok) throw new Error(checked.error);
    const { svg } = renderBarcodeSVG(id, checked.value, BASE);
    const found = await decodeSvg(svg);
    const expected = getBarcodeFormat(id).detectorFormats as readonly string[];
    const match = found.find(
      (code) =>
        expected.includes(code.format) &&
        decodedMatches(id, checked.value, code.rawValue),
    );
    expect(
      match,
      `decoded ${JSON.stringify(found.map((code) => [code.format, code.rawValue]))}`,
    ).toBeDefined();
  });

  it.each(CHECKED.map((format) => [format.label, format.id] as const))(
    "%s with the options changed: no text, minimum quiet zone, dark blue on cream, small PNG",
    async (_, id) => {
      const format = getBarcodeFormat(id);
      const checked = validateBarcodeInput(id, format.example);
      if (!checked.ok) throw new Error(checked.error);
      const { svg } = renderBarcodeSVG(id, checked.value, {
        foreground: "#1e3a8a",
        background: "#fffbeb",
        showText: false,
        barHeightMm: 10,
        quietZone: format.quietZone.min,
        scale: 2,
      });
      const found = await decodeSvg(svg);
      expect(
        found.some((code) => decodedMatches(id, checked.value, code.rawValue)),
        `decoded ${JSON.stringify(found.map((code) => code.rawValue))}`,
      ).toBe(true);
    },
  );
});

describe("ISBN, ISSN and ISMN add-ons read back", () => {
  // The ponyfill reads the EAN-13 and skips add-ons, so these go to ZXing's
  // own reader with add-ons required: the add-on digits follow the EAN-13's.
  type Read = (
    input: Blob,
    options: { formats: string[]; eanAddOnSymbol: "Require" },
  ) => Promise<{ text: string }[]>;
  let read: Read;
  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const fromDetector = createRequire(
      require.resolve("barcode-detector/ponyfill"),
    );
    const reader = (await import(
      fromDetector.resolve("zxing-wasm/reader")
    )) as { readBarcodes: Read };
    read = reader.readBarcodes;
  });

  it.each([
    ["isbn", "978-1-873671-00-9 52250", "978187367100952250"],
    ["isbn", "0-306-40615-2 90000", "978030640615790000"],
    ["issn", "0317-8471 00 05", "977031784700105"],
    ["issn", "0311-175X 03 12345", "977031117503212345"],
    ["ismn", "979-0-3452-4680-5 12", "979034524680512"],
  ] as const)("%s %j", async (id, raw, expected) => {
    const checked = validateBarcodeInput(id, raw);
    if (!checked.ok) throw new Error(checked.error);
    for (const scale of [1, 2, 4]) {
      const { svg } = renderBarcodeSVG(id, checked.value, {
        ...BASE,
        quietZone: getBarcodeFormat(id).quietZone.default,
        scale,
      });
      const png = await sharp(Buffer.from(svg), { density: 72 })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      const found = await read(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
        { formats: ["EAN13"], eanAddOnSymbol: "Require" },
      );
      expect(
        found.map((code) => code.text),
        `scale ${scale}`,
      ).toEqual([expected]);
      expect(decodedMatches(id, checked.value, expected)).toBe(true);
    }
  });
});

describe("coupon block barcodes decode with the same reader", () => {
  it.each([
    ["ean13", "590123412345", "5901234123457", "ean_13"],
    ["code128", "SAVE20", "SAVE20", "code_128"],
    ["code128", "QRDX-2026-0042", "QRDX-2026-0042", "code_128"],
  ] as const)("%s %s", async (format, value, decoded, detected) => {
    const svg = renderToStaticMarkup(
      createElement(CouponBarcode, { format, value }),
    );
    const found = await decodeSvg(svg, 72 * 4);
    expect(
      found.map((code) => [code.format, code.rawValue] as const),
    ).toContainEqual([detected, decoded]);
  });
});

describe("/scan reads every format the generator draws", () => {
  // The scanner page asks its reader for SCAN_FORMATS only, so a format left
  // out there scans in the generator's check but not on /scan.
  let scanner: BarcodeDetector;
  beforeAll(() => {
    scanner = new BarcodeDetector({
      formats: [...SCAN_FORMATS] as DetectorFormat[],
    });
  });

  it.each(CHECKED.map((format) => [format.label, format.id] as const))(
    "%s",
    async (_, id) => {
      const format = getBarcodeFormat(id);
      const checked = validateBarcodeInput(id, format.example);
      if (!checked.ok) throw new Error(checked.error);
      const { svg } = renderBarcodeSVG(id, checked.value, BASE);
      const png = await sharp(Buffer.from(svg), { density: 72 })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      const found = await scanner.detect(
        new Blob([new Uint8Array(png)], { type: "image/png" }),
      );
      const reported = found.map((code) => [code.format, code.rawValue]);
      // One code in the image, one result: no stray reads from the extra
      // 1D readers (Codabar and ITF are the ones prone to them).
      expect(found, `decoded ${JSON.stringify(reported)}`).toHaveLength(1);
      const [code] = found;
      expect(format.detectorFormats).toContain(code?.format);
      expect(decodedMatches(id, checked.value, code?.rawValue ?? "")).toBe(
        true,
      );
      expect(FORMAT_LABELS[code?.format ?? ""]).toBeDefined();
    },
  );
});

describe("SCAN_CHECK_FORMATS", () => {
  it("covers every format's reader names", () => {
    for (const format of BARCODE_FORMATS) {
      for (const name of format.detectorFormats) {
        expect(SCAN_CHECK_FORMATS).toContain(name as DetectorFormat);
      }
    }
  });
});

describe("formats no reader here decodes", () => {
  // The exception above, pinned: if a reader update starts decoding one of
  // these, the first test fails and the format can get its scan check.
  const all = [...SCAN_CHECK_FORMATS, ...SCAN_FORMATS] as DetectorFormat[];
  let everything: BarcodeDetector;
  beforeAll(() => {
    everything = new BarcodeDetector({ formats: [...new Set(all)] });
  });

  it("are exactly DotCode and USPS Intelligent Mail", () => {
    expect(UNCHECKED.map((format) => format.label)).toEqual([
      "USPS Intelligent Mail",
      "DotCode",
    ]);
  });

  it.each(UNCHECKED.map((format) => [format.label, format.id] as const))(
    "%s: the reader finds nothing, and the scan check says unchecked",
    async (_, id) => {
      const checked = validateBarcodeInput(id, getBarcodeFormat(id).example);
      if (!checked.ok) throw new Error(checked.error);
      const { svg } = renderBarcodeSVG(id, checked.value, BASE);
      const png = await sharp(Buffer.from(svg), { density: 72 })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      const image = new Blob([new Uint8Array(png)], { type: "image/png" });
      expect(await everything.detect(image)).toEqual([]);
      // Not "fail": the generator shows "not scan-checked" and still offers
      // every download and Save.
      expect(await checkBarcodeScan(image, id, checked.value)).toEqual({
        status: "unchecked",
      });
    },
  );
});

describe("Micro QR codes ZXing's detector missed at bwip-js's mask", () => {
  // drawMicroQr (lib/barcode/draw.ts) draws these at another mask, because
  // at bwip-js's own the bottom row or the right column ends in 6 light
  // modules and ZXing's detector lays its grid wrong (micro-qr.ts,
  // microQrCornerShows). The first test pins that miss: if a reader update
  // starts finding them, it fails, and the mask choice can go.
  const png = (svg: string) =>
    sharp(Buffer.from(svg), { density: 72 })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
  const blob = (bytes: Buffer) =>
    new Blob([new Uint8Array(bytes)], { type: "image/png" });
  const style = (rotation: 0 | 90 | 180 | 270 = 0): BarcodeStyle => ({
    ...BASE,
    quietZone: getBarcodeFormat("microqr").quietZone.default,
    scale: 4,
    rotation,
  });

  it.each(MICRO_QR_CORNER_MISSES)(
    "%j: bwip-js's own mask isn't found by the reader",
    async (text) => {
      const own = microqrcode(
        drawOptions("microqr", text, style()) as DrawOptions,
        drawingSVG(),
      );
      expect(await detector.detect(blob(await png(own)))).toEqual([]);
    },
  );

  it.each(MICRO_QR_CORNER_MISSES)(
    "%j: the generator's drawing passes the scan check, turned any way and at the smallest quiet zone",
    async (text) => {
      for (const rotation of [0, 90, 180, 270] as const) {
        const { svg } = renderBarcodeSVG("microqr", text, style(rotation));
        expect(
          await checkBarcodeScan(blob(await png(svg)), "microqr", text),
          `rotation ${rotation}`,
        ).toEqual({ status: "pass", decoded: text });
      }
      const { svg } = renderBarcodeSVG("microqr", text, {
        ...style(),
        quietZone: getBarcodeFormat("microqr").quietZone.min,
      });
      expect(
        await checkBarcodeScan(blob(await png(svg)), "microqr", text),
      ).toMatchObject({ status: "pass" });
    },
  );

  it("still fails a wrong value or a broken image", async () => {
    const { svg, width, height } = renderBarcodeSVG("microqr", "R", style());
    const image = await png(svg);
    expect(await checkBarcodeScan(blob(image), "microqr", "S")).toEqual({
      status: "mismatch",
      decoded: "R",
      format: "micro_qr_code",
    });
    // The lower half painted over.
    const broken = await sharp(image)
      .composite([
        {
          input: {
            create: {
              width,
              height: Math.ceil(height / 2),
              channels: 3,
              background: "#ffffff",
            },
          },
          top: Math.floor(height / 2),
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    expect(await checkBarcodeScan(blob(broken), "microqr", "R")).toEqual({
      status: "fail",
    });
  });
});
