// exactLevel: the symbol is encoded at exactly the level it is drawn at.
// By default the encoder raises the level to Q or H when the data still
// fits the same version; a Swiss QR-bill must be M (SIX Implementation
// Guidelines §6.1), so the option turns that off. Every path that builds
// the matrix (the SVG tree, the plain renderer, the logo budget, the logo
// size limit, the rounded-background limit, the print layout) has to see the
// same symbol, so each one is checked here, and the codes are decoded by
// ZXing, which reports the level and version it read.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsSVGDataUri } from "../src/export";
import { getLogoSizeLimit, getQRData } from "../src/helpers";
import { getLogoBlockDamage } from "../src/logo-budget";
import { getBgRadiusLimit } from "../src/looks";
import { getQRAsSVGNode } from "../src/plain";
import { getQRModuleCount } from "../src/print";
import { resolveQRCodeProps } from "../src/qr-code-props";
import { renderToString } from "../src/render/string";
import { toSVGString } from "../src/svg";
import { encodeSymbol } from "../src/symbol";
import { resolveErrorLevel } from "../src/utils";
import { renderPrintSVG } from "../src/utils/print-shared";
import type { ErrorLevel, QRProps } from "../types";
import { rasterizeSvg } from "./support/raster";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasm = readFileSync(
    require.resolve("zxing-wasm/reader/zxing_reader.wasm")
  );
  await prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
});

/** 16 bytes: version 2 at M, which the encoder raises to Q by default. */
const BOOSTED = "https://qrdx.dev";

/** A small square block standing in for a logo. */
const LOGO =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E";

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

const svgOfDataUri = (uri: string) =>
  decodeURIComponent(uri.replace("data:image/svg+xml,", ""));

/** What ZXing reads from `svg`: text, level and version. */
async function read(svg: string, modules: number) {
  const image = rasterizeSvg(svg, {
    width: modules * 8,
    pad: 32,
    background: "#ffffff",
  });
  const [result] = await readBarcodes(image, {
    formats: ["QRCode"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  return result
    ? { text: result.text, level: result.ecLevel, version: result.version }
    : null;
}

/** The look the snapshot below was taken with. */
function styled(extra: Partial<QRProps> = {}): QRProps {
  return {
    ...getQRData({
      value: BOOSTED,
      level: "M",
      margin: 2,
      logo: LOGO,
      logoOptions: { size: 0.2 },
      ...extra,
    }),
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
  };
}

describe("the default (exactLevel off) is unchanged", () => {
  const VALUES = [
    "A",
    BOOSTED,
    "WIFI:T:WPA;S:Home;P:hunter22;;",
    "SPC\n0200\n1\nCH4431999123000889012\nS\nQRdx Sample\n\n\n8000\nBern\nCH\n\n\n\n\n\n\n\n\nCHF\n\n\n\n\n\n\n\nNON\n\n\nEPD",
  ];
  const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];

  it("encodes every value at every level exactly as QrCode.encodeText", () => {
    for (const value of VALUES) {
      for (const level of LEVELS) {
        const before = qrcodegen.QrCode.encodeText(
          value,
          ERROR_LEVEL_MAP[level]
        );
        const now = encodeSymbol(value, level);
        expect(now.version).toBe(before.version);
        expect(now.errorCorrectionLevel).toBe(before.errorCorrectionLevel);
        expect(now.getModules()).toEqual(before.getModules());
      }
    }
  });

  // Taken with qrdx 0.0.61 (before exactLevel existed) on the same props.
  it("draws, lays out and budgets a boosted code byte for byte as 0.0.61", async () => {
    const props = styled();
    expect(props.imageSettings?.width).toBeCloseTo(174.08, 6);
    expect(sha256(toSVGString(props))).toBe(
      "48c325e0cf72a4eabc31df9e9c08627d6343fb411a13261a0a94e721c170523e"
    );
    expect(sha256(await getQRAsSVGDataUri(props))).toBe(
      "4c2350618333e6079d8e7750467122e4d37b220c9e4a937c86ef7b7783b706cc"
    );
    expect(getQRModuleCount(props)).toBe(29);
    expect(
      getLogoSizeLimit({ value: BOOSTED, level: "M", margin: 2 })
    ).toBeCloseTo(0.17, 6);
    expect(
      getLogoBlockDamage(
        { value: BOOSTED, size: 1024, margin: 2, level: "M" },
        props.imageSettings ?? { src: LOGO, width: 0, height: 0 }
      )
    ).toEqual({ worst: 6, correctable: 11, budget: 6, level: "Q", version: 2 });
  });

  it("is read by ZXing at the raised level", async () => {
    expect(await read(toSVGString(styled()), 29)).toEqual({
      text: BOOSTED,
      level: "Q",
      version: "2",
    });
  });
});

describe("exactLevel", () => {
  it("keeps the level the encoder would raise", () => {
    const boosted = encodeSymbol(BOOSTED, "M");
    const exact = encodeSymbol(BOOSTED, "M", true);
    expect(boosted.errorCorrectionLevel).toBe(qrcodegen.QrCode.Ecc.QUARTILE);
    expect(exact.errorCorrectionLevel).toBe(qrcodegen.QrCode.Ecc.MEDIUM);
    // Same version: the boost never grows the symbol
    expect(exact.version).toBe(2);
    expect(boosted.version).toBe(2);
  });

  it("is carried by getQRData and resolveQRCodeProps", () => {
    expect(styled({ exactLevel: true }).exactLevel).toBe(true);
    expect(styled().exactLevel).toBeUndefined();
    expect(
      resolveQRCodeProps({ value: BOOSTED, level: "M", exactLevel: true })
        .exactLevel
    ).toBe(true);
    expect(
      "exactLevel" in resolveQRCodeProps({ value: BOOSTED, level: "M" })
    ).toBe(false);
  });

  it("budgets the logo at the level drawn", () => {
    const code = { value: BOOSTED, size: 1024, margin: 2, level: "M" as const };
    const logo = { src: LOGO, width: 120, height: 120, excavate: true };
    expect(getLogoBlockDamage(code, logo)?.level).toBe("Q");
    expect(
      getLogoBlockDamage({ ...code, exactLevel: true }, logo)
    ).toMatchObject({ level: "M", version: 2 });
    // M repairs fewer codewords than Q, so the largest logo is smaller
    const exactLimit = getLogoSizeLimit({
      value: BOOSTED,
      level: "M",
      margin: 2,
      exactLevel: true,
    });
    expect(exactLimit).toBeGreaterThan(0);
    expect(exactLimit).toBeLessThan(
      getLogoSizeLimit({ value: BOOSTED, level: "M", margin: 2 })
    );
    // getQRData holds the logo to the M budget too
    const width = styled({ exactLevel: true }).imageSettings?.width ?? 0;
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(174.08);
    expect(width / 1024).toBeCloseTo(exactLimit, 2);
  });

  it("draws the same symbol on every path, read by ZXing at M", async () => {
    const props = styled({ exactLevel: true });
    const expected = { text: BOOSTED, level: "M", version: "2" };
    // The SVG tree (QRCodeSVG, toSVGString)
    expect(await read(toSVGString(props), 29)).toEqual(expected);
    // getQRAsSVGDataUri: the SVG download, and the PNG/JPG/PDF/EPS built on it
    expect(
      await read(svgOfDataUri(await getQRAsSVGDataUri(props)), 29)
    ).toEqual(expected);
    // The print file's artwork (PDF and EPS)
    expect(await read(await renderPrintSVG(props), 29)).toEqual(expected);
    // The plain renderer (getQRAsSVG)
    expect(
      await read(
        renderToString(
          await getQRAsSVGNode({ value: BOOSTED, level: "M", exactLevel: true })
        ),
        25
      )
    ).toEqual(expected);
    // A level that isn't boosted is drawn as before
    expect(
      sha256(toSVGString({ ...props, level: "H", exactLevel: true }))
    ).toBe(sha256(toSVGString({ ...props, level: "H" })));
  });

  it("keeps the print size and the rounded-background limit", () => {
    // The boost never changes the version, so sizes are the same
    const props = styled({ exactLevel: true });
    expect(getQRModuleCount(props)).toBe(29);
    expect(
      getBgRadiusLimit({
        value: BOOSTED,
        level: "M",
        margin: 2,
        exactLevel: true,
      })
    ).toBe(getBgRadiusLimit({ value: BOOSTED, level: "M", margin: 2 }));
  });

  it("still lets autoLevel raise the level for a big logo", () => {
    const big = { src: LOGO, width: 300, height: 300, excavate: true };
    const code = { value: BOOSTED, size: 1024, margin: 2, level: "M" as const };
    expect(
      resolveErrorLevel({
        ...code,
        imageSettings: big,
        autoLevel: true,
        exactLevel: true,
      })
    ).toBe("H");
    expect(
      resolveErrorLevel({ ...code, imageSettings: big, exactLevel: true })
    ).toBe("M");
  });
});
