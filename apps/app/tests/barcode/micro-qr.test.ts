// Micro QR's size check (lib/barcode/micro-qr.ts) against bwip-js itself:
// for a spread of texts, the version and error correction level the
// validator promises are the ones bwip-js draws, and what it refuses
// bwip-js can't draw. The version is read from the drawing's size and the
// level from the symbol, with ZXing (the scanner's reader) in pure mode:
// the image is the symbol alone, so no detection step can miss it.
//
// Pure mode is also why every symbol here reads: ZXing's Micro QR detector
// (zxing-wasm 3.1.6) misses about 1 valid symbol in 400 in a whole image,
// for some module patterns near the corners, while pure mode and the symbol
// zint draws for the same text agree it's valid.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { drawOptions } from "@/lib/barcode/draw";
import { MICRO_QR_LIMITS, microQrSymbol } from "@/lib/barcode/micro-qr";
import { renderBarcodeServer } from "@/lib/barcode/server";

type Read = (
  input: Blob,
  options: { formats: string[]; isPure: boolean },
) => Promise<{ text: string; version: string; ecLevel: string }[]>;
let read: Read;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const reader = (await import(fromDetector.resolve("zxing-wasm/reader"))) as {
    readBarcodes: Read;
    prepareZXingModule: (options: object) => void;
  };
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  reader.prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ),
    },
    fireImmediately: true,
  });
  read = reader.readBarcodes;
});

const STYLE = {
  foreground: "#000000",
  background: "#ffffff",
  showText: false,
  barHeightMm: 15,
  quietZone: 2,
  scale: 2,
};

/** What bwip-js draws for `text`: "M3/L", or "none" when it doesn't fit. */
async function drawn(text: string): Promise<string> {
  let svg: string;
  let width: number;
  try {
    ({ svg, width } = renderBarcodeServer("microqr", text, STYLE));
  } catch (error) {
    if (/Too much for one Micro QR/.test(String(error))) return "none";
    throw error;
  }
  const png = await sharp(Buffer.from(svg), { density: 72 })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const found = await read(new Blob([new Uint8Array(png)], { type: "image/png" }), {
    formats: ["MicroQRCode"],
    isPure: true,
  });
  expect(found.map((code) => code.text)).toEqual([text]);
  const [code] = found;
  // Modules on a side, from the drawing: 2 units each, 2 modules of quiet
  // zone all round.
  const modules = width / STYLE.scale / 2 - 4;
  expect(`M${(modules - 9) / 2}`).toBe(code?.version);
  return `${code?.version}/${code?.ecLevel}`;
}

const promised = (text: string) => {
  const symbol = microQrSymbol(text);
  return symbol ? `${symbol.version}/${symbol.level}` : "none";
};

/** A fixed pseudo-random spread of texts from `chars`, 1 to `max` long. */
function texts(chars: string, count: number, max: number, seed: number) {
  const pool = [...chars];
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(next() * max);
    return Array.from(
      { length },
      () => pool[Math.floor(next() * pool.length)],
    ).join("");
  });
}

describe("microQrSymbol", () => {
  it("has M4's limits: 35 digits, 21 capital letters, 15 bytes", () => {
    expect(MICRO_QR_LIMITS).toEqual({
      digits: 35,
      alphanumeric: 21,
      bytes: 15,
    });
    expect(microQrSymbol("9".repeat(35))).toMatchObject({ version: "M4" });
    expect(microQrSymbol("9".repeat(36))).toBeNull();
    expect(microQrSymbol("A".repeat(21))).toMatchObject({ version: "M4" });
    expect(microQrSymbol("A".repeat(22))).toBeNull();
    expect(microQrSymbol("x".repeat(15))).toMatchObject({ version: "M4" });
    expect(microQrSymbol("x".repeat(16))).toBeNull();
    expect(microQrSymbol("")).toBeNull();
  });

  it("gives each size's smallest and largest text", () => {
    expect(microQrSymbol("1")).toEqual({
      version: "M1",
      modules: 11,
      level: "L",
    });
    expect(microQrSymbol("12345")).toMatchObject({ version: "M1" });
    expect(microQrSymbol("123456")).toEqual({
      version: "M2",
      modules: 13,
      level: "M",
    });
    expect(microQrSymbol("1".repeat(10))).toMatchObject({
      version: "M2",
      level: "L",
    });
    expect(microQrSymbol("A".repeat(6))).toMatchObject({ version: "M2" });
    expect(microQrSymbol("A".repeat(7))).toMatchObject({ version: "M3" });
    expect(microQrSymbol("x".repeat(9))).toMatchObject({
      version: "M3",
      modules: 15,
      level: "L",
    });
    expect(microQrSymbol("x".repeat(10))).toEqual({
      version: "M4",
      modules: 17,
      level: "M",
    });
  });

  it.each([
    ["digits", "0123456789", 60, 36],
    ["capital letters, digits and symbols", "0123456789ABCXYZ $%*+-./:", 60, 24],
    ["mostly digits with letters", "0123456789012345AB", 60, 34],
    ["lowercase and digits", "0123456789abcxyz-", 60, 18],
    ["accents", "abcé ü ñ", 40, 12],
    ["other scripts", "日本語テキスト", 30, 7],
    ["everything", "0123456789AB-./ab\né日", 90, 24],
  ])("matches what bwip-js draws: %s", async (_, chars, count, max) => {
    for (const text of texts(chars, count, max, count * max)) {
      expect(await drawn(text), JSON.stringify(text)).toBe(promised(text));
    }
  });

  it("matches bwip-js where its split isn't the shortest", async () => {
    // An optimal split would fit these in a smaller symbol, or at all;
    // bwip-js's doesn't, and the check agrees with the drawing.
    for (const text of [
      "A5a0C3WP8+J",
      "0AB1482737\n75424\n8",
      "077907LWB0376049\n6",
      "b3.51A2KL70Z957P8B",
    ]) {
      expect(await drawn(text), JSON.stringify(text)).toBe(promised(text));
    }
  });

  it("turns Kanji mode off: the text is UTF-8", () => {
    const style = { ...STYLE, rotation: 0 as const };
    expect(drawOptions("microqr", "日本", style).suppresskanjimode).toBe(true);
    expect(drawOptions("rmqr", "日本", style).suppresskanjimode).toBeUndefined();
  });
});
