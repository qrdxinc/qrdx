/** biome-ignore-all lint/style/noMagicNumbers: decode sizes and colors under test */
// The halo rule (src/looks.ts getHaloRisk) through a real rasteriser and two
// decoders: resvg draws the code sharp, as a screen, a PNG export or a print
// delivers it, and both jsQR and ZXing (the scanner's own reader) read it.
// A halo is drawn only on an opaque background, in a rim at least as light
// as HALO_LIGHT_MIN and no lighter than the background. These cases are the
// rule's edges: the darkest rim it takes, on white and on a light grey
// background, with black, grey and blue dots, and on a gradient. At each,
// every dot shape at the narrowest, a middle and the widest halo must read at 4, 6
// and 9 px per module wherever it reads without one. Just outside the edges
// (customize-options.test.ts) the engine draws the code without a halo.
// Nothing here may be loosened: a case that stops reading is a rule change.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { getQRData } from "../src/helpers";
import { getHaloRisk } from "../src/looks";
import { parseColor, type RGBAColor } from "../src/utils/parse-color";
import type { QRProps } from "../types";
import type { ColorConfig } from "../types/color";
import {
  HALO_LIGHT_MIN,
  HALO_WIDTH_MAX,
  HALO_WIDTH_MIN,
} from "../types/constants";
import { BODY_PATTERN } from "../types/image-pattern";
import { renderSvg, symbolSize } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
const SIZES = [4, 6, 9] as const;
const WIDTHS = [HALO_WIDTH_MIN, 0.3, HALO_WIDTH_MAX] as const;
const LIGHT_GREY = "#e5e7eb";

interface Edge {
  name: string;
  bgColor: ColorConfig;
  /** The page around the code (the background's own color) */
  page: string;
  fgColor: string;
}

const EDGES: Edge[] = [
  ...["#000000", "#4b5563", "#1d4ed8"].flatMap((fgColor) => [
    {
      name: `${fgColor} dots on white`,
      bgColor: "#ffffff",
      page: "#ffffff",
      fgColor,
    },
    {
      name: `${fgColor} dots on ${LIGHT_GREY}`,
      bgColor: LIGHT_GREY,
      page: LIGHT_GREY,
      fgColor,
    },
  ]),
  {
    name: `black dots on a white to ${LIGHT_GREY} gradient`,
    bgColor: {
      type: "linear",
      angle: 45,
      stops: [
        { color: "#ffffff", offset: 0 },
        { color: LIGHT_GREY, offset: 100 },
      ],
    },
    page: "#ffffff",
    fgColor: "#000000",
  },
];

function props(
  bodyPattern: QRProps["bodyPattern"],
  edge: Edge,
  width?: number
): QRProps {
  return {
    ...getQRData({
      value: VALUE,
      level: "M",
      size: 256,
      margin: 4,
      bodyPattern,
      bgColor: edge.bgColor,
      fgColor: edge.fgColor,
      ...(width !== undefined && {
        halo: { width, color: HALO_LIGHT_MIN },
      }),
    }),
    level: "M",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  };
}

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The code drawn by resvg at `modulePx`, with four modules of page around it. */
function draw(svg: string, page: string, modulePx: number): Pixels {
  const modules = symbolSize(VALUE, "M") + 8;
  const pad = 4 * modulePx;
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: modules * modulePx },
    background: page,
  }).render();
  const width = image.width + 2 * pad;
  const height = image.height + 2 * pad;
  const data = new Uint8ClampedArray(width * height * 4);
  const tone = parseColor(page) as RGBAColor;
  for (let i = 0; i < width * height; i++) {
    data.set([tone.r, tone.g, tone.b, 255], i * 4);
  }
  for (let y = 0; y < image.height; y++) {
    data.set(
      image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      ((y + pad) * width + pad) * 4
    );
  }
  return { data, width, height };
}

const readsJsQR = (image: Pixels) =>
  jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  })?.data === VALUE;

async function readsZXing(image: Pixels): Promise<boolean> {
  const results = await readBarcodes(image as unknown as ImageData, {
    formats: ["QRCode"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  return results.some((result) => result.text === VALUE);
}

/** "<decoder>@<px>" for each read at each size. */
async function reads(props: QRProps, page: string): Promise<Set<string>> {
  const svg = renderSvg(props);
  const read = new Set<string>();
  for (const modulePx of SIZES) {
    const image = draw(svg, page, modulePx);
    if (readsJsQR(image)) read.add(`jsQR@${modulePx}`);
    if (await readsZXing(image)) read.add(`ZXing@${modulePx}`);
  }
  return read;
}

beforeAll(async () => {
  const require = createRequire(import.meta.url);
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

describe("a halo at the rule's edges reads wherever the code reads without one", () => {
  it("draws the halo at every edge", () => {
    for (const edge of EDGES) {
      const halo = props("circle", edge, HALO_WIDTH_MAX);
      expect(getHaloRisk(halo), edge.name).toBeNull();
      expect(renderSvg(halo), edge.name).toContain('data-qrdx-look="halo"');
    }
  });

  for (const body of BODY_PATTERN) {
    it(`${body} dots, through resvg with jsQR and ZXing`, async () => {
      const worse: string[] = [];
      for (const edge of EDGES) {
        const without = await reads(props(body, edge), edge.page);
        for (const width of WIDTHS) {
          const withHalo = await reads(props(body, edge, width), edge.page);
          for (const read of without) {
            if (!withHalo.has(read)) {
              worse.push(`${edge.name}, width ${width}: ${read}`);
            }
          }
        }
      }
      expect(worse, "reads lost to the halo").toEqual([]);
    }, 120_000);
  }
});
