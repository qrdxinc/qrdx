// Everything the editor and the theme generator pair with the shapes added
// after qrdx 0.0.57 must scan in sharp renders (a downloaded PNG or SVG on a
// screen, no camera blur): the eye presets (one tap picks frame + centre),
// the centres the theme blocks give each new eye, and the built-in themes
// that use a new shape. Each is drawn by the engine, rasterized by sharp at
// 4, 6, 9 and 14 px per module, at levels M and Q, for three values, and
// must be read by jsQR and by ZXing (the scanner's own reader). Presets and
// blocks use the default body (circle); themes use their own style.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { toSVGString } from "qrdx";
import type { QRProps } from "qrdx/types";
import sharp from "sharp";
import { beforeAll, describe, expect, it, it as test } from "vitest";
import { EYE_PRESETS } from "@/components/editor/control-sections/shape-catalog";
import { EYE_DOTS } from "@/lib/themes/blocks";
import {
  NEW_BODY_PATTERNS,
  NEW_EYE_CENTRES,
  NEW_EYE_FRAMES,
} from "@/lib/whats-new/patterns";
import { defaultPresets } from "@/utils/qr-presets";

/** The part of jsQR's signature these tests use. */
type JsQR = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "attemptBoth" },
) => { data: string; version: number } | null;

const require = createRequire(import.meta.url);
// jsqr ships with qrdx, so resolve it from there.
const jsQR = createRequire(require.resolve("qrdx/package.json"))(
  "jsqr",
) as JsQR;

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
  detector = new BarcodeDetector({ formats: ["qr_code"] });
});

const VALUES = [
  "https://qrdx.dev/?ref=research",
  "https://qrdx.dev/q/Ab3dE9x?utm=campaign",
  "WIFI:T:WPA;S:Home;P:hunter22;;",
] as const;
const SIZES = [4, 6, 9, 14] as const;
const LEVELS = ["M", "Q"] as const;
const MARGIN = 4;

const isNew = {
  body: (id: string | undefined) =>
    NEW_BODY_PATTERNS.some((batch) => batch.ids.includes(id ?? "")),
  eye: (id: string | undefined) =>
    NEW_EYE_FRAMES.some((batch) => batch.ids.includes(id ?? "")),
  centre: (id: string | undefined) =>
    NEW_EYE_CENTRES.some((batch) => batch.ids.includes(id ?? "")),
};

/** Modules across the symbol, read back from a plain render. */
const symbolSizes = new Map<string, number>();
async function symbolSize(value: string, level: string) {
  const key = `${level} ${value}`;
  const known = symbolSizes.get(key);
  if (known) return known;
  const { data, info } = await sharp(
    Buffer.from(
      toSVGString({
        value,
        level: level as QRProps["level"],
        size: 1000,
        margin: MARGIN,
        bodyPattern: "square",
        cornerEyePattern: "square",
        cornerEyeDotPattern: "square",
      }),
    ),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plain = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  if (!plain) throw new Error(`A plain ${key} code didn't decode`);
  const size = 17 + 4 * plain.version;
  symbolSizes.set(key, size);
  return size;
}

/** Every render of `style` that jsQR or ZXing misses. */
async function missedRenders(
  style: Omit<QRProps, "value" | "level" | "size" | "margin">,
): Promise<string[]> {
  const missed: string[] = [];
  for (const level of LEVELS) {
    for (const [index, value] of VALUES.entries()) {
      const modules = (await symbolSize(value, level)) + 2 * MARGIN;
      for (const modulePx of SIZES) {
        const svg = toSVGString({
          ...style,
          value,
          level,
          margin: MARGIN,
          size: modules * modulePx,
        });
        const image = sharp(Buffer.from(svg)).flatten({
          background: "#ffffff",
        });
        const { data, info } = await image
          .clone()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const render = `${level} ${modulePx}px v${index}`;
        const jsqr = jsQR(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
          {
            inversionAttempts: "attemptBoth",
          },
        );
        if (jsqr?.data !== value) missed.push(`${render} jsQR`);
        const png = await image.png().toBuffer();
        const zxing = await detector.detect(
          new Blob([new Uint8Array(png)], { type: "image/png" }),
        );
        if (!zxing.some((code) => code.rawValue === value)) {
          missed.push(`${render} ZXing`);
        }
      }
    }
  }
  return missed;
}

const presets = EYE_PRESETS.filter((preset) => isNew.eye(preset.outer));
const blocks = Object.entries(EYE_DOTS).flatMap(([eye, centres]) =>
  isNew.eye(eye) ? (centres ?? []).map((centre) => ({ eye, centre })) : [],
);
const themes = Object.entries(defaultPresets).filter(
  ([, preset]) =>
    isNew.body(preset.styles.bodyPattern) ||
    isNew.eye(preset.styles.cornerEyePattern) ||
    isNew.centre(preset.styles.cornerEyeDotPattern),
);

test("covers every new eye", () => {
  const eyes = NEW_EYE_FRAMES.flatMap((batch) => batch.ids);
  expect(presets.map((preset) => preset.outer).sort()).toEqual(
    [...eyes].sort(),
  );
  expect([...new Set(blocks.map((block) => block.eye))].sort()).toEqual(
    [...eyes].sort(),
  );
});

describe("eye presets with a new frame read in sharp renders", () => {
  it.each(presets)(
    "$name ($outer + $centre)",
    async ({ outer, centre }) => {
      expect(
        await missedRenders({
          bodyPattern: "circle",
          cornerEyePattern: outer,
          cornerEyeDotPattern: centre,
        }),
      ).toEqual([]);
    },
    180_000,
  );
});

describe("theme blocks: centres for the new frames read in sharp renders", () => {
  it.each(blocks)(
    "$eye + $centre",
    async ({ eye, centre }) => {
      expect(
        await missedRenders({
          bodyPattern: "circle",
          cornerEyePattern: eye as QRProps["cornerEyePattern"],
          cornerEyeDotPattern: centre,
        }),
      ).toEqual([]);
    },
    180_000,
  );
});

describe("built-in themes with a new shape read in sharp renders", () => {
  it.each(themes)(
    "%s",
    async (_id, preset) => {
      const { bodyPattern, cornerEyePattern, cornerEyeDotPattern } =
        preset.styles;
      const color = (value: unknown) =>
        typeof value === "string" ? value : undefined;
      expect(
        await missedRenders({
          bodyPattern,
          cornerEyePattern,
          cornerEyeDotPattern,
          fgColor: color(preset.styles.fgColor),
          bgColor: color(preset.styles.bgColor),
          eyeColor: color(preset.styles.eyeColor),
          dotColor: color(preset.styles.dotColor),
        }),
      ).toEqual([]);
    },
    180_000,
  );
});
