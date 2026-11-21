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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getQRData } from "../src/helpers";
import { getHaloRisk } from "../src/looks";
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

const READER = fileURLToPath(
  new URL("./support/halo-reads.mjs", import.meta.url)
);

/**
 * "<decoder>@<px>" for each read of each code, drawn by resvg and read by
 * jsQR and ZXing in a child process (support/halo-reads.mjs: resvg-js keeps
 * every render's memory until its process exits).
 */
function reads(codes: { props: QRProps; page: string }[]): Set<string>[] {
  const jobs = codes.flatMap(({ props, page }) => {
    const svg = renderSvg(props);
    return SIZES.map((modulePx) => ({ svg, page, modulePx }));
  });
  const result = JSON.parse(
    execFileSync(process.execPath, [READER], {
      input: JSON.stringify({
        value: VALUE,
        modules: symbolSize(VALUE, "M") + 8,
        jobs,
      }),
      maxBuffer: 1 << 24,
    }).toString()
  ) as [boolean, boolean][];
  return codes.map((_, code) => {
    const read = new Set<string>();
    SIZES.forEach((modulePx, size) => {
      const [byJsQR, byZXing] = result[code * SIZES.length + size] ?? [];
      if (byJsQR) read.add(`jsQR@${modulePx}`);
      if (byZXing) read.add(`ZXing@${modulePx}`);
    });
    return read;
  });
}

describe("a halo at the rule's edges reads wherever the code reads without one", () => {
  it("draws the halo at every edge", () => {
    for (const edge of EDGES) {
      const halo = props("circle", edge, HALO_WIDTH_MAX);
      expect(getHaloRisk(halo), edge.name).toBeNull();
      expect(renderSvg(halo), edge.name).toContain('data-qrdx-look="halo"');
    }
  });

  for (const body of BODY_PATTERN) {
    it(`${body} dots, through resvg with jsQR and ZXing`, () => {
      const worse: string[] = [];
      for (const edge of EDGES) {
        const [without, ...withHalo] = reads(
          [undefined, ...WIDTHS].map((width) => ({
            props: props(body, edge, width),
            page: edge.page,
          }))
        );
        WIDTHS.forEach((width, index) => {
          for (const read of without ?? []) {
            if (!withHalo[index]?.has(read)) {
              worse.push(`${edge.name}, width ${width}: ${read}`);
            }
          }
        });
      }
      expect(worse, "reads lost to the halo").toEqual([]);
    }, 120_000);
  }
});
