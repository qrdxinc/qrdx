// How a downloaded code looks, for qr_downloaded (DownloadLookProps in
// @repo/analytics/events): yes/no flags and ids from the engine's fixed
// lists, so downloads can be broken down by look without sending anything
// a person typed or picked by hand (colors, frame text, logos, content).
// Pure: no React, no browser globals.

import type { DownloadLook, DownloadLookProps } from "@repo/analytics/events";
import { isQRArtActive } from "qrdx";
import {
  BODY_PATTERN,
  type ColorConfig,
  CUSTOM_FRAME_STYLE,
  FRAME_STYLES,
  WITHDRAWN_BODY_PATTERNS,
  withdrawnFallback,
} from "qrdx/types";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import type { ThemeStyles } from "@/types/theme";

// The playground's default look (defaultThemeState in config/qr.ts), which
// is also what the engine draws for a part a style leaves unset. A code in
// it, with no frame, logo, art or shape, is "plain".
const DEFAULT_BODY_PATTERN = "circle";
const DEFAULT_EYE_PATTERN = "gear";
const DEFAULT_EYE_DOT_PATTERN = "circle";
const BLACK = "#000000";
const WHITE = "#ffffff";

/** The props a design always reports, plus the details of what it has. */
export type DownloadLookSummary = Required<
  Pick<
    DownloadLookProps,
    | "look"
    | "has_frame"
    | "has_logo"
    | "has_art"
    | "has_shape"
    | "custom_colors"
    | "body_pattern"
  >
> &
  Pick<DownloadLookProps, "frame_style" | "art_mode" | "shape">;

/** A hex color written the long way in lower case: "#FFF" is "#ffffff". */
function normalizeColor(color: string): string {
  let hex = color.trim().toLowerCase();
  if (hex === "black") return BLACK;
  if (hex === "white") return WHITE;
  if (/^#[\da-f]{3,4}$/.test(hex)) {
    hex = `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}`;
  }
  // Fully opaque alpha changes nothing
  return /^#[\da-f]{6}ff$/.test(hex) ? hex.slice(0, 7) : hex;
}

/** True when `paint` is unset or the solid color `color`. */
function isPlainPaint(paint: ColorConfig | undefined, color: string): boolean {
  if (paint === undefined || paint === "") return true;
  if (typeof paint === "string") return normalizeColor(paint) === color;
  return paint.type === "solid" && normalizeColor(paint.color) === color;
}

/** A gradient, a picture fill or any color other than black on white. */
function hasCustomColors(style: Partial<ThemeStyles>): boolean {
  const eyePaints = Object.values(style.eyeColors ?? {}).flatMap((eye) => [
    eye?.outer,
    eye?.inner,
  ]);
  return !(
    isPlainPaint(style.fgColor, BLACK) &&
    isPlainPaint(style.bgColor, WHITE) &&
    isPlainPaint(style.eyeColor, BLACK) &&
    isPlainPaint(style.dotColor, BLACK) &&
    eyePaints.every((paint) => isPlainPaint(paint, BLACK))
  );
}

/** The body pattern drawn (a withdrawn id draws its stand-in), or "other". */
function bodyPatternId(pattern: string | undefined): string {
  const drawn = withdrawnFallback(
    WITHDRAWN_BODY_PATTERNS,
    pattern ?? DEFAULT_BODY_PATTERN,
  );
  return (BODY_PATTERN as readonly string[]).includes(drawn) ? drawn : "other";
}

/** A frame's style id, "custom" for one drawn from a spec, else "other". */
function frameStyleId(style: string): string {
  return (FRAME_STYLES as readonly string[]).includes(style) ||
    style === CUSTOM_FRAME_STYLE
    ? style
    : "other";
}

/**
 * How a design looks for qr_downloaded. Pass the design as it is drawn:
 * leave out the parts a download doesn't draw (the type tools draw no frame
 * and no art, a saved code no art).
 *
 * `look` names the most distinctive part, first match wins: shape > art >
 * frame > logo > styled > plain. The `has_*` flags hold every combination,
 * so a code with a frame and a logo is look "frame" with both flags true.
 */
export function downloadLookProps(
  style: Partial<ThemeStyles>,
): DownloadLookSummary {
  // The engine options say what a style really draws (a shape, eye shapes,
  // a rounded background, a halo or shadow); "" is a payload that asks for
  // nothing of its own.
  const drawn = styleEngineOptions(style, "");
  const codeShape = drawn.shape;
  let shape: DownloadLookSummary["shape"];
  if (typeof codeShape === "object") shape = "silhouette";
  else if (codeShape === "circle" || codeShape === "heart") shape = codeShape;
  const art = isQRArtActive(style.art) ? style.art : undefined;
  const frame =
    style.frame && style.frame.style !== "none" ? style.frame : undefined;
  const hasLogo = style.showLogo === true;
  const customColors = hasCustomColors(style);
  const bodyPattern = bodyPatternId(style.bodyPattern);
  const styled =
    customColors ||
    bodyPattern !== DEFAULT_BODY_PATTERN ||
    (style.cornerEyePattern ?? DEFAULT_EYE_PATTERN) !== DEFAULT_EYE_PATTERN ||
    (style.cornerEyeDotPattern ?? DEFAULT_EYE_DOT_PATTERN) !==
      DEFAULT_EYE_DOT_PATTERN ||
    Boolean(
      drawn.eyeShapes ||
        drawn.moduleScale ||
        drawn.bgRadius ||
        drawn.halo ||
        drawn.shadow,
    );

  let look: DownloadLook = "plain";
  if (shape) look = "shape";
  else if (art) look = "art";
  else if (frame) look = "frame";
  else if (hasLogo) look = "logo";
  else if (styled) look = "styled";

  return {
    look,
    has_frame: frame !== undefined,
    has_logo: hasLogo,
    has_art: art !== undefined,
    has_shape: shape !== undefined,
    custom_colors: customColors,
    body_pattern: bodyPattern,
    ...(frame && { frame_style: frameStyleId(frame.style) }),
    ...(art && { art_mode: art.mode }),
    ...(shape && { shape }),
  };
}
