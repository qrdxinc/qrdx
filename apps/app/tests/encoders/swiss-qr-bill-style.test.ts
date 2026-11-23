// The QR-bill style (lib/qr-design/swiss-qr-bill-style.ts), from SIX's
// Swiss Implementation Guidelines for the QR-bill v2.4: error correction M
// encoded exactly (§6.1), the smallest version (§6.4), the Swiss cross at
// 7/46 of the symbol (§6.4.2), black dots on white (§2.4) and nothing
// printed around the code (§6.4.1). Bills drawn that way, as the editor and
// the API draw them (designQRProps), must pass the scan score (scoreDesign:
// the editor badge's checks, run on the server, read at 320 px) and be read
// back by ZXing at level M in the version the payload needs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { toSVGString, withQRSize } from "qrdx";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultThemeState } from "@/config/qr";
import { designQRProps } from "@/lib/qr-design/props";
import { scoreDesign } from "@/lib/qr-design/score";
import {
  swissQrStyleIssues,
  withSwissQrStyle,
} from "@/lib/qr-design/swiss-qr-bill-style";
import type { ThemeStyles } from "@/types/theme";
import {
  encodeSwissQrBill,
  SWISS_CROSS_LOGO,
  swissCrossShare,
  swissQrModules,
} from "@/utils/swiss-qr-bill";
import { SIX_SAMPLES } from "../support/swiss-qr-bill-samples";

interface Read {
  text: string;
  ecLevel: string;
  version: string;
}
type ReadBarcodes = (
  input: Blob,
  options: { formats: string[]; tryHarder: boolean },
) => Promise<Read[]>;
let readBarcodes: ReadBarcodes;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const reader = (await import(fromDetector.resolve("zxing-wasm/reader"))) as {
    readBarcodes: ReadBarcodes;
    prepareZXingModule: (options: unknown) => unknown;
  };
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  reader.prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
  readBarcodes = reader.readBarcodes;
});

/** Each bill is rendered, rasterized and decoded a few times. */
const SCANS = { timeout: 180_000 };

/** The editor's default look: circle dots, gear eyes, circle centres. */
const EDITOR = defaultThemeState.styles;
const SQUARE: ThemeStyles = {
  ...EDITOR,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

/** A bill with every field near its limit (IG Table 8). */
const LONG_BILL = encodeSwissQrBill({
  type: "swiss-qr-bill",
  iban: "CH4431999123000889012",
  name: "Genossenschaft für Wohnungsbau und Quartierentwicklung Zürich-Nord",
  street: "Hohlstrasse",
  buildingNumber: "110a",
  postalCode: "8004",
  town: "Zürich",
  country: "CH",
  currency: "CHF",
  amount: "1949.75",
  reference: "210000000003139471430009017",
  message: "Miete Januar 2027, Wohnung 4.2",
  billingInfo:
    "//S1/10/10201409/11/200630/20/140.000-53/30/102673831/31/200615/32/7.7/40/0:30",
  payableBy: true,
  debtorName: "Pia-Maria Rutschmann-Schnyder",
  debtorStreet: "Grosse Marktgasse",
  debtorBuildingNumber: "28",
  debtorPostalCode: "9400",
  debtorTown: "Rorschach",
  debtorCountry: "CH",
});

const BILLS = {
  "SIX sample 1": SIX_SAMPLES.nr1,
  "SIX sample 17": SIX_SAMPLES.nr17,
  "a long bill": LONG_BILL,
};

async function decode(svg: string): Promise<Read | undefined> {
  const png = await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#fff" })
    .png()
    .toBuffer();
  const [result] = await readBarcodes(new Blob([new Uint8Array(png)]), {
    formats: ["QRCode"],
    tryHarder: true,
  });
  return result;
}

describe("the QR-bill style", () => {
  const value = SIX_SAMPLES.nr1;

  it("puts error correction M, the cross, black on white and a clear border on a design", () => {
    const busy: ThemeStyles = {
      ...EDITOR,
      level: "H",
      autoLevel: true,
      fgColor: "#1d4ed8",
      bgColor: "#fef3c7",
      eyeColors: { topLeft: { outer: "#b91c1c" } },
      shadow: { dx: 0.1, dy: 0.1 },
      frame: { style: "banner-bottom", text: "Pay" },
      shape: "circle",
      bgRadius: 0.2,
      backdrop: "#0f172a",
      margin: 2,
    };
    expect(swissQrStyleIssues(busy, value)).toEqual([
      "level",
      "cross",
      "colors",
      "border",
    ]);
    const styled = withSwissQrStyle(busy, value);
    expect(swissQrStyleIssues(styled, value)).toEqual([]);
    expect(styled).toMatchObject({
      level: "M",
      fgColor: "#000000",
      bgColor: "#ffffff",
      showLogo: true,
      customLogo: SWISS_CROSS_LOGO,
      logoOptions: { size: swissCrossShare(value, 2) },
      // What the guidelines leave open stays the design's
      bodyPattern: EDITOR.bodyPattern,
      cornerEyePattern: EDITOR.cornerEyePattern,
      cornerEyeDotPattern: EDITOR.cornerEyeDotPattern,
      margin: 2,
    });
    for (const key of [
      "autoLevel",
      "eyeColors",
      "shadow",
      "frame",
      "shape",
      "bgRadius",
      "backdrop",
    ] as const) {
      expect(styled[key]).toBeUndefined();
    }
  });

  it("names each part a design changes", () => {
    const styled = withSwissQrStyle(EDITOR, value);
    const issues = (change: Partial<ThemeStyles>) =>
      swissQrStyleIssues({ ...styled, ...change }, value);
    expect(issues({ level: "Q" })).toEqual(["level"]);
    expect(issues({ autoLevel: true })).toEqual(["level"]);
    expect(issues({ showLogo: false })).toEqual(["cross"]);
    expect(issues({ logoOptions: { size: 0.2 } })).toEqual(["cross"]);
    expect(
      issues({ logoOptions: { size: swissCrossShare(value), x: 0.3 } }),
    ).toEqual(["cross"]);
    // A bigger margin makes the cross a smaller share of the whole
    expect(issues({ margin: 4 })).toEqual(["cross"]);
    expect(issues({ fgColor: "#1d4ed8" })).toEqual(["colors"]);
    expect(
      issues({
        fgColor: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#333333", offset: 100 },
          ],
        },
      }),
    ).toEqual(["colors"]);
    expect(issues({ halo: { width: 0.2 } })).toEqual(["colors"]);
    expect(issues({ frame: { style: "border", text: "Pay" } })).toEqual([
      "border",
    ]);
    expect(issues({ shape: "heart" })).toEqual(["border"]);
    expect(issues({ bgRadius: 0.1 })).toEqual(["border"]);
    // Colors written another way, a frame switched off and dot and eye
    // shapes are fine
    expect(
      issues({
        fgColor: "#000",
        bgColor: "#FFFFFF",
        eyeColor: undefined,
        frame: { style: "none" },
        bodyPattern: "rounded",
        cornerEyePattern: "circle",
        cornerEyeDotPattern: "square",
        moduleScale: 0.8,
      }),
    ).toEqual([]);
  });
});

describe("a QR-bill drawn the strict way", () => {
  const LOOKS = { "the editor's look": EDITOR, "square modules": SQUARE };

  for (const [bill, value] of Object.entries(BILLS)) {
    for (const [look, base] of Object.entries(LOOKS)) {
      it(
        `${bill} in ${look} scans at M in the smallest version`,
        SCANS,
        async () => {
          const style = withSwissQrStyle(base, value);
          const props = designQRProps(value, style, SWISS_CROSS_LOGO);
          expect(props.exactLevel).toBe(true);
          expect(props.level).toBe("M");

          // The cross is drawn at 7/46 of the symbol: the budget at M holds it
          const crossShare = (props.imageSettings?.width ?? 0) / 1024;
          expect(crossShare).toBeCloseTo(swissCrossShare(value), 6);

          // The smallest version at M (IG §6.4), as the form sizes the cross
          const modules = swissQrModules(value);
          const version = (modules - 17) / 4;
          const svg = toSVGString(withQRSize(props, modules * 8));
          const read = await decode(svg);
          expect(read?.text).toBe(value);
          expect(read?.ecLevel).toBe("M");
          expect(read?.version).toBe(String(version));

          // The editor's scan score, run on the server. It reads the code at
          // 320 px; a bill's 61 or more modules are too dense for its 96 and
          // 160 px reads in any style, and the editor's margin of 0 leaves the
          // quiet zone to the paper (5 mm of white, as the form says)
          const score = await scoreDesign(value, style);
          expect(score.grade).not.toBe("fails");
          const failed = score.checks
            .filter((check) => !check.passed)
            .map((check) => check.id);
          expect(failed).not.toContain("decode-320");
          for (const id of failed) {
            expect(["decode-96", "decode-160", "quiet-zone"]).toContain(id);
          }
        },
      );
    }
  }
});
