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
  eyeShapeOf,
  getBgRadiusLimit,
  getEyeStyleRisk,
  getHaloRisk,
  HALO_SEE_THROUGH_BLOCKED_BODIES,
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
/** A light page a see-through code still reads on (its light modules show it). */
const LIGHT_PAGE = "#d1d5db";

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
    expect(resolveHalo({})).toEqual({ color: "#ffffff", width: 0.25 });
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
      "the widest halo, see-through background on a light grey page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bgColor: "transparent",
          halo: { width: HALO_WIDTH_MAX },
        }),
      LIGHT_PAGE,
    ],
    [
      "a tinted halo, see-through background on a light grey page",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bgColor: "transparent",
          halo: { width: 0.3, color: "#fef3c7" },
        }),
      LIGHT_PAGE,
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

// A halo is a look, not a quiet zone or a background: a see-through code
// on a dark page doesn't read with or without one (its light modules show
// the page), and on a dim grey page the rims make the thinnest dot shapes
// (diamond, small-square, random-dots) harder to read at phone distances
// (measured 20 Nov 2026; the docs say to give such a code a background).
// On the surfaces the scan score models (white paper, light pages) a halo
// never costs a decode: every dot shape at the widest halo.
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
    it(`${body} dots, halo on white and see-through on a light page`, () => {
      const halo = { width: HALO_WIDTH_MAX };
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
            bgColor: "transparent",
            halo,
          }),
          LIGHT_PAGE
        ),
        "px per module that failed on a light page"
      ).toEqual([]);
    });
  }
});

// The halo rule (looks.ts getHaloRisk): on a see-through background the
// halo is refused for HALO_SEE_THROUGH_BLOCKED_BODIES, the shapes a halo
// made unreadable on a mid-grey page in the decode matrix (every width
// 0.1 to 0.5, pages white, #d1d5db, #9ca3af and #1f2937, 4/6/9 px per
// module, 20 Nov 2026). The matrix below keeps the rule complete: every
// other shape is no worse with a halo than without, at every width, on
// every page tone where a see-through code reads at all.
describe("a halo on a see-through background", () => {
  const DIM_PAGE = "#9ca3af";
  const WIDTHS = [0.1, 0.2, 0.3, 0.4, 0.5];
  const seeThrough = (body: QRProps["bodyPattern"], halo?: QRProps["halo"]) =>
    editorProps({
      value: VALUE,
      level: "M",
      bodyPattern: body,
      bgColor: "transparent",
      ...(halo && { halo }),
    });

  it("tells a see-through background from an opaque one", () => {
    expect(isSeeThroughBackground("transparent")).toBe(true);
    expect(isSeeThroughBackground("#ffffff80")).toBe(true);
    expect(isSeeThroughBackground("rgba(255,255,255,0)")).toBe(true);
    expect(isSeeThroughBackground(undefined)).toBe(false);
    expect(isSeeThroughBackground("#ffffff")).toBe(false);
    expect(isSeeThroughBackground(gradient)).toBe(false);
  });

  it("refuses the halo for the blocked dot shapes only, and only see-through", () => {
    for (const body of HALO_SEE_THROUGH_BLOCKED_BODIES) {
      const props = seeThrough(body, { width: 0.3 });
      expect(getHaloRisk(props)?.message, body).toContain(`${body} dots`);
      expect(resolveHalo(props.halo, props), body).toBeNull();
      // Drawn exactly as without a halo
      expect(renderSvg(props), body).toBe(renderSvg(seeThrough(body)));
      // An opaque background takes it
      const opaque = { ...props, bgColor: "#ffffff" };
      expect(getHaloRisk(opaque), body).toBeNull();
      expect(renderSvg(opaque), body).toContain('data-qrdx-look="halo"');
    }
    expect(getHaloRisk(seeThrough("circle", {}))).toBeNull();
    expect(getHaloRisk(seeThrough("diamond"))).toBeNull();
    expect(renderSvg(seeThrough("rounded", {}))).toContain(
      'data-qrdx-look="halo"'
    );
  });

  for (const body of BODY_PATTERN) {
    if (HALO_SEE_THROUGH_BLOCKED_BODIES.includes(body)) {
      continue;
    }
    it(`${body} dots read no worse with any halo on a dim page`, () => {
      const without = unreadable(seeThrough(body), DIM_PAGE);
      for (const width of WIDTHS) {
        const worse = unreadable(seeThrough(body, { width }), DIM_PAGE).filter(
          (px) => !without.includes(px)
        );
        expect(worse, `width ${width}: px per module that got worse`).toEqual(
          []
        );
      }
    });
  }
});

describe("a halo through a real rasteriser", () => {
  // The decode tests' own rasteriser strokes with butt caps and no joins;
  // resvg draws the rim as a browser does (round joins and caps)
  it("decodes at 6 px per module with resvg", async () => {
    const { Resvg } = await import("@resvg/resvg-js");
    const props = editorProps({
      value: VALUE,
      level: "M",
      bodyPattern: "rounded",
      bgColor: "transparent",
      halo: { width: HALO_WIDTH_MAX },
    });
    const modules = symbolSize(VALUE, "M") + 8;
    const image = new Resvg(renderSvg(props), {
      fitTo: { mode: "width", value: modules * 6 },
      background: LIGHT_PAGE,
    }).render();
    const pixels = new Uint8ClampedArray(image.pixels);
    expect(
      decodeQR({ data: pixels, width: image.width, height: image.height })
    ).toBe(VALUE);
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

  it("counts a dark halo against the contrast", () => {
    const fine = getScanContrast(
      editorProps({ value: VALUE, level: "M", halo: { color: "#ffffff" } })
    );
    const dark = getScanContrast(
      editorProps({ value: VALUE, level: "M", halo: { color: "#333333" } })
    );
    expect(fine.ratio).toBeGreaterThan(7);
    expect(dark.ratio).toBeLessThan(2);
  });

  it("fails the halo check on a see-through background with a blocked dot shape", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "diamond",
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
