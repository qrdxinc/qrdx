// The looks added around the code's shapes (feat/more-customization):
// per-eye shapes, the eyes' gradient span, the background's corner radius
// and backdrop, the halo and the shadow. Pure helpers the renderer, the
// scan score and editors share: each option's defaults and caps live here,
// so a value outside its range draws as the nearest one that scans.
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  EyePosition,
  QRCodeShape,
  QRHalo,
  QRProps,
  QRShadow,
} from "../types";
import {
  BG_RADIUS_MAX,
  BG_RADIUS_QUIET_RATIO,
  EYE_POSITIONS,
  HALO_COLOR_DEFAULT,
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
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  ERROR_LEVEL_MAP,
} from "./constants";
import { isShapedCode } from "./qr-shape";
import { getStylePairRisk, type StylePairRisk } from "./scan-risk";
import { getSolidColor } from "./utils/color";
import { parseColor } from "./utils/parse-color";

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
 * quiet zone with at `level` and `margin`, for an editor's slider: 0 when
 * the code has no margin or is shaped.
 */
export function getBgRadiusLimit({
  value,
  level,
  margin,
  shape,
}: Pick<QRProps, "value" | "level" | "margin" | "shape">): number {
  const modules = qrcodegen.QrCode.encodeText(
    `${value}`,
    ERROR_LEVEL_MAP[level ?? DEFAULT_LEVEL]
  ).size;
  return clampBgRadius(BG_RADIUS_MAX, modules, margin ?? DEFAULT_MARGIN, shape);
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

/**
 * Dot shapes a halo is never drawn with on a see-through background. The
 * light modules of such a code show the page; on a mid-grey page
 * (#9ca3af) the rim raises the local white level and these shapes, read
 * without a halo, stop reading with one at 4 to 6 px per module (measured
 * 20 Nov 2026 at every width from 0.1 to 0.5, three widths for some, every
 * width for diamond, small-square and random-dots). On white and light
 * pages no shape gets worse; on a dark page a see-through code doesn't
 * read with or without a halo, so that is no rule of the halo's.
 */
export const HALO_SEE_THROUGH_BLOCKED_BODIES: readonly BodyPattern[] = [
  "diamond",
  "small-square",
  "random-dots",
  "pacman",
  "liquid-horizontal",
  "liquid-vertical",
  "star",
];

/**
 * True when nothing opaque sits under the modules: the background's solid
 * color is see-through ("transparent", or any alpha below 1). A color the
 * engine can't parse counts as opaque.
 */
export function isSeeThroughBackground(bgColor: QRProps["bgColor"]): boolean {
  const parsed = parseColor(getSolidColor(bgColor, DEFAULT_BGCOLOR));
  return parsed !== null && parsed.a < 1;
}

export interface HaloRisk {
  message: string;
  fix: string;
}

/**
 * Why a halo isn't drawn on this code: a see-through background with one
 * of HALO_SEE_THROUGH_BLOCKED_BODIES (see there). Null when the halo is
 * fine, or when there is none.
 */
export function getHaloRisk(
  props: Pick<QRProps, "halo" | "bodyPattern" | "bgColor">
): HaloRisk | null {
  const body = props.bodyPattern ?? "circle";
  if (
    !(
      props.halo &&
      HALO_SEE_THROUGH_BLOCKED_BODIES.includes(body) &&
      isSeeThroughBackground(props.bgColor)
    )
  ) {
    return null;
  }
  return {
    message: `A halo on a see-through background makes ${body} dots unreadable on a grey surface, so it isn't drawn`,
    fix: "Use an opaque background color, or another dot shape",
  };
}

/**
 * A halo with its defaults filled in and its width in range; null without
 * one, or when `code` is given and the halo is refused on it (getHaloRisk).
 */
export function resolveHalo(
  halo: QRHalo | undefined,
  code?: Pick<QRProps, "bodyPattern" | "bgColor">
): { color: string; width: number } | null {
  if (!halo || (code && getHaloRisk({ halo, ...code }))) {
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
  const parsed = parseColor(halo.color || HALO_COLOR_DEFAULT);
  const color = parsed
    ? `#${[parsed.r, parsed.g, parsed.b]
        .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
        .join("")}`
    : HALO_COLOR_DEFAULT;
  return { color, width };
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
