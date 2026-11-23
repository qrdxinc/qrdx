/** biome-ignore-all lint/style/noMagicNumbers: the templates' own geometry */
// The engine's six templates became built-in frames in qrdx 0.0.64. Arrow,
// Standard Box, Square Border, Striked Box and Halloween keep the frame
// specs they were drawn from, so each frame must draw the artwork its
// hand-written template drew (tests/support/legacy-templates.tsx, unchanged
// since qrdx 0.0.51), now around the code at its full size. Dot Ring keeps
// its ring, its 593-unit geometry and dots from its own table (a fixed set:
// a frame is the same for every link), and scans. A template prop passed at
// run time (`templateId`, `customTemplate`, `customProps`) is dropped
// without a trace: the code is drawn without it.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { renderToString, toSVGString } from "../src/core";
import { getFrameDimensions } from "../src/frame";
import { BUILT_IN_FRAMES, getBuiltInFrame } from "../src/frames/builtin";
import { QRCode } from "../src/qr-code";
import { QRCodeSVG } from "../src/qr-code-svg";
import type { ErrorLevel, QRProps } from "../types";
import type { FrameSpec } from "../types/frame-spec";
import { frameSpecSchema } from "../types/frame-spec";
import { PLAIN, VALUE } from "./support/catalog";
import { compareImages } from "./support/frames";
import {
  LegacyArrow,
  LegacyHalloween,
  LegacySquareBorder,
  LegacyStandardBox,
  LegacyStrikedBox,
  type LegacyTemplate,
} from "./support/legacy-templates";
import { renderSvg } from "./support/qr";
import {
  decodeQR,
  type RasterImage,
  rasterizeSvg,
  simulateCamera,
} from "./support/raster";

/**
 * Each template, the frame style it became and where its artwork sat in
 * the template's 300 × 300 box (x, y, scale), as src/template drew it.
 */
const SPEC_TEMPLATES: [
  string,
  string,
  LegacyTemplate,
  [number, number, number],
][] = [
  ["Arrow", "arrow", LegacyArrow, [47, 95, 1]],
  ["StandardBox", "standard-box", LegacyStandardBox, [46, 1, 1]],
  ["SquareBorder", "square-border", LegacySquareBorder, [0, 0, 300 / 316]],
  ["StrikedBox", "striked-box", LegacyStrikedBox, [24, 0, 1]],
  ["Halloween", "pumpkin", LegacyHalloween, [38, 10, 1]],
];

const NAMES: Record<string, string> = {
  arrow: "Arrow",
  "standard-box": "Standard box",
  "square-border": "Square border",
  "striked-box": "Striked box",
  pumpkin: "Pumpkin",
  "dot-ring": "Dot ring",
};

/** Design options each frame is drawn with, as the template was. */
const VARIANTS: [string, Partial<QRProps>][] = [
  ["the default look", {}],
  ["plain shapes", { ...PLAIN }],
  ["brand colors", { fgColor: "#1e3a8a", bgColor: "#fef3c7" }],
  ["a see-through background", { bgColor: "transparent" }],
];

const specOf = (style: string): FrameSpec => {
  const spec = getBuiltInFrame(style)?.spec;
  if (!spec) throw new Error(`no built-in frame ${style}`);
  return spec;
};

/**
 * The legacy template's artwork, cropped to the rectangle it filled in its
 * 300 × 300 box: the code drawn at 300 (as the engine drew it for
 * templates) in the template's wrapper.
 */
function legacyArtwork(
  template: LegacyTemplate,
  [x, y, scale]: [number, number, number],
  spec: FrameSpec,
  props: QRProps
): string {
  const code = toSVGString({ ...props, size: 300 });
  const mark = '<g data-code=""></g>';
  const fg = typeof props.fgColor === "string" ? props.fgColor : undefined;
  const bg = typeof props.bgColor === "string" ? props.bgColor : undefined;
  const wrapped = renderToString(
    template.wrapper(
      { type: "g", props: { "data-code": "" }, key: null },
      { fgColor: fg, bgColor: bg },
      { pixelSize: 10, url: props.value }
    )
  ).replace(mark, code);
  const width = spec.artboard.width * scale;
  const height = spec.artboard.height * scale;
  return wrapped.replace(/^<svg[^>]*?>/, (open) =>
    open
      .replace(/\bviewBox="[^"]*"/, `viewBox="${x} ${y} ${width} ${height}"`)
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${height}"`)
  );
}

/** `svg` as a browser draws it (resvg), `width` pixels wide, on white. */
async function rasterize(svg: string, width: number): Promise<RasterImage> {
  const { Resvg } = await import("@resvg/resvg-js");
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#ffffff",
  }).render();
  return {
    data: new Uint8ClampedArray(image.pixels),
    width: image.width,
    height: image.height,
  };
}

describe("the former templates are built-in frames", () => {
  it("lists all six, named as the templates were", () => {
    const styles = BUILT_IN_FRAMES.map((frame) => frame.style);
    for (const [style, name] of Object.entries(NAMES)) {
      expect(styles).toContain(style);
      expect(getBuiltInFrame(style)?.name).toBe(name);
    }
  });

  it.each(Object.keys(NAMES))("%s draws a valid frame spec", (style) => {
    const result = frameSpecSchema.safeParse(specOf(style));
    expect(result.error?.issues ?? []).toEqual([]);
  });
});

describe.each(SPEC_TEMPLATES)("%s → %s", (_id, style, legacy, at) => {
  const spec = specOf(style);

  test.each(VARIANTS)(
    "draws the template's artwork (%s)",
    async (_name, extra) => {
      const base: QRProps = { value: VALUE, level: "M", ...extra };
      // The artwork takes the code's dark color, as the template's did
      const color =
        typeof extra.fgColor === "string" ? extra.fgColor : undefined;
      const framed = renderSvg({
        ...base,
        size: 256,
        frame: { style: style as "arrow", ...(color && { color }) },
      } as QRProps);
      const before = legacyArtwork(legacy, at, spec, base);
      // The frame adds the artwork around the code at its full size
      const { width, height } = getFrameDimensions(256, {
        style: style as "arrow",
      });
      expect(width / height).toBeCloseTo(
        spec.artboard.width / spec.artboard.height,
        3
      );
      const px = Math.round(width * 2);
      const diff = compareImages(
        await rasterize(before, px),
        await rasterize(framed, px)
      );
      expect(
        diff.differing,
        `${(diff.differing * 100).toFixed(3)}% of pixels differ`
      ).toBeLessThan(0.002);
      expect(diff.mean).toBeLessThan(1);
    }
  );
});

// ── Dot Ring ──────────────────────────────────────────────────────────────

/** The template's table of dot centers, in its order. */
const TABLE: [number, number][] = JSON.parse(
  readFileSync(new URL("./fixtures/dot-ring.json", import.meta.url), "utf8")
);

/** The Dot Ring template's pick of dots for a link (its seeded shuffle). */
function templatePick(
  url: string,
  count: number,
  keep: (dot: [number, number]) => boolean = () => true
): [number, number][] {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = hash * 32 - hash + url.charCodeAt(i);
    hash %= 2_147_483_647;
  }
  let state = Math.abs(hash);
  const random = () => {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
  const shuffled = TABLE.map((_, index) => index);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as number, shuffled[i] as number];
  }
  return shuffled
    .filter((index) => keep(TABLE[index] as [number, number]))
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((index) => TABLE[index] as [number, number]);
}

/** How far a dot is from the code's edge, in the 593-unit drawing. */
const awayFromCode = ([cx, cy]: [number, number]) =>
  Math.max(146.5 - cx, cx - 446.5, 146.5 - cy, cy - 446.5);

const URLS = {
  short: "https://qrdx.dev/q/x",
  typical: "https://example.com/card?id=12345&src=print",
  query:
    "https://example.com/card?id=12345&utm_source=print&utm_medium=poster&utm_campaign=winter-launch-2026&ref=store-front",
} as const;
const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
/** Pixels per module on a phone's sensor: small, medium and close. */
const MODULE_PX = [4, 6, 9] as const;

const modulesOf = (value: string, level: ErrorLevel) =>
  qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]).size;

/** The code in the dot ring frame as a phone sees it, decoded. */
function capture(props: QRProps, modulePx: number) {
  const level = props.level ?? "Q";
  const codeWidth = modulesOf(props.value, level) * modulePx;
  const image = rasterizeSvg(renderSvg({ ...props, size: 300 }), {
    width: Math.round((codeWidth * 593) / 300),
    pad: 4 * modulePx,
  });
  return decodeQR(simulateCamera(image, modulePx));
}

describe("dot-ring", () => {
  const spec = specOf("dot-ring");

  it("keeps the template's 593-unit drawing: the code in the middle, the ring round it", () => {
    expect(spec.artboard).toEqual({ width: 593, height: 593 });
    expect(spec.qr).toMatchObject({ x: 146.5, y: 146.5, size: 300 });
    expect(spec.shapes).toContainEqual({
      type: "circle",
      cx: 296.5,
      cy: 296.5,
      r: 296.5,
      hole: 231.228,
      fill: "frame",
    });
    // The whole artwork is the template's: the code's share of it is the same
    const { width } = getFrameDimensions(300, { style: "dot-ring" });
    expect(width).toBeCloseTo(593, 6);
  });

  it("draws dots from the template's own table, as its design picks them", () => {
    const path = spec.shapes.find(
      (shape) => shape.type === "path" && shape.fill === "frame"
    );
    const d = path?.type === "path" ? path.d : "";
    const dots = [...d.matchAll(/M([\d.]+) ([\d.]+)a([\d.]+)/g)].map(
      ([, x, y, r]) => [Number(x) + Number(r), Number(y)]
    );
    // As many as the frame spec's segment budget takes, in the template's
    // order for one link, leaving out the few right against the code (some
    // eye shapes don't read with a dot touching them); every one of them is
    // among the template's 240 for that link
    expect(dots).toHaveLength(219);
    const pick = templatePick(
      "https://qrdx.dev",
      219,
      (dot) => awayFromCode(dot) >= 8
    );
    expect(dots.map(([x, y]) => [x?.toFixed(2), y?.toFixed(2)])).toEqual(
      pick.map(([x, y]) => [x.toFixed(2), y.toFixed(2)])
    );
    const all = new Set(templatePick("https://qrdx.dev", 240).map(String));
    for (const dot of pick) expect(all.has(String(dot))).toBe(true);
  });

  it("says Scan the QR code over the top and along the bottom by default", () => {
    const markup = toSVGString({ value: VALUE, frame: { style: "dot-ring" } });
    const letters = [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
      .map(([, char]) => char)
      .join("");
    expect(letters.replaceAll(" ", "")).toBe("ScantheQRcode".repeat(2));
  });

  it("shows the frame's text over the top, and the second line only when asked", () => {
    const letters = (frame: QRProps["frame"]) =>
      [
        ...toSVGString({ value: VALUE, frame }).matchAll(
          /<text[^>]*>([^<]*)<\/text>/g
        ),
      ]
        .map(([, char]) => char)
        .join("")
        .replaceAll(" ", "");
    expect(
      letters({ style: "dot-ring", text: "Visit qrdx.dev", secondaryText: "" })
    ).toBe("Visitqrdx.dev");
    expect(
      letters({ style: "dot-ring", text: "Menu", secondaryText: "Order here" })
    ).toBe("MenuOrderhere");
  });

  describe("scans", () => {
    for (const [name, value] of Object.entries(URLS)) {
      it.each(LEVELS)(`${name} link at level %s`, (level) => {
        const props: QRProps = { value, level, frame: { style: "dot-ring" } };
        // The template cleared the dots next to a code over 49 modules
        // across; the frame's dots are the same for every code, so a dense
        // one reads from 6 px a module (its scan score is the template's)
        const sizes =
          modulesOf(value, level) > 49 ? MODULE_PX.slice(1) : MODULE_PX;
        const misses = sizes.filter(
          (modulePx) => capture(props, modulePx) !== value
        );
        expect(misses, `missed at ${misses.join(", ")} px per module`).toEqual(
          []
        );
      });
    }
  });
});

// ── Template props at run time ────────────────────────────────────────────

const OLD_IDS = [
  "default",
  "Arrow",
  "StandardBox",
  "SquareBorder",
  "StrikedBox",
  "Halloween",
  "DotRing",
  "FlamQR",
  "unknown",
];

const legacyProps = (templateId: string) =>
  ({
    templateId,
    customTemplate: LegacyArrow,
    customProps: { customText: "Scan me" },
  }) as unknown as Partial<QRProps>;

describe("template props passed at run time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(OLD_IDS)("templateId %s draws the code without it", (id) => {
    const plain = toSVGString({ value: VALUE });
    expect(toSVGString({ value: VALUE, ...legacyProps(id) })).toBe(plain);
    const framed = { value: VALUE, frame: { style: "banner-bottom" as const } };
    expect(toSVGString({ ...framed, ...legacyProps(id) })).toBe(
      toSVGString(framed)
    );
  });

  it("never reach React's <svg>, and React has nothing to warn about", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const svg = renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value: VALUE,
        ...legacyProps("Arrow"),
      } as QRProps)
    );
    const code = renderToStaticMarkup(
      createElement(QRCode, {
        value: VALUE,
        ...legacyProps("DotRing"),
      } as QRProps)
    );
    expect(svg).toBe(
      renderToStaticMarkup(createElement(QRCodeSVG, { value: VALUE }))
    );
    expect(code).toBe(
      renderToStaticMarkup(createElement(QRCode, { value: VALUE }))
    );
    for (const markup of [svg, code]) {
      expect(markup.toLowerCase()).not.toContain("template");
      expect(markup.toLowerCase()).not.toContain("customprops");
    }
    expect(error).not.toHaveBeenCalled();
  });

  it("are dropped in their attribute spellings too", () => {
    const attrs = {
      "template-id": "Arrow",
      "custom-template": "x",
      "custom-props": "{}",
      templateid: "Arrow",
    } as unknown as Partial<QRProps>;
    expect(toSVGString({ value: VALUE, ...attrs })).toBe(
      toSVGString({ value: VALUE })
    );
  });
});
