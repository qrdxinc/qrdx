// The looks added around the code's shapes (feat/more-customization):
// per-eye shapes, the eyes' gradient span, the background's corner radius
// and backdrop, the halo and the shadow. Pure helpers the renderer, the
// scan score and editors share: each option's defaults and caps live here,
// so a value outside its range draws as the nearest one that scans.
import type {
  CornerEyeDotPattern,
  CornerEyePattern,
  EyePosition,
  QRCodeShape,
  QRHalo,
  QRProps,
  QRShadow,
} from "../types";
import { normalizeColorConfig } from "../types/color-helpers";
import {
  BG_RADIUS_MAX,
  BG_RADIUS_QUIET_RATIO,
  EYE_POSITIONS,
  HALO_COLOR_DEFAULT,
  HALO_LIGHT_MIN,
  HALO_WIDTH_DEFAULT,
  HALO_WIDTH_MAX,
  HALO_WIDTH_MIN,
  SHADOW_COLOR_DEFAULT,
  SHADOW_OFFSET_DEFAULT,
  SHADOW_OFFSET_MAX,
  SHADOW_OPACITY_DEFAULT,
  SHADOW_OPACITY_MAX,
  SHADOW_OPACITY_MIN,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
  withdrawnFallback,
} from "../types/constants";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { capImageSettings } from "./logo-budget";
import { isShapedCode } from "./qr-shape";
import { getStylePairRisk, type StylePairRisk } from "./scan-risk";
import { resolveErrorLevel } from "./utils";
import { oklchToRgb, rgbToOklch } from "./utils/oklab";
import { parseColor, type RGBAColor } from "./utils/parse-color";

type EyeShapeProps = Pick<
  QRProps,
  "cornerEyePattern" | "cornerEyeDotPattern" | "eyeShapes"
>;

/** QRCodeSVG's defaults: gear eyes with circle centres. */
const DEFAULT_EYE: CornerEyePattern = "gear";
const DEFAULT_DOT: CornerEyeDotPattern = "circle";

/**
 * The frame (`outer`) and centre (`inner`) drawn at one eye: its own
 * shapes from `eyeShapes`, else the code's `cornerEyePattern` and
 * `cornerEyeDotPattern` (QRCodeSVG's defaults when neither is set).
 */
export function eyeShapeOf(
  props: EyeShapeProps,
  position: EyePosition
): { outer: CornerEyePattern; inner: CornerEyeDotPattern } {
  const own = props.eyeShapes?.[position];
  // A shape withdrawn before release draws as the one it maps to
  return {
    outer: withdrawnFallback(
      WITHDRAWN_CORNER_EYE_PATTERNS,
      own?.outer ?? props.cornerEyePattern ?? DEFAULT_EYE
    ),
    inner: withdrawnFallback(
      WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
      own?.inner ?? props.cornerEyeDotPattern ?? DEFAULT_DOT
    ),
  };
}

/** Eye frames from the most to the least fragile, for the eye-shape check. */
const EYE_FRAGILITY: readonly CornerEyePattern[] = ["curly", "circle"];

/**
 * The most fragile eye frame drawn on the code, per-eye shapes included:
 * `curly` before `circle` before any other (the scan score warns about
 * those two), so a code with one circle eye is judged by it.
 */
export function weakestEyePattern(props: EyeShapeProps): CornerEyePattern {
  const outers = EYE_POSITIONS.map((position) => eyeShapeOf(props, position));
  for (const fragile of EYE_FRAGILITY) {
    if (outers.some((eye) => eye.outer === fragile)) {
      return fragile;
    }
  }
  return outers[0]?.outer ?? DEFAULT_EYE;
}

/**
 * Risk kinds from the one that blocks a pick to the one that only warns.
 * A weak eye on its own comes last: the scan score has its own eye-shape
 * check for it, so a sharp-render pair on another eye still gets reported.
 */
const RISK_SEVERITY: StylePairRisk["kind"][] = [
  "dot-eye",
  "body-eye",
  "dot",
  "sharp-dot-eye",
  "eye",
];

/**
 * `getStylePairRisk` across the three eyes: each eye's frame and centre
 * (per-eye shapes included) is checked with the body, and the worst risk
 * wins (a pair decoders miss before a shape that only warns). Null when
 * every eye pairs well.
 */
export function getEyeStyleRisk(
  props: Pick<QRProps, "bodyPattern"> & EyeShapeProps
): StylePairRisk | null {
  let worst: StylePairRisk | null = null;
  const seen = new Set<string>();
  for (const position of EYE_POSITIONS) {
    const { outer, inner } = eyeShapeOf(props, position);
    const key = `${outer}/${inner}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const risk = getStylePairRisk({
      bodyPattern: props.bodyPattern,
      cornerEyePattern: outer,
      cornerEyeDotPattern: inner,
    });
    if (
      risk &&
      (!worst ||
        RISK_SEVERITY.indexOf(risk.kind) < RISK_SEVERITY.indexOf(worst.kind))
    ) {
      worst = risk;
    }
  }
  return worst;
}

/**
 * The background's corner radius as drawn, as a share of the code's width:
 * `radius` capped at BG_RADIUS_MAX and by the quiet zone, so the arc never
 * reaches the finder rows (at most BG_RADIUS_QUIET_RATIO × `margin`
 * modules of the `modules + 2 × margin` across the artwork). 0 without a
 * margin, and for a shaped code, which has its own outline.
 */
export function clampBgRadius(
  radius: number | undefined,
  modules: number,
  margin: number,
  shape?: QRCodeShape
): number {
  if (
    !(radius && Number.isFinite(radius)) ||
    radius <= 0 ||
    isShapedCode(shape) ||
    margin <= 0
  ) {
    return 0;
  }
  const limit = Math.min(
    BG_RADIUS_MAX,
    (BG_RADIUS_QUIET_RATIO * margin) / (modules + 2 * margin)
  );
  return Math.min(radius, limit);
}

/**
 * The largest `bgRadius` (share of the code's width) this code keeps its
 * quiet zone with, for an editor's slider: 0 when the code has no margin
 * or is shaped. The level is the one the renderer draws at: given the
 * logo (`imageSettings`) and `autoLevel`, the logo is held to its budget
 * first and the level resolved with it after, as createQRCodeTree does.
 */
export function getBgRadiusLimit(
  props: Pick<
    QRProps,
    | "value"
    | "level"
    | "margin"
    | "shape"
    | "size"
    | "autoLevel"
    | "imageSettings"
  > & { isOGContext?: boolean }
): number {
  const { value, level, shape, autoLevel, isOGContext } = props;
  const size = props.size ?? DEFAULT_SIZE;
  const margin = props.margin ?? DEFAULT_MARGIN;
  const imageSettings = capImageSettings(
    { value: `${value}`, size, margin, level, shape, autoLevel, isOGContext },
    props.imageSettings
  );
  const drawn = resolveErrorLevel({
    value: `${value}`,
    size,
    level,
    margin,
    imageSettings,
    isOGContext,
    autoLevel,
    shape,
  });
  const modules = qrcodegen.QrCode.encodeText(
    `${value}`,
    ERROR_LEVEL_MAP[drawn]
  ).size;
  return clampBgRadius(BG_RADIUS_MAX, modules, margin, shape);
}

/** `value` kept between `min` and `max`; anything that isn't a finite number is `fallback`. */
const clamp = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) =>
  Math.min(
    max,
    Math.max(
      min,
      typeof value === "number" && Number.isFinite(value) ? value : fallback
    )
  );

const HSL_COLOR = /^hsla?\(([^)]*)\)$/;
// A number with an optional fraction: the digits before and after a "." can't
// both match the same characters, so "000…0x" fails in linear time (CodeQL
// polynomial-redos)
const HUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:deg)?$/;
/** A CSS number or percentage, in the same linear shape. */
const CSS_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/;

/** A CSS alpha or percentage as 0 to 1 ("50%" is 0.5); NaN when it isn't one. */
function cssShare(text: string | undefined, percentOnly: boolean): number {
  const value = text?.trim() ?? "";
  // parseFloat alone would read "0x" as 0
  if (!CSS_NUMBER.test(value)) {
    return Number.NaN;
  }
  const number = Number.parseFloat(value);
  const share = value.endsWith("%") || percentOnly ? number / 100 : number;
  return Math.min(1, Math.max(0, share));
}

/** hsl()/hsla() as RGBA (comma or space syntax), or null. */
function parseHsl(value: string): RGBAColor | null {
  const hsl = HSL_COLOR.exec(value);
  if (!hsl) {
    return null;
  }
  const [channels = "", slashed] = (hsl[1] ?? "").split("/");
  const parts = channels.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== (slashed === undefined && parts.length === 4 ? 4 : 3)) {
    return null;
  }
  const [hueText = "", saturationText, lightnessText, alphaText] = parts;
  // Saturation and lightness are percentages, with or without the "%"
  const saturation = cssShare(saturationText, true);
  const lightness = cssShare(lightnessText, true);
  const alpha = cssShare(slashed ?? alphaText ?? "1", false);
  const hue = Number.parseFloat(hueText);
  if (
    !(
      HUE.test(hueText) && [saturation, lightness, alpha].every(Number.isFinite)
    )
  ) {
    return null;
  }
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const at = k < 0 ? k + 12 : k;
    return 255 * (lightness - a * Math.max(-1, Math.min(at - 3, 9 - at, 1)));
  };
  return { r: channel(0), g: channel(8), b: channel(4), a: alpha };
}

/**
 * A color as the halo rule reads it: parseColor's forms, hsl()/hsla()
 * (which the API accepts too), and "none", which paints nothing. Null for
 * anything else.
 */
function readColor(color: string | undefined): RGBAColor | null {
  const value = color?.trim().toLowerCase() ?? "";
  if (value === "none") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return parseColor(value) ?? parseHsl(value);
}

/**
 * A color's alpha as it paints, 0 to 1: "none" and "transparent" paint
 * nothing; hex, rgb()/rgba() and hsl()/hsla() (comma or space syntax,
 * alpha as a number or a percentage) read their alpha. Anything else (a
 * color name, or a value no renderer paints, which draws as the inherited
 * fill) is opaque.
 */
export function colorAlpha(color: string | undefined): number {
  return readColor(color)?.a ?? 1;
}

/**
 * True when something under the modules can show through the background:
 * any alpha below 1 anywhere in its paint (the color, any gradient stop),
 * or an image fill without an opaque underlay (the picture itself may be
 * see-through, or faded by its opacity). No background is the default
 * white.
 */
export function isSeeThroughBackground(bgColor: QRProps["bgColor"]): boolean {
  const paint = normalizeColorConfig(bgColor, DEFAULT_BGCOLOR);
  if (paint.type === "solid") {
    return colorAlpha(paint.color) < 1;
  }
  if (paint.type === "image") {
    return colorAlpha(paint.underlay ?? "transparent") < 1;
  }
  return paint.stops.some((stop) => colorAlpha(stop.color) < 1);
}

/**
 * How light a color reads to each decoder, 0 to 255: the two grey
 * conversions they use, Rec. 709 weights (jsQR) and Rec. 601 (ZXing). A
 * saturated color reads differently to each, so the halo rule holds for
 * both.
 */
type Lumas = [rec709: number, rec601: number];
const decoderLumas = ({ r, g, b }: RGBAColor): Lumas => [
  0.2126 * r + 0.7152 * g + 0.0722 * b,
  0.299 * r + 0.587 * g + 0.114 * b,
];

const HALO_LIGHT_LUMAS = decoderLumas(parseColor(HALO_LIGHT_MIN) as RGBAColor);

/** Rounding slack in the halo rule's comparisons. */
const LUMA_SLACK = 1e-9;

/** True when every decoder reads `lumas` between `lower` and `upper`. */
const lumasWithin = (lumas: Lumas, lower: Lumas, upper: Lumas) =>
  lumas.every(
    (luma, decoder) =>
      luma >= lower[decoder] - LUMA_SLACK && luma <= upper[decoder] + LUMA_SLACK
  );

const toHex = ({ r, g, b }: RGBAColor) =>
  `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

/** The rim color as picked: opaque, the default when it can't be read. */
function haloColorOf(halo: QRHalo): string {
  const parsed = readColor(halo.color || HALO_COLOR_DEFAULT);
  return parsed && parsed.a > 0 ? toHex(parsed) : HALO_COLOR_DEFAULT;
}

/** Halvings of the lightness and of the chroma when a rim moves: well past a channel step. */
const FIT_STEPS = 24;
const CHROMA_STEPS = 12;

/**
 * `color` with its lightness moved until every decoder reads it between
 * `lower` and `upper`, as little as it takes: its OKLab hue and chroma are
 * kept (the chroma reduced only where sRGB has no such color, or where no
 * lightness fits both decoders at it). Null when not even a grey fits.
 */
function fitLightness(
  color: RGBAColor,
  lower: Lumas,
  upper: Lumas
): RGBAColor | null {
  if (lumasWithin(decoderLumas(color), lower, upper)) {
    return color;
  }
  if (color.r === color.g && color.g === color.b) {
    // A grey stays a grey: every decoder reads it as its own channel
    const grey = Math.min(
      Math.floor(Math.min(...upper) + LUMA_SLACK),
      Math.max(color.r, Math.ceil(Math.max(...lower) - LUMA_SLACK))
    );
    return grey >= Math.max(...lower) - LUMA_SLACK
      ? { r: grey, g: grey, b: grey, a: 1 }
      : null;
  }
  const start = rgbToOklch(color);
  const atChroma = (c: number) => {
    const here = oklchToRgb({ l: start.l, c, h: start.h });
    const lumas = decoderLumas(here);
    if (lumasWithin(lumas, lower, upper)) {
      return here;
    }
    // Too dark for a decoder: lighten toward white, which clears `lower`;
    // else darken toward black, which clears `upper`
    const lighten = lumas.some((luma, decoder) => luma < lower[decoder]);
    const clears = (rgb: RGBAColor) =>
      decoderLumas(rgb).every((luma, decoder) =>
        lighten
          ? luma >= lower[decoder] - LUMA_SLACK
          : luma <= upper[decoder] + LUMA_SLACK
      );
    // The lightness nearest the color's own that clears the bound it missed
    let missed = start.l;
    let cleared = lighten ? 1 : 0;
    for (let step = 0; step < FIT_STEPS; step++) {
      const l = (missed + cleared) / 2;
      if (clears(oklchToRgb({ l, c, h: start.h }))) {
        cleared = l;
      } else {
        missed = l;
      }
    }
    const rgb = oklchToRgb({ l: cleared, c, h: start.h });
    return lumasWithin(decoderLumas(rgb), lower, upper) ? rgb : null;
  };
  const full = atChroma(start.c);
  if (full) {
    return full;
  }
  // As much of the chroma as still fits
  let best = atChroma(0);
  if (!best) {
    return null;
  }
  let fits = 0;
  let fails = start.c;
  for (let step = 0; step < CHROMA_STEPS; step++) {
    const c = (fits + fails) / 2;
    const rgb = atChroma(c);
    if (rgb) {
      fits = c;
      best = rgb;
    } else {
      fails = c;
    }
  }
  return best;
}

export interface HaloRefusal {
  /** Which part of the design refuses a halo */
  reason: "see-through" | "picture" | "dark-background";
  message: string;
  fix: string;
}

export interface HaloAdjustment {
  /** The rim is drawn, in another color than the one picked */
  reason: "adjusted";
  /** The color the rim is drawn in */
  color: string;
  message: string;
  fix: string;
}

/** Why a halo isn't drawn on a code, or how its color was moved. */
export type HaloRisk = HaloRefusal | HaloAdjustment;

const TURN_OFF = "or turn the halo off";

/**
 * How light a rim may read to each decoder on this background (as light
 * as its darkest color, every gradient stop included), or why no rim is
 * drawn on it: a picture, any see-through paint, or a color darker than
 * HALO_LIGHT_MIN.
 */
function rimCeiling(bgColor: QRProps["bgColor"]): Lumas | HaloRefusal {
  const paint = normalizeColorConfig(bgColor, DEFAULT_BGCOLOR);
  if (paint.type === "image") {
    return {
      reason: "picture",
      message:
        "A halo isn't drawn on a picture background: on the picture's darker parts the rim makes the code unreadable",
      fix: `Use a background color, ${TURN_OFF}`,
    };
  }
  if (isSeeThroughBackground(bgColor)) {
    return {
      reason: "see-through",
      message:
        "A halo needs an opaque background: on a grey surface under a see-through code the rim makes it unreadable",
      fix: `Give the code an opaque background, ${TURN_OFF}`,
    };
  }
  const colors = (
    paint.type === "solid"
      ? [paint.color]
      : paint.stops.map((stop) => stop.color)
  ).map(readColor);
  const ceiling: Lumas = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  for (const color of colors) {
    const lumas = color ? decoderLumas(color) : ([0, 0] as Lumas);
    ceiling[0] = Math.min(ceiling[0], lumas[0]);
    ceiling[1] = Math.min(ceiling[1], lumas[1]);
  }
  if (!lumasWithin(HALO_LIGHT_LUMAS, HALO_LIGHT_LUMAS, ceiling)) {
    return {
      reason: "dark-background",
      message: `A halo needs a light background, at least as light as ${HALO_LIGHT_MIN}: on a darker one the rim makes the code unreadable`,
      fix: `Lighten the background to ${HALO_LIGHT_MIN} or lighter, ${TURN_OFF}`,
    };
  }
  return ceiling;
}

/**
 * The halo's rim on this background: the color it is drawn in, the color
 * picked, or why none is drawn.
 */
function planRim(
  halo: QRHalo,
  bgColor: QRProps["bgColor"]
): { drawn: string; picked: string } | HaloRefusal {
  const ceiling = rimCeiling(bgColor);
  if (!Array.isArray(ceiling)) {
    return ceiling;
  }
  const picked = haloColorOf(halo);
  const fitted = fitLightness(
    parseColor(picked) as RGBAColor,
    HALO_LIGHT_LUMAS,
    ceiling
  );
  // HALO_LIGHT_MIN fits wherever a halo is drawn (rimCeiling)
  return { drawn: fitted ? toHex(fitted) : HALO_LIGHT_MIN, picked };
}

/**
 * The color a halo's rim is drawn in on this background, or null where no
 * halo is drawn (getHaloRisk says why). A rim is drawn only where it was
 * measured never to cost a decode (tests/halo-decode.test.ts): every
 * decoder must read it at least as light as HALO_LIGHT_MIN and no lighter
 * than any background color (the color, every gradient stop). Any color
 * can be picked: one outside that range is drawn in the closest color
 * inside it, its hue and as much of its chroma as fits kept, only its
 * lightness moved (tests/halo-colors-decode.test.ts reads those rims).
 */
export function fitHaloColor(
  color: string | undefined,
  bgColor: QRProps["bgColor"]
): string | null {
  const plan = planRim({ color }, bgColor);
  return "drawn" in plan ? plan.drawn : null;
}

/**
 * Up to `count` tints of `color` a halo draws as they are on this
 * background: its hue at evenly spaced lightness from the darkest rim the
 * rule takes toward the background's own, darkest (the most visible)
 * first. Empty where no halo is drawn.
 */
export function haloTints(
  color: string | undefined,
  bgColor: QRProps["bgColor"],
  count = 4
): string[] {
  const ceiling = rimCeiling(bgColor);
  const base = readColor(color);
  if (!(Array.isArray(ceiling) && base)) {
    return [];
  }
  const tints = new Set<string>();
  for (let index = 0; index < count; index++) {
    const share = index / count;
    const floor = HALO_LIGHT_LUMAS.map(
      (luma, decoder) => luma + share * ((ceiling[decoder] ?? luma) - luma)
    ) as Lumas;
    const tint = fitLightness({ ...base, a: 1 }, floor, ceiling);
    if (tint) {
      tints.add(toHex(tint));
    }
  }
  return [...tints];
}

/**
 * Why a halo isn't drawn on this code, or how its color was moved: null
 * when it is drawn as picked (or there is none). A rim lighter than the
 * background raises the light level around every dot, and decoders then
 * misread light modules: at every width on a grey page under a
 * see-through code, and with grey or colored dots on a light grey
 * background (measured 21 Nov 2026, every dot shape, widths 0.1 to 0.5, 4,
 * 6 and 9 px per module, four rasteriser and decoder pipelines). A
 * see-through background shows whatever is under the code, and a picture
 * its own tones, so neither takes a halo, nor does a background darker
 * than HALO_LIGHT_MIN; those are refusals. On any other background a
 * color outside the rule's range is "adjusted": drawn in the closest one
 * inside it (fitHaloColor).
 */
export function getHaloRisk(
  props: Pick<QRProps, "halo" | "bgColor">
): HaloRisk | null {
  if (!props.halo) {
    return null;
  }
  const plan = planRim(props.halo, props.bgColor);
  if (!("drawn" in plan)) {
    return plan;
  }
  if (plan.drawn === plan.picked) {
    return null;
  }
  return {
    reason: "adjusted",
    color: plan.drawn,
    message: `Halo drawn as ${plan.drawn} instead of ${plan.picked} so the code still scans: a rim must read no lighter than the background and at least as light as ${HALO_LIGHT_MIN}`,
    fix: `To have it drawn as picked, choose a color in that range, such as ${plan.drawn}`,
  };
}

/**
 * A halo with its defaults filled in, its width in range and its rim
 * opaque; null without one. With `code`, the rim is in the color drawn on
 * that code's background (fitHaloColor), and null where none is drawn.
 */
export function resolveHalo(
  halo: QRHalo | undefined,
  code?: Pick<QRProps, "bgColor">
): { color: string; width: number } | null {
  if (!halo) {
    return null;
  }
  const plan = code ? planRim(halo, code.bgColor) : null;
  if (plan && !("drawn" in plan)) {
    return null;
  }
  const width = clamp(
    halo.width,
    HALO_WIDTH_DEFAULT,
    HALO_WIDTH_MIN,
    HALO_WIDTH_MAX
  );
  // The rim is always opaque: a see-through rim would compound where rims
  // overlap in the print PDF, which paints each shape on its own
  return { color: plan ? plan.drawn : haloColorOf(halo), width };
}

/**
 * A shadow with its defaults filled in and its shift and opacity in range;
 * null without one, or when it wouldn't move (dx and dy both 0).
 */
export function resolveShadow(
  shadow: QRShadow | undefined
): { color: string; opacity: number; dx: number; dy: number } | null {
  if (!shadow) {
    return null;
  }
  const shift = (value: number | undefined) =>
    clamp(value, SHADOW_OFFSET_DEFAULT, -SHADOW_OFFSET_MAX, SHADOW_OFFSET_MAX);
  const dx = shift(shadow.dx);
  const dy = shift(shadow.dy);
  if (dx === 0 && dy === 0) {
    return null;
  }
  return {
    color: shadow.color || SHADOW_COLOR_DEFAULT,
    opacity: clamp(
      shadow.opacity,
      SHADOW_OPACITY_DEFAULT,
      SHADOW_OPACITY_MIN,
      SHADOW_OPACITY_MAX
    ),
    dx,
    dy,
  };
}
