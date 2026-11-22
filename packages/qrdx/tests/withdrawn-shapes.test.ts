// Shapes offered on staging builds after 0.0.57 and withdrawn before release
// (types/constants.ts WITHDRAWN_*): a saved design, link or API call that
// still names one parses and draws as the shape it maps to, and never throws.
import { describe, expect, it, it as test } from "vitest";
import { getStylePairRisk } from "../src/scan-risk";
import {
  WITHDRAWN_BODY_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
} from "../types/constants";
import {
  CORNER_EYE_DOT_PATTERNS,
  cornerEyeDotPatternSchema,
  pickableCornerEyeDotPatternSchema,
} from "../types/corner-dot";
import {
  CORNER_EYE_PATTERNS,
  cornerEyePatternSchema,
  pickableCornerEyePatternSchema,
} from "../types/corner-eye";
import { BODY_PATTERN, bodyPatternSchema } from "../types/image-pattern";
import { qrPropsSchema } from "../types/qr";
import { renderSvg } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

const cases = [
  ...Object.entries(WITHDRAWN_BODY_PATTERNS).map(
    ([id, fallback]) => ["bodyPattern", id, fallback] as const
  ),
  ...Object.entries(WITHDRAWN_CORNER_EYE_PATTERNS).map(
    ([id, fallback]) => ["cornerEyePattern", id, fallback] as const
  ),
  ...Object.entries(WITHDRAWN_CORNER_EYE_DOT_PATTERNS).map(
    ([id, fallback]) => ["cornerEyeDotPattern", id, fallback] as const
  ),
];

test("lists the shapes withdrawn before release", () => {
  expect(WITHDRAWN_BODY_PATTERNS).toEqual({
    x: "plus",
    pebble: "rounded",
    flower: "circle",
    beads: "circle",
    bubble: "circle",
    chain: "circle",
    petal: "leaf",
    drop: "rounded",
    squircle: "rounded",
  });
  expect(WITHDRAWN_CORNER_EYE_PATTERNS).toEqual({
    pebble: "squircle",
    tag: "rounded",
    crest: "shield",
    doodle: "squircle",
    stamp: "notch",
  });
  expect(WITHDRAWN_CORNER_EYE_DOT_PATTERNS).toEqual({
    bevel: "square",
    notch: "square",
  });
});

describe("a withdrawn id", () => {
  it.each(cases)("%s %s is no longer offered", (key, id) => {
    const offered: readonly string[] =
      key === "bodyPattern"
        ? BODY_PATTERN
        : key === "cornerEyePattern"
          ? CORNER_EYE_PATTERNS
          : CORNER_EYE_DOT_PATTERNS;
    expect(offered).not.toContain(id);
  });

  it.each(cases)("%s %s parses as %s", (key, id, fallback) => {
    const schemas =
      key === "bodyPattern"
        ? [bodyPatternSchema]
        : key === "cornerEyePattern"
          ? [cornerEyePatternSchema, pickableCornerEyePatternSchema]
          : [cornerEyeDotPatternSchema, pickableCornerEyeDotPatternSchema];
    for (const schema of schemas) {
      expect(schema.parse(id)).toBe(fallback);
    }
    expect(qrPropsSchema.parse({ value: VALUE, [key]: id })[key]).toBe(
      fallback
    );
  });

  it.each(cases)("%s %s draws exactly as %s", (key, id, fallback) => {
    const drawn = (pattern: string) =>
      renderSvg({ value: VALUE, size: 256, [key]: pattern } as never);
    expect(drawn(id)).toBe(drawn(fallback));
  });

  it.each(cases)("%s %s is judged as %s", (key, id, fallback) => {
    expect(getStylePairRisk({ [key]: id } as never)).toEqual(
      getStylePairRisk({ [key]: fallback } as never)
    );
  });
});

test("a withdrawn id in one eye's own shapes draws as the shape it maps to", () => {
  const drawn = (outer: string, inner: string) =>
    renderSvg({
      value: VALUE,
      size: 256,
      eyeShapes: { "top-left": { outer, inner } },
    } as never);
  expect(drawn("stamp", "notch")).toBe(drawn("notch", "square"));
});

test("unknown ids still fail to parse", () => {
  expect(bodyPatternSchema.safeParse("nope").success).toBe(false);
  expect(cornerEyePatternSchema.safeParse("nope").success).toBe(false);
  expect(cornerEyeDotPatternSchema.safeParse("nope").success).toBe(false);
});
