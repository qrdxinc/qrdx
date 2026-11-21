// Per-eye shapes (eyeShapes): pure helpers for the Eye shapes section and
// the inline part controls. The engine draws each eye with its own frame
// and centre when set, else the code's (qrdx eyeShapeOf); the scan risk of
// a pick is judged for that eye alone (qrdx getStylePairRisk), since the
// other eyes keep their pairs.
import { eyeShapeOf, getStylePairRisk } from "qrdx";
import type {
  CornerEyeDotPattern,
  CornerEyePattern,
  EyePosition,
  EyeShapeOverride,
  EyeShapes,
} from "qrdx/types";
import type { QRStyle } from "@/types/theme";

/** True when any eye has a shape of its own. */
export function hasEyeShapes(style: Partial<QRStyle>): boolean {
  return Object.values(style.eyeShapes ?? {}).some(
    (eye) => eye?.outer !== undefined || eye?.inner !== undefined,
  );
}

/**
 * `eyeShapes` with one eye's `part` set to `shape`, or cleared with
 * undefined. Empty eyes and an empty map are dropped, so a design whose
 * eyes all match the code's shapes saves as before.
 */
export function withEyeShape(
  eyeShapes: EyeShapes | undefined,
  position: EyePosition,
  part: keyof EyeShapeOverride,
  shape: CornerEyePattern | CornerEyeDotPattern | undefined,
): EyeShapes | undefined {
  const eye: EyeShapeOverride = { ...eyeShapes?.[position], [part]: shape };
  if (eye.outer === undefined) delete eye.outer;
  if (eye.inner === undefined) delete eye.inner;
  const next: EyeShapes = { ...eyeShapes };
  if (Object.keys(eye).length > 0) next[position] = eye;
  else delete next[position];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The frame and centre drawn at `position` (its own, else the code's). */
export function eyeShapeAt(style: Partial<QRStyle>, position: EyePosition) {
  return eyeShapeOf(
    {
      cornerEyePattern: style.cornerEyePattern,
      cornerEyeDotPattern: style.cornerEyeDotPattern,
      eyeShapes: style.eyeShapes,
    },
    position,
  );
}

/**
 * The engine's known-weak pair for one eye after a change to its `part`,
 * as a short reason, or null when it scans.
 */
function eyeRisk(
  style: Partial<QRStyle>,
  position: EyePosition,
  part: keyof EyeShapeOverride,
  shape: CornerEyePattern | CornerEyeDotPattern,
) {
  const current = eyeShapeAt(style, position);
  return getStylePairRisk({
    bodyPattern: style.bodyPattern,
    cornerEyePattern:
      part === "outer" ? (shape as CornerEyePattern) : current.outer,
    cornerEyeDotPattern:
      part === "inner" ? (shape as CornerEyeDotPattern) : current.inner,
  });
}

/** Why `shape` on this eye may not scan with the rest of the style. */
export function eyeShapeRisk(
  style: Partial<QRStyle>,
  position: EyePosition,
  part: keyof EyeShapeOverride,
  shape: CornerEyePattern | CornerEyeDotPattern,
): string | null {
  const risk = eyeRisk(style, position, part, shape);
  return risk ? `${risk.message}. ${risk.fix}.` : null;
}

/** Pairs that fail the decode tests can't be picked on an eye either. */
export function eyeShapeBlocked(
  style: Partial<QRStyle>,
  position: EyePosition,
  part: keyof EyeShapeOverride,
  shape: CornerEyePattern | CornerEyeDotPattern,
): boolean {
  const kind = eyeRisk(style, position, part, shape)?.kind;
  return kind === "body-eye" || kind === "dot-eye";
}
