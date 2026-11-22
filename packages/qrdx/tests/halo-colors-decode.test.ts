/** biome-ignore-all lint/style/noMagicNumbers: decode sizes and colors under test */
// Any halo color a person picks is drawn, in the closest color the halo
// rule takes (src/looks.ts fitHaloColor): its hue kept, its lightness moved
// until both decoders read it between HALO_LIGHT_MIN and the background.
// These are those adjusted rims through a real rasteriser and two
// decoders, as halo-decode.test.ts reads the rule's own edges: resvg draws
// the code sharp, as a screen, a PNG export or a print delivers it, and
// jsQR and ZXing (the scanner's own reader) read it. A dark red, blue,
// green, black and the dots' own color, picked for blue dots on white and
// on a light grey background (with a yellow drawn darker than it picked
// on the grey); the dark red for black dots on both, and for blue dots in
// rounded corners on a dark backdrop. Every dot shape at the narrowest, a
// middle and the widest halo must read at 4, 6 and 9 px per module
// wherever it reads without one. Nothing here may be loosened: a case
// that stops reading is a rule change.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getQRData } from "../src/helpers";
import { fitHaloColor, getHaloRisk } from "../src/looks";
import type { QRProps } from "../types";
import {
  BG_RADIUS_MAX,
  HALO_WIDTH_MAX,
  HALO_WIDTH_MIN,
} from "../types/constants";
import { BODY_PATTERN } from "../types/image-pattern";
import { childReads } from "./support/child-reads";
import { renderSvg, symbolSize } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
const SIZES = [4, 6, 9] as const;
const WIDTHS = [HALO_WIDTH_MIN, 0.3, HALO_WIDTH_MAX] as const;
const LIGHT_GREY = "#e5e7eb";
const DARK_BACKDROP = "#0f172a";

/** Colors a person picks: the owner's dark red (22 Nov 2026), blue, green, black. */
const PICKED = ["#881337", "#2563eb", "#16a34a", "#000000"];
/** Blue dots: lighter than black to every decoder, so closer to any rim. */
const BLUE = "#1d4ed8";
/** A rim picked lighter than the light grey (to ZXing): drawn darker. */
const LIGHTER = "#ffff00";

interface Setting {
  name: string;
  bgColor: string;
  fgColor: string;
  /** Rim colors picked on it, each drawn adjusted */
  picked: string[];
  /** The page around the code */
  page: string;
  /** Rounded corners on a backdrop */
  corners?: { bgRadius: number; backdrop: string };
}

const SETTINGS: Setting[] = [
  // Blue dots, with their own color among the picks
  {
    name: `${BLUE} dots on white`,
    bgColor: "#ffffff",
    fgColor: BLUE,
    picked: [...PICKED, BLUE],
    page: "#ffffff",
  },
  {
    name: `${BLUE} dots on ${LIGHT_GREY}`,
    bgColor: LIGHT_GREY,
    fgColor: BLUE,
    picked: [...PICKED, BLUE, LIGHTER],
    page: LIGHT_GREY,
  },
  // Black dots, the most common
  ...["#ffffff", LIGHT_GREY].map((bgColor) => ({
    name: `black dots on ${bgColor}`,
    bgColor,
    fgColor: "#000000",
    picked: ["#881337"],
    page: bgColor,
  })),
  // Rounded corners on a dark backdrop: the page around the code is dark
  {
    name: `${BLUE} dots on white, rounded on a dark backdrop`,
    bgColor: "#ffffff",
    fgColor: BLUE,
    picked: ["#881337"],
    page: DARK_BACKDROP,
    corners: { bgRadius: BG_RADIUS_MAX, backdrop: DARK_BACKDROP },
  },
];

function props(
  bodyPattern: QRProps["bodyPattern"],
  setting: Setting,
  halo?: QRProps["halo"]
): QRProps {
  return {
    ...getQRData({
      value: VALUE,
      level: "M",
      size: 256,
      margin: 4,
      bodyPattern,
      bgColor: setting.bgColor,
      fgColor: setting.fgColor,
      ...(halo && { halo }),
    }),
    ...setting.corners,
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
  const result = childReads<[boolean, boolean][]>(READER, {
    value: VALUE,
    modules: symbolSize(VALUE, "M") + 8,
    jobs,
  });
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

describe("a halo in any picked color, drawn adjusted, reads wherever the code reads without one", () => {
  it("draws every pick, in a color other than the one picked", () => {
    for (const setting of SETTINGS) {
      for (const color of setting.picked) {
        const code = props("circle", setting, { color });
        const drawn = fitHaloColor(color, setting.bgColor) as string;
        const risk = getHaloRisk(code);
        expect(risk?.reason, `${setting.name}, ${color}`).toBe("adjusted");
        expect(risk?.reason === "adjusted" && risk.color).toBe(drawn);
        expect(renderSvg(code), `${setting.name}, ${color}`).toContain(
          `data-qrdx-look="halo" fill="${drawn}"`
        );
      }
    }
  });

  for (const body of BODY_PATTERN) {
    it(`${body} dots, through resvg with jsQR and ZXing`, () => {
      const worse: string[] = [];
      for (const setting of SETTINGS) {
        const halos = setting.picked.flatMap((color) =>
          WIDTHS.map((width) => ({ color, width }))
        );
        const [without, ...withHalo] = reads(
          [undefined, ...halos].map((halo) => ({
            props: props(body, setting, halo),
            page: setting.page,
          }))
        );
        halos.forEach(({ color, width }, index) => {
          for (const read of without ?? []) {
            if (!withHalo[index]?.has(read)) {
              const drawn = fitHaloColor(color, setting.bgColor);
              worse.push(
                `${setting.name}, ${color} drawn as ${drawn}, width ${width}: ${read}`
              );
            }
          }
        });
      }
      expect(worse, "reads lost to the halo").toEqual([]);
    }, 180_000);
  }
});
