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
import { DEFAULT_LEVEL, DEFAULT_MARGIN, ERROR_LEVEL_MAP } from "./constants";
import { isShapedCode } from "./qr-shape";
import { getStylePairRisk, type StylePairRisk } from "./scan-risk";

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

/** Risk kinds from the one that blocks a pick to the one that only warns. */
const RISK_SEVERITY: StylePairRisk["kind"][] = [
  "dot-eye",
  "body-eye",
  "dot",
  "eye",
  "sharp-dot-eye",
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
  if (!radius || radius <= 0 || isShapedCode(shape) || margin <= 0) {
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A halo with its defaults filled in and its width in range; null without one. */
export function resolveHalo(
  halo: QRHalo | undefined
): { color: string; width: number } | null {
  if (!halo) {
    return null;
  }
  const width = clamp(
    halo.width ?? HALO_WIDTH_DEFAULT,
    HALO_WIDTH_MIN,
    HALO_WIDTH_MAX
  );
  return { color: halo.color || HALO_COLOR_DEFAULT, width };
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
    clamp(
      value ?? SHADOW_OFFSET_DEFAULT,
      -SHADOW_OFFSET_MAX,
      SHADOW_OFFSET_MAX
    );
  const dx = shift(shadow.dx);
  const dy = shift(shadow.dy);
  if (dx === 0 && dy === 0) {
    return null;
  }
  return {
    color: shadow.color || SHADOW_COLOR_DEFAULT,
    opacity: clamp(
      shadow.opacity ?? SHADOW_OPACITY_DEFAULT,
      SHADOW_OPACITY_MIN,
      SHADOW_OPACITY_MAX
    ),
    dx,
    dy,
  };
}
