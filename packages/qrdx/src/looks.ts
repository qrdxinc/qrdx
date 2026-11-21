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
  return {
    outer: own?.outer ?? props.cornerEyePattern ?? DEFAULT_EYE,
    inner: own?.inner ?? props.cornerEyeDotPattern ?? DEFAULT_DOT,
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
 * How light a color reads to decoders, 0 to 255: the darker of the two
 * grey conversions they use (Rec. 709 weights, as jsQR, and Rec. 601, as
 * ZXing), so a saturated color is judged as its darkest reading.
 */
const decoderLuma = ({ r, g, b }: RGBAColor) =>
  Math.min(
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    0.299 * r + 0.587 * g + 0.114 * b
  );

const HALO_LIGHT_LUMA = decoderLuma(parseColor(HALO_LIGHT_MIN) as RGBAColor);

/** How light a color reads (decoderLuma), or null when it can't be read. */
const lumaOf = (color: string | undefined) => {
  const parsed = readColor(color);
  return parsed ? decoderLuma(parsed) : null;
};

/** The rim color as drawn: opaque, the default when it can't be read. */
function haloColorOf(halo: QRHalo): string {
  const parsed = readColor(halo.color || HALO_COLOR_DEFAULT);
  return parsed && parsed.a > 0
    ? `#${[parsed.r, parsed.g, parsed.b]
        .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
        .join("")}`
    : HALO_COLOR_DEFAULT;
}

export interface HaloRisk {
  /** Which part of the design refuses it */
  reason: "see-through" | "picture" | "dark-background" | "rim";
  message: string;
  fix: string;
}

/**
 * Why a halo isn't drawn on this code, or null when it is (or there is
 * none). A halo is drawn only where it was measured never to cost a decode
 * (tests/halo-decode.test.ts): on an opaque background, in a rim at least
 * as light as HALO_LIGHT_MIN and no lighter than any background color (the
 * color, every gradient stop). A rim lighter than the background raises
 * the light level around every dot, and decoders then misread light
 * modules: at every width on a grey page under a see-through code, and
 * with grey or colored dots on a light grey background (measured 21 Nov
 * 2026, every dot shape, widths 0.1 to 0.5, 4, 6 and 9 px per module,
 * four rasteriser and decoder pipelines). A see-through background shows
 * whatever is under the code, and a picture its own tones, so neither
 * takes a halo.
 */
export function getHaloRisk(
  props: Pick<QRProps, "halo" | "bgColor">
): HaloRisk | null {
  if (!props.halo) {
    return null;
  }
  const off = "or turn the halo off";
  if (isSeeThroughBackground(props.bgColor)) {
    return {
      reason: "see-through",
      message:
        "A halo isn't drawn on a see-through background: on a grey surface under the code the rim makes it unreadable",
      fix: `Give the code an opaque background, ${off}`,
    };
  }
  const paint = normalizeColorConfig(props.bgColor, DEFAULT_BGCOLOR);
  if (paint.type === "image") {
    return {
      reason: "picture",
      message:
        "A halo isn't drawn on a picture background: on the picture's darker parts the rim makes the code unreadable",
      fix: `Use a background color, ${off}`,
    };
  }
  const grounds = (
    paint.type === "solid"
      ? [paint.color]
      : paint.stops.map((stop) => stop.color)
  ).map(lumaOf);
  const ground = grounds.includes(null)
    ? null
    : Math.min(...(grounds as number[]));
  if (ground === null || ground < HALO_LIGHT_LUMA - 1e-9) {
    return {
      reason: "dark-background",
      message: `A halo is drawn only on a background at least as light as ${HALO_LIGHT_MIN}: on a darker one the rim makes the code unreadable`,
      fix: `Lighten the background to ${HALO_LIGHT_MIN} or lighter, ${off}`,
    };
  }
  const rim = lumaOf(haloColorOf(props.halo)) as number;
  if (rim < HALO_LIGHT_LUMA - 1e-9 || rim > ground + 1e-9) {
    return {
      reason: "rim",
      message: `A halo is drawn only in a color between ${HALO_LIGHT_MIN} and the background's own: a rim lighter than the background, or darker than ${HALO_LIGHT_MIN}, makes the code unreadable`,
      fix: `Pick a halo color no lighter than the background and at least as light as ${HALO_LIGHT_MIN}, ${off}`,
    };
  }
  return null;
}

/**
 * A halo with its defaults filled in, its width in range and its rim
 * opaque; null without one, or when `code` is given and the halo is
 * refused on it (getHaloRisk).
 */
export function resolveHalo(
  halo: QRHalo | undefined,
  code?: Pick<QRProps, "bgColor">
): { color: string; width: number } | null {
  if (!halo || (code && getHaloRisk({ halo, bgColor: code.bgColor }))) {
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
  return { color: haloColorOf(halo), width };
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
