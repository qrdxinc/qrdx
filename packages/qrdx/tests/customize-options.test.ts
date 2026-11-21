/** biome-ignore-all lint/style/noMagicNumbers: layout numbers under test */
// The looks around the code's shapes (src/looks.ts): per-eye shapes
// (eyeShapes), the eyes' gradient span (eyeGradient), the background's
// corner radius and backdrop (bgRadius, backdrop), the halo and the shadow.
// Each decodes at three phone distances at its widest setting, draws the
// same without it as before, reaches every export, and is judged by the
// scan score. Nothing here may be loosened: a look that stops decoding is
// redesigned or dropped, never allowed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQRAsEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import {
  clampBgRadius,
  colorAlpha,
  eyeShapeOf,
  getBgRadiusLimit,
  getEyeStyleRisk,
  getHaloRisk,
  isSeeThroughBackground,
  resolveHalo,
  resolveShadow,
  weakestEyePattern,
} from "../src/looks";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { getQRCodeSVGProps, resolveQRCodeProps } from "../src/qr-code-props";
import { getScanContrast, getScanScore } from "../src/scan-score";
import type { QRProps } from "../types";
import {
  BG_RADIUS_MAX,
  BG_RADIUS_QUIET_RATIO,
  HALO_COLOR_DEFAULT,
  HALO_LIGHT_MIN,
  HALO_WIDTH_MAX,
  SHADOW_OFFSET_MAX,
  SHADOW_OPACITY_MAX,
} from "../types/constants";
import { BODY_PATTERN } from "../types/image-pattern";
import { qrPropsSchema } from "../types/qr";
import { installFakeDom } from "./support/fake-dom";
import {
  channelDistance,
  type RGB,
  rasterizeEps,
  rasterizePdf,
  readPdf,
} from "./support/print-raster";
import {
  capture,
  PHONE_MODULE_SIZES,
  renderSvg,
  symbolSize,
} from "./support/qr";
import { decodeQR } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
const DARK_PAGE = "#1f2937";

/** QRProps the way the editor builds them (getQRData + the rest). */
function editorProps(
  extra: Parameters<typeof getQRData>[0] & Partial<QRProps>
): QRProps {
  return {
    ...getQRData({ size: 256, margin: 4, ...extra }),
    level: extra.level,
    cornerEyePattern: extra.cornerEyePattern ?? "square",
    cornerEyeDotPattern: extra.cornerEyeDotPattern ?? "square",
  };
}

/** Pixels per module that fail to decode through the camera model. */
const unreadable = (props: QRProps, page?: string) =>
  PHONE_MODULE_SIZES.filter(
    (modulePx) => capture(props, { modulePx, page }) !== props.value
  );

const gradient = {
  type: "linear" as const,
  angle: 45,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#db2777", offset: 100 },
  ],
};

describe("defaults draw exactly as before", () => {
  const plain = editorProps({ value: VALUE, level: "M" });
  const before = renderSvg(plain);

  it("with the looks unset, empty or at their off values", () => {
    expect(
      renderSvg({
        ...plain,
        eyeShapes: {},
        eyeGradient: "corner",
        bgRadius: 0,
        backdrop: "#ff0000",
        halo: undefined,
        shadow: undefined,
      })
    ).toBe(before);
  });

  it("a backdrop alone draws nothing: it needs a rounded corner", () => {
    expect(renderSvg({ ...plain, backdrop: "#ff0000" })).toBe(before);
  });

  it("a shadow that wouldn't move draws nothing", () => {
    expect(renderSvg({ ...plain, shadow: { dx: 0, dy: 0 } })).toBe(before);
  });

  it("a rounded corner needs a margin, so a code without one stays square", () => {
    const tight = editorProps({ value: VALUE, level: "M", margin: 0 });
    expect(renderSvg({ ...tight, bgRadius: 0.3, backdrop: "#ff0000" })).toBe(
      renderSvg(tight)
    );
  });
});

describe("looks.ts helpers", () => {
  it("eyeShapeOf: an eye's own shapes, else the code's, else the defaults", () => {
    const props = {
      cornerEyePattern: "rounded" as const,
      cornerEyeDotPattern: "square" as const,
      eyeShapes: { topRight: { outer: "leaf" as const } },
    };
    expect(eyeShapeOf(props, "topLeft")).toEqual({
      outer: "rounded",
      inner: "square",
    });
    expect(eyeShapeOf(props, "topRight")).toEqual({
      outer: "leaf",
      inner: "square",
    });
    expect(eyeShapeOf({}, "bottomLeft")).toEqual({
      outer: "gear",
      inner: "circle",
    });
  });

  it("weakestEyePattern: one circle or curly eye counts for all three", () => {
    expect(weakestEyePattern({ cornerEyePattern: "rounded" })).toBe("rounded");
    expect(
      weakestEyePattern({
        cornerEyePattern: "rounded",
        eyeShapes: { bottomLeft: { outer: "circle" } },
      })
    ).toBe("circle");
    expect(
      weakestEyePattern({
        cornerEyePattern: "circle",
        eyeShapes: { bottomLeft: { outer: "curly" } },
      })
    ).toBe("curly");
  });

  it("getEyeStyleRisk: the worst pair across the eyes wins", () => {
    expect(
      getEyeStyleRisk({
        bodyPattern: "circle",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "square",
      })
    ).toBeNull();
    // One eye with a diamond centre in a square frame: a pair decoders miss
    const risk = getEyeStyleRisk({
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "square",
      eyeShapes: { topRight: { outer: "square", inner: "diamond" } },
    });
    expect(risk?.kind).toBe("dot-eye");
    // A sharp-render warning on one eye and a weak centre on another: the
    // weak centre (worse) is reported
    const mixed = getEyeStyleRisk({
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      eyeShapes: {
        topLeft: { outer: "rounded" },
        bottomLeft: { outer: "gear", inner: "star" },
      },
    });
    expect(mixed?.kind).toBe("dot");
  });

  it("keeps a sharp-render pair over a weak eye on another eye", () => {
    // Rounded eyes with circle centres warn in sharp renders; one circle
    // eye must not hide that warning behind the eye-shape check's own
    expect(
      getEyeStyleRisk({
        bodyPattern: "circle",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "circle",
        eyeShapes: { topLeft: { outer: "circle" } },
      })?.kind
    ).toBe("sharp-dot-eye");
  });

  it("treats a value that isn't a finite number as unset", () => {
    expect(resolveHalo({ width: Number.NaN })?.width).toBe(0.25);
    expect(
      resolveShadow({ dx: Number.NaN, dy: Number.POSITIVE_INFINITY })
    ).toEqual({
      color: "#000000",
      opacity: 0.3,
      dx: 0.2,
      dy: 0.2,
    });
    expect(clampBgRadius(Number.NaN, 25, 4)).toBe(0);
    expect(
      renderSvg({ value: VALUE, halo: { width: Number.NaN } })
    ).not.toContain("NaN");
  });

  it("draws the halo opaque, so the print PDF's per-shape painting matches", () => {
    expect(resolveHalo({ color: "#ffffff80" })?.color).toBe("#ffffff");
    expect(resolveHalo({ color: "rgba(253, 230, 138, 0.5)" })?.color).toBe(
      "#fde68a"
    );
    const svg = renderSvg({
      value: VALUE,
      margin: 4,
      halo: { color: "#ffffff80" },
    });
    expect(svg).toContain(
      'data-qrdx-look="halo" fill="#ffffff" stroke="#ffffff"'
    );
  });

  it("clampBgRadius: capped at BG_RADIUS_MAX and by the quiet zone", () => {
    expect(clampBgRadius(undefined, 25, 4)).toBe(0);
    expect(clampBgRadius(0.3, 25, 0)).toBe(0);
    expect(clampBgRadius(0.3, 25, 4, "circle")).toBe(0);
    // 2 × 4 margin modules of 33 across: 0.2424 of the width
    expect(clampBgRadius(0.3, 25, 4)).toBeCloseTo(
      (BG_RADIUS_QUIET_RATIO * 4) / 33
    );
    expect(clampBgRadius(0.1, 25, 4)).toBe(0.1);
    expect(clampBgRadius(0.9, 25, 40)).toBe(BG_RADIUS_MAX);
  });

  it("getBgRadiusLimit: what the editor's slider can offer", () => {
    const modules = symbolSize(VALUE, "M");
    expect(
      getBgRadiusLimit({ value: VALUE, level: "M", margin: 4 })
    ).toBeCloseTo(Math.min(BG_RADIUS_MAX, 8 / (modules + 8)));
    expect(getBgRadiusLimit({ value: VALUE, level: "M", margin: 0 })).toBe(0);
    expect(
      getBgRadiusLimit({ value: VALUE, level: "M", margin: 4, shape: "heart" })
    ).toBe(0);
  });

  it("resolveHalo and resolveShadow fill defaults and keep values in range", () => {
    expect(resolveHalo(undefined)).toBeNull();
    expect(resolveHalo({})).toEqual({ color: HALO_COLOR_DEFAULT, width: 0.25 });
    expect(resolveHalo({ width: 3, color: "#fde68a" })).toEqual({
      color: "#fde68a",
      width: HALO_WIDTH_MAX,
    });
    expect(resolveShadow(undefined)).toBeNull();
    expect(resolveShadow({})).toEqual({
      color: "#000000",
      opacity: 0.3,
      dx: 0.2,
      dy: 0.2,
    });
    expect(resolveShadow({ dx: 2, dy: -2, opacity: 1 })).toEqual({
      color: "#000000",
      opacity: SHADOW_OPACITY_MAX,
      dx: SHADOW_OFFSET_MAX,
      dy: -SHADOW_OFFSET_MAX,
    });
  });

  it("the schema refuses values outside each range", () => {
    const base = { value: VALUE };
    expect(qrPropsSchema.safeParse({ ...base, bgRadius: 0.5 }).success).toBe(
      true
    );
    expect(qrPropsSchema.safeParse({ ...base, bgRadius: 0.6 }).success).toBe(
      false
    );
    expect(
      qrPropsSchema.safeParse({ ...base, halo: { width: 0.6 } }).success
    ).toBe(false);
    expect(
      qrPropsSchema.safeParse({ ...base, shadow: { dx: 0.4 } }).success
    ).toBe(false);
    expect(
      qrPropsSchema.safeParse({ ...base, shadow: { opacity: 0.05 } }).success
    ).toBe(false);
    expect(
      qrPropsSchema.safeParse({ ...base, eyeGradient: "whole" }).success
    ).toBe(false);
    expect(
      qrPropsSchema.safeParse({
        ...base,
        eyeShapes: { topLeft: { outer: "leaf", inner: "dots" } },
      }).success
    ).toBe(true);
    expect(
      qrPropsSchema.safeParse({
        ...base,
        eyeShapes: { topLeft: { outer: "blob" } },
      }).success
    ).toBe(false);
  });

  it("getQRData and resolveQRCodeProps carry every look through", () => {
    const looks = {
      eyeShapes: { topLeft: { outer: "leaf" as const } },
      eyeGradient: "code" as const,
      bgRadius: 0.2,
      backdrop: "#0f172a",
      halo: { width: 0.3 },
      shadow: { dx: 0.1, dy: 0.1 },
    };
    expect(getQRData({ value: VALUE, ...looks })).toMatchObject(looks);
    expect(
      getQRData({ value: VALUE, eyeGradient: "corner" })
    ).not.toHaveProperty("eyeGradient");
    expect(resolveQRCodeProps({ value: VALUE, ...looks })).toMatchObject(looks);
    expect(
      getQRCodeSVGProps({ value: VALUE }, getQRData({ value: VALUE }))
    ).not.toHaveProperty("halo");
  });
});

describe("each look decodes at three phone distances", () => {
  const cases: [string, () => QRProps, string?][] = [
    [
      "three eyes, three shapes",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          cornerEyePattern: "rounded",
          cornerEyeDotPattern: "rounded",
          eyeShapes: {
            topLeft: { outer: "leaf", inner: "leaf" },
            topRight: { outer: "squircle", inner: "circle" },
            bottomLeft: { outer: "gear", inner: "dots" },
          },
        }),
    ],
    [
      "eyes continuing the dots' gradient",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          fgColor: gradient,
          eyeColor: gradient,
          dotColor: gradient,
          eyeGradient: "code",
        }),
    ],
    [
      "the widest rounded corners on a dark backdrop, dark page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bgRadius: BG_RADIUS_MAX,
          backdrop: DARK_PAGE,
        }),
      DARK_PAGE,
    ],
    [
      "rounded corners with one module of margin, dark page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          margin: 1,
          bgRadius: BG_RADIUS_MAX,
          backdrop: DARK_PAGE,
        }),
      DARK_PAGE,
    ],
    [
      "rounded corners with two modules of margin, dark backdrop, dark page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          margin: 2,
          bgRadius: BG_RADIUS_MAX,
          backdrop: DARK_PAGE,
        }),
      DARK_PAGE,
    ],
    [
      "the widest halo on white",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          halo: { width: HALO_WIDTH_MAX },
        }),
    ],
    [
      "the widest halo in the darkest rim it takes, on white",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          halo: { width: HALO_WIDTH_MAX, color: HALO_LIGHT_MIN },
        }),
    ],
    [
      "a tinted halo at the widest, on white",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          halo: { width: HALO_WIDTH_MAX, color: "#fde68a" },
        }),
    ],
    [
      "a halo under a rounded background on a dark page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bgRadius: 0.2,
          backdrop: DARK_PAGE,
          halo: { width: HALO_WIDTH_MAX },
        }),
      DARK_PAGE,
    ],
    [
      "the strongest shadow, dark blue, down and right",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          shadow: {
            dx: SHADOW_OFFSET_MAX,
            dy: SHADOW_OFFSET_MAX,
            opacity: SHADOW_OPACITY_MAX,
            color: "#1e3a8a",
          },
        }),
    ],
    [
      "the strongest shadow, up and left, on a logo code",
      () =>
        editorProps({
          value: VALUE,
          level: "H",
          bodyPattern: "rounded",
          shadow: {
            dx: -SHADOW_OFFSET_MAX,
            dy: -SHADOW_OFFSET_MAX,
            opacity: SHADOW_OPACITY_MAX,
          },
        }),
    ],
    [
      "every look at once",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bodyPattern: "rounded",
          fgColor: gradient,
          eyeColor: gradient,
          dotColor: gradient,
          eyeGradient: "code",
          eyeShapes: { topLeft: { outer: "squircle", inner: "squircle" } },
          bgRadius: 0.15,
          backdrop: "#0f172a",
          halo: { width: 0.2 },
          shadow: { dx: 0.15, dy: 0.15, opacity: 0.25 },
        }),
      "#0f172a",
    ],
  ];
  for (const [name, props, page] of cases) {
    it(name, () => {
      expect(unreadable(props(), page), "px per module that failed").toEqual(
        []
      );
    });
  }
});

// Where the engine draws a halo (looks.ts getHaloRisk) it never costs a
// decode: every dot shape at the widest halo in the darkest rim it takes,
// on white and on a light grey background, through the camera model.
// halo-decode.test.ts runs the rule's edges through resvg with jsQR and
// ZXing.
describe("the strongest shadow and the widest halo decode with every dot shape", () => {
  for (const body of BODY_PATTERN) {
    it(`${body} dots, shadow`, () => {
      expect(
        unreadable(
          editorProps({
            value: VALUE,
            level: "M",
            bodyPattern: body,
            shadow: {
              dx: SHADOW_OFFSET_MAX,
              dy: SHADOW_OFFSET_MAX,
              opacity: SHADOW_OPACITY_MAX,
            },
          })
        ),
        "px per module that failed"
      ).toEqual([]);
    });
    it(`${body} dots, the widest halo in the darkest rim, on white and on light grey`, () => {
      const halo = { width: HALO_WIDTH_MAX, color: HALO_LIGHT_MIN };
      expect(
        unreadable(
          editorProps({ value: VALUE, level: "M", bodyPattern: body, halo })
        ),
        "px per module that failed on white"
      ).toEqual([]);
      expect(
        unreadable(
          editorProps({
            value: VALUE,
            level: "M",
            bodyPattern: body,
            bgColor: "#e5e7eb",
            halo,
          }),
          "#e5e7eb"
        ),
        "px per module that failed on light grey"
      ).toEqual([]);
    });
  }
});

// The halo rule (looks.ts getHaloRisk): drawn only on an opaque background,
// in a rim at least as light as HALO_LIGHT_MIN and no lighter than the
// background. A rim lighter than what's around the dots makes decoders
// misread light modules (measured 21 Nov 2026: on a grey page under a
// see-through code at every width, and with grey or blue dots as a white
// rim on #d1d5db), so everywhere outside the rule the code is drawn exactly
// as without a halo.
describe("the halo rule", () => {
  const photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const stops = (...colors: string[]) => ({
    type: "linear" as const,
    angle: 0,
    stops: colors.map((color, index) => ({
      color,
      offset: (index * 100) / (colors.length - 1),
    })),
  });
  const withHalo = (bgColor: QRProps["bgColor"], halo: QRProps["halo"] = {}) =>
    editorProps({ value: VALUE, level: "M", bgColor, halo });
  /** Drawn exactly as the same code without a halo. */
  const notDrawn = (props: QRProps) => {
    const { halo: _halo, ...rest } = props;
    return renderSvg(props) === renderSvg(rest);
  };

  // Every form the API's colour check and the engine take (review finding 3)
  const seeThrough: [string, QRProps["bgColor"]][] = [
    ["transparent", "transparent"],
    ["none", "none"],
    ["#rrggbbaa", "#ffffff80"],
    ["#rgba", "#fff0"],
    ["rgba() with commas", "rgba(255,255,255,0)"],
    ["rgb() with a slash and a percentage", "rgb(255 255 255 / 50%)"],
    ["hsla() with commas", "hsla(0,0%,100%,0)"],
    ["hsl() with a slash", "hsl(0 0% 100% / 0)"],
    ["hsl() with a slash and a percentage", "hsl(0 0% 100% / 40%)"],
    [
      "a solid paint in hsla()",
      { type: "solid", color: "hsla(0, 0%, 100%, 0.5)" },
    ],
    [
      "a gradient whose last stop is see-through",
      stops("#ffffff", "#ffffff00"),
    ],
    [
      "a gradient whose middle stop is see-through",
      stops("#ffffff", "hsl(0 0% 100% / 0.2)", "#ffffff"),
    ],
    [
      "a radial gradient",
      { type: "radial", stops: stops("#ffffff", "transparent").stops },
    ],
    [
      "an angular gradient",
      { type: "angular", angle: 0, stops: stops("#ffffff", "none").stops },
    ],
    ["a picture without an underlay", { type: "image", src: photo }],
    [
      "a picture over a see-through underlay",
      { type: "image", src: photo, underlay: "rgba(255,255,255,0.5)" },
    ],
  ];

  it("tells a see-through background from an opaque one, in every form", () => {
    for (const [name, bgColor] of seeThrough) {
      expect(isSeeThroughBackground(bgColor), name).toBe(true);
    }
    const opaque: [string, QRProps["bgColor"]][] = [
      ["no background", undefined],
      ["hex", "#ffffff"],
      ["a name", "white"],
      ["hsl()", "hsl(0 0% 100%)"],
      ["hsla() at full alpha", "hsla(0,0%,100%,1)"],
      ["an opaque gradient", gradient],
      [
        "a picture over an opaque underlay",
        { type: "image", src: photo, underlay: "#ffffff" },
      ],
    ];
    for (const [name, bgColor] of opaque) {
      expect(isSeeThroughBackground(bgColor), name).toBe(false);
    }
  });

  it("reads a color's alpha in every form", () => {
    expect(colorAlpha("none")).toBe(0);
    expect(colorAlpha("transparent")).toBe(0);
    expect(colorAlpha("#ffffff80")).toBeCloseTo(128 / 255);
    expect(colorAlpha("rgb(0 0 0 / 25%)")).toBe(0.25);
    expect(colorAlpha("hsla(0,0%,100%,0.3)")).toBe(0.3);
    expect(colorAlpha("hsl(120 50% 50% / 60%)")).toBe(0.6);
    expect(colorAlpha("hsl(120, 50%, 50%)")).toBe(1);
    expect(colorAlpha("rebeccapurple")).toBe(1);
    expect(colorAlpha(undefined)).toBe(1);
  });

  it("draws no halo on a see-through background, in any form", () => {
    for (const [name, bgColor] of seeThrough) {
      const props = withHalo(bgColor);
      expect(getHaloRisk(props)?.reason, name).toBe("see-through");
      expect(resolveHalo(props.halo, props), name).toBeNull();
      expect(notDrawn(props), name).toBe(true);
    }
  });

  it("draws no halo on a picture, on a dark background, or in a rim outside its range", () => {
    const refused: [string, QRProps, string][] = [
      [
        "a picture over an opaque underlay",
        withHalo({ type: "image", src: photo, underlay: "#ffffff" }),
        "picture",
      ],
      [
        "a background just darker than HALO_LIGHT_MIN",
        withHalo("#d0d4da"),
        "dark-background",
      ],
      [
        "a grey background",
        withHalo("#9ca3af", { color: "#9ca3af" }),
        "dark-background",
      ],
      [
        "a gradient with one dark stop",
        withHalo(stops("#ffffff", "#9ca3af")),
        "dark-background",
      ],
      [
        "a color the engine can't read",
        withHalo("whitesmoke"),
        "dark-background",
      ],
      [
        "a white rim on light grey",
        withHalo("#e5e7eb", { color: "#ffffff" }),
        "rim",
      ],
      [
        "a rim lighter than one gradient stop",
        withHalo(stops("#ffffff", "#e5e7eb"), { color: "#f3f4f6" }),
        "rim",
      ],
      [
        "a rim just darker than HALO_LIGHT_MIN",
        withHalo("#ffffff", { color: "#d0d4da" }),
        "rim",
      ],
      ["a dark rim", withHalo("#ffffff", { color: "#333333" }), "rim"],
      [
        "a dark hsl() rim",
        withHalo("#ffffff", { color: "hsl(0, 0%, 50%)" }),
        "rim",
      ],
    ];
    for (const [name, props, reason] of refused) {
      expect(getHaloRisk(props)?.reason, name).toBe(reason);
      expect(getHaloRisk(props)?.fix, name).toContain("turn the halo off");
      expect(notDrawn(props), name).toBe(true);
    }
  });

  it("draws it in a rim between HALO_LIGHT_MIN and the background", () => {
    const drawn: [string, QRProps][] = [
      ["the default rim on white", withHalo(undefined)],
      [
        "the darkest rim on white",
        withHalo("#ffffff", { color: HALO_LIGHT_MIN }),
      ],
      [
        "the darkest rim on light grey",
        withHalo("#e5e7eb", { color: HALO_LIGHT_MIN }),
      ],
      [
        "a rim as light as the background",
        withHalo("#e5e7eb", { color: "#e5e7eb" }),
      ],
      [
        "the darkest rim on the darkest background",
        withHalo(HALO_LIGHT_MIN, { color: HALO_LIGHT_MIN }),
      ],
      ["a tinted rim on white", withHalo("#ffffff", { color: "#fde68a" })],
      [
        "an hsl() background",
        withHalo("hsl(0 0% 100%)", { color: "hsl(0, 0%, 90%)" }),
      ],
      [
        "a light gradient",
        withHalo(stops("#ffffff", "#e5e7eb"), { color: HALO_LIGHT_MIN }),
      ],
    ];
    for (const [name, props] of drawn) {
      expect(getHaloRisk(props), name).toBeNull();
      expect(renderSvg(props), name).toContain('data-qrdx-look="halo"');
    }
    // A see-through rim is drawn opaque (its alpha is dropped)
    expect(resolveHalo({ color: "hsla(0, 0%, 90%, 0.4)" })?.color).toBe(
      "#e6e6e6"
    );
  });
});

describe("SVG, print PDF and EPS draw them", () => {
  const props = () =>
    editorProps({
      value: VALUE,
      level: "M",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
      eyeShapes: { topRight: { outer: "leaf", inner: "leaf" } },
      bgRadius: 0.2,
      backdrop: "#1e3a8a",
      halo: { width: 0.3, color: "#fde68a" },
      shadow: { dx: 0.2, dy: 0.2, opacity: 0.3, color: "#7c2d12" },
    });

  it("SVG: the backdrop, the rounded background, the halo rim and the shadow", () => {
    const svg = renderSvg(props());
    expect(svg).toContain('data-qrdx-look="backdrop" fill="#1e3a8a"');
    expect(svg).toMatch(/<rect fill="#FFFFFF" height="256" rx="[\d.]+"/);
    expect(svg).toContain('data-qrdx-look="halo" fill="#fde68a"');
    expect(svg).toContain('stroke="#fde68a"');
    expect(svg).toContain(
      'data-qrdx-look="shadow" fill="#7c2d12" opacity="0.3"'
    );
    // The top-right eye is a leaf: its path differs from the two rounded ones
    // (the drawn eyes carry a transform; the halo's and shadow's copies don't)
    const eyes = [
      ...svg.matchAll(/<path d="([^"]+)" fill-rule="evenodd" transform=/g),
    ].map((match) => match[1]);
    expect(eyes).toHaveLength(3);
    expect(eyes[1]).not.toBe(eyes[0]);
    expect(capture(props(), { modulePx: 6, page: "#1e3a8a" })).toBe(VALUE);
  });

  it("eyeGradient 'code' reuses the dots' gradient definition", () => {
    const svg = renderSvg(
      editorProps({
        value: VALUE,
        level: "M",
        fgColor: gradient,
        eyeColor: gradient,
        dotColor: gradient,
        eyeGradient: "code",
      })
    );
    expect(svg.match(/<linearGradient /g)).toHaveLength(1);
    expect(svg.match(/url\(#fg-color-/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("print PDF: decodes, with the backdrop and the shadow painted", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props(), {
      size: 50,
      unit: "mm",
    });
    const rendered = rasterizePdf(buffer, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    const rgb = (hex: string): RGB =>
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
    const painted = (hex: string) =>
      rendered.fills.some((fill) => channelDistance(fill, rgb(hex)) <= 2);
    expect(painted("#1e3a8a"), "backdrop").toBe(true);
    expect(painted("#fde68a"), "halo").toBe(true);
  });

  it("EPS: decodes", async () => {
    const eps = await getQRAsEPS(props(), { sizeMm: 50 });
    const rendered = rasterizeEps(eps, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
  });

  // The SVG strokes the rim with round joins and caps; print's default
  // miter ran it about twice as far out at a star's tips
  it("print PDF and EPS stroke the rim with round joins and caps", async () => {
    const star = editorProps({
      value: VALUE,
      level: "M",
      bodyPattern: "star",
      halo: { width: HALO_WIDTH_MAX, color: HALO_LIGHT_MIN },
    });
    const { halo: _halo, ...plain } = star;
    const content = async (code: QRProps) =>
      readPdf(await getQRAsPrintPDFBuffer(code, { size: 50, unit: "mm" }))
        .content;
    const pdf = await content(star);
    expect(pdf).toMatch(/(^|\s)1 j\s+1 J(\s|$)/);
    // Set back to PDF's defaults after each rim, so other strokes keep them
    expect(pdf).toMatch(/(^|\s)0 j\s+0 J(\s|$)/);
    expect(await content(plain)).not.toMatch(/(^|\s)1 j(\s|$)/);
    const eps = await getQRAsEPS(star, { sizeMm: 50 });
    expect(eps).toContain("gsave 1 setlinejoin 1 setlinecap");
    expect(await getQRAsEPS(plain, { sizeMm: 50 })).not.toContain(
      "setlinejoin"
    );
  });
});

describe("the scan score accounts for them", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("judges a code by its weakest eye", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        cornerEyePattern: "rounded",
        eyeShapes: { bottomLeft: { outer: "circle" } },
      })
    );
    const eye = result.checks.find((check) => check.id === "eye-shape");
    expect(eye?.passed).toBe(false);
    expect(eye?.message).toContain("Circle eyes");
  });

  it("flags a pair decoders miss on one eye", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "circle",
        cornerEyePattern: "rounded",
        eyeShapes: { topRight: { outer: "square", inner: "diamond" } },
      })
    );
    const pair = result.checks.find((check) => check.id === "style-pair");
    expect(pair?.passed).toBe(false);
    expect(pair?.message).toContain("diamond centres in square eyes");
  });

  it("counts the halo's color as a background color", () => {
    const rim = getScanContrast(
      editorProps({ value: VALUE, level: "M", halo: { color: HALO_LIGHT_MIN } })
    );
    const onGrey = getScanContrast(
      editorProps({ value: VALUE, level: "M", bgColor: HALO_LIGHT_MIN })
    );
    expect(rim.ratio).toBeCloseTo(onGrey.ratio);
    // A dark rim isn't drawn, so it costs no contrast
    const dark = getScanContrast(
      editorProps({ value: VALUE, level: "M", halo: { color: "#333333" } })
    );
    expect(dark.ratio).toBeCloseTo(
      getScanContrast(editorProps({ value: VALUE, level: "M" })).ratio
    );
  });

  it("fails the halo check where the halo isn't drawn", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "rounded",
        bgColor: "transparent",
        halo: {},
      })
    );
    const check = result.checks.find((item) => item.id === "halo");
    expect(check?.passed).toBe(false);
    expect(check?.fix).toContain("opaque background");
    const fine = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "diamond",
        halo: {},
      })
    );
    expect(fine.checks.find((item) => item.id === "halo")).toBeUndefined();
  });

  it("grades the strongest looks great", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "rounded",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "rounded",
        eyeShapes: { topLeft: { outer: "squircle", inner: "squircle" } },
        bgRadius: BG_RADIUS_MAX,
        backdrop: "#0f172a",
        halo: { width: HALO_WIDTH_MAX },
        shadow: {
          dx: SHADOW_OFFSET_MAX,
          dy: SHADOW_OFFSET_MAX,
          opacity: SHADOW_OPACITY_MAX,
        },
      })
    );
    expect(result.grade, JSON.stringify(result.checks)).toBe("great");
  });
});
