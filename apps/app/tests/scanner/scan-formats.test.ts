// Formats /scan reads beyond the common ones (Micro QR, rMQR, GS1 DataBar
// Limited and Stacked, MaxiCode) and GS1 DataBar: an image of
// each, drawn by bwip-js, decodes with the scanner's WebAssembly reader (the
// `barcode-detector` ponyfill, loaded from the local package as in
// tests/barcode/decode.test.ts) and parses through the scanner's parser.
// The reader is asked for what components/scanner/detector.ts asks it for:
// every format where the browser has no reader of its own, and the formats
// Chrome's own reader lacks where it has one.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BarcodeDetector,
  type BarcodeFormat as DetectorFormat,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import { toBuffer } from "bwip-js/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FORMAT_LABELS,
  missingFormats,
  SCAN_FORMATS,
} from "@/components/scanner/detector";
import {
  type ParsedScan,
  parseScan,
  showControlCharacters,
} from "@/components/scanner/parse";

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

/** What Chrome's own BarcodeDetector listed on macOS (Chrome 157, headless). */
const CHROME_NATIVE = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_e",
];

const RS = "\u001e";
const GS = "\u001d";
const EOT = "\u0004";

let everything: BarcodeDetector;
let fallback: BarcodeDetector;

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
  everything = new BarcodeDetector({
    formats: [...SCAN_FORMATS] as DetectorFormat[],
  });
  fallback = new BarcodeDetector({
    formats: missingFormats(CHROME_NATIVE) as DetectorFormat[],
  });
});

/** bwip-js's PNG: transparent unless given a background, so white it is. */
function draw(bcid: string, text: string, options: Record<string, unknown>) {
  return toBuffer({
    bcid,
    text,
    scale: 3,
    padding: 10,
    backgroundcolor: "FFFFFF",
    ...options,
  });
}

const kind = <K extends ParsedScan["kind"]>(
  parsed: ParsedScan,
  expected: K,
) => {
  expect(parsed.kind).toBe(expected);
  return parsed as Extract<ParsedScan, { kind: K }>;
};

// A MaxiCode mode 2 carrier message: [)> RS 01 GS 96 postcode GS country GS
// service class GS tracking number GS carrier ... RS EOT. bwip-js's `parse`
// turns ^030 and ^029 into RS and GS.
const MAXI_US = [
  "[)>^03001^02996152382802^029840^029001^0291Z00004951^029UPSN",
  "^02906X610^029159^0291234567^0291/1^029^029Y^029634 ALPHA DR",
  "^029PITTSBURGH^029PA^030^004",
].join("");
const MAXI_US_DECODED = `[)>${RS}01${GS}96152382802${GS}840${GS}001${GS}1Z00004951${GS}UPSN${GS}06X610${GS}159${GS}1234567${GS}1/1${GS}${GS}Y${GS}634 ALPHA DR${GS}PITTSBURGH${GS}PA${RS}${EOT}`;
// Mode 3: a postcode of up to 6 letters and digits, here Canada's.
const MAXI_CA =
  "[)>^03001^02996K1A0B1^029124^029001^0291Z00004952^029UPSN^030^004";
const MAXI_CA_DECODED = `[)>${RS}01${GS}96K1A0B1${GS}124${GS}001${GS}1Z00004952${GS}UPSN${RS}${EOT}`;

const cases: {
  name: string;
  bcid: string;
  text: string;
  options?: Record<string, unknown>;
  format: string;
  decoded: string;
  check: (parsed: ParsedScan) => void;
}[] = [
  {
    name: "Micro QR",
    bcid: "microqrcode",
    text: "QRDX 12345",
    format: "micro_qr_code",
    decoded: "QRDX 12345",
    check: (parsed) => expect(kind(parsed, "text").text).toBe("QRDX 12345"),
  },
  {
    name: "rMQR R11x43",
    bcid: "rectangularmicroqrcode",
    text: "QRDX rMQR 1",
    options: { version: "R11x43" },
    format: "rm_qr_code",
    decoded: "QRDX rMQR 1",
    check: (parsed) => expect(kind(parsed, "text").text).toBe("QRDX rMQR 1"),
  },
  {
    name: "rMQR R13x77 link",
    bcid: "rectangularmicroqrcode",
    text: "https://qrdx.dev/scan",
    options: { version: "R13x77" },
    format: "rm_qr_code",
    decoded: "https://qrdx.dev/scan",
    check: (parsed) =>
      expect(kind(parsed, "url").url).toBe("https://qrdx.dev/scan"),
  },
  {
    name: "GS1 DataBar",
    bcid: "databaromni",
    text: "(01)09521234543213",
    format: "databar_omni",
    decoded: "0109521234543213",
    check: (parsed) => {
      const { data } = kind(parsed, "gs1");
      expect(data.gtin).toBe("09521234543213");
      expect(data.fields).toEqual([{ label: "GTIN", value: "09521234543213" }]);
    },
  },
  {
    name: "GS1 DataBar Limited",
    bcid: "databarlimited",
    text: "(01)01234567890128",
    format: "databar_limited",
    decoded: "0101234567890128",
    check: (parsed) =>
      expect(kind(parsed, "gs1").data.gtin).toBe("01234567890128"),
  },
  {
    name: "GS1 DataBar Stacked",
    bcid: "databarstackedomni",
    text: "(01)09521234543213",
    format: "databar_stacked",
    decoded: "0109521234543213",
    check: (parsed) =>
      expect(kind(parsed, "gs1").data.gtin).toBe("09521234543213"),
  },
  {
    name: "GS1 DataBar Expanded with a lot and an expiry date",
    bcid: "databarexpanded",
    text: "(01)09501101530003(10)LOT-7(17)261231",
    format: "databar_expanded",
    decoded: `010950110153000310LOT-7${GS}17261231`,
    check: (parsed) =>
      expect(kind(parsed, "gs1").data.fields).toEqual([
        { label: "GTIN", value: "09501101530003" },
        { label: "Batch / lot", value: "LOT-7" },
        { label: "Expiry date", value: "2026-12-31" },
      ]),
  },
  {
    name: "GS1 DataBar Expanded Stacked coupon",
    bcid: "databarexpandedstacked",
    text: "(8110)106141416543213500110000310123196000",
    options: { segments: 6 },
    format: "databar_expanded_stacked",
    decoded: "8110106141416543213500110000310123196000",
    check: (parsed) =>
      expect(kind(parsed, "gs1").data.fields).toEqual([
        { label: "Coupon code", value: "106141416543213500110000310123196000" },
      ]),
  },
  {
    name: "MaxiCode mode 2 (US carrier message)",
    bcid: "maxicode",
    text: MAXI_US,
    options: { mode: 2, parse: true },
    format: "maxi_code",
    decoded: MAXI_US_DECODED,
    check: (parsed) => {
      expect(kind(parsed, "text").text).toBe(MAXI_US_DECODED);
      expect(showControlCharacters(MAXI_US_DECODED)).toBe(
        "[)>␞01␝96152382802␝840␝001␝1Z00004951␝UPSN␝06X610␝159␝1234567␝1/1␝␝Y␝634 ALPHA DR␝PITTSBURGH␝PA␞␄",
      );
    },
  },
  {
    name: "MaxiCode mode 3 (postcode with letters)",
    bcid: "maxicode",
    text: MAXI_CA,
    options: { mode: 3, parse: true },
    format: "maxi_code",
    decoded: MAXI_CA_DECODED,
    check: (parsed) => expect(kind(parsed, "text").text).toBe(MAXI_CA_DECODED),
  },
  {
    name: "MaxiCode mode 4 (plain text)",
    bcid: "maxicode",
    text: "Parcel 42, handle with care",
    options: { mode: 4 },
    format: "maxi_code",
    decoded: "Parcel 42, handle with care",
    check: (parsed) =>
      expect(kind(parsed, "text").text).toBe("Parcel 42, handle with care"),
  },
];

describe("/scan reads Micro QR, rMQR, GS1 DataBar and MaxiCode", () => {
  it.each(cases.map((testCase) => [testCase.name, testCase] as const))(
    "%s",
    async (_, { bcid, text, options, format, decoded, check }) => {
      const png = await draw(bcid, text, options ?? {});
      const image = new Blob([new Uint8Array(png)], { type: "image/png" });
      for (const [reader, detector] of [
        ["every format", everything],
        ["the formats Chrome's reader lacks", fallback],
      ] as const) {
        const found = await detector.detect(image);
        expect(
          found.map((code) => [code.format, code.rawValue]),
          reader,
        ).toEqual([[format, decoded]]);
      }
      expect(FORMAT_LABELS[format]).toBeDefined();
      check(parseScan(decoded, format));
    },
  );
});

describe("SCAN_FORMATS", () => {
  it("asks for formats the reader knows, each with a label", async () => {
    const supported = await BarcodeDetector.getSupportedFormats();
    for (const format of SCAN_FORMATS) {
      expect(supported).toContain(format);
      expect(FORMAT_LABELS[format]).toBeDefined();
    }
  });
});
