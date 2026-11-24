// The QR-bill style: what SIX's Swiss Implementation Guidelines for the
// QR-bill (v2.4) ask of the code's look, which the Swiss QR-bill form puts
// on the design when it opens and offers back when the design drops it.
//
//   level      error correction M (§6.1), encoded at exactly M: the payload
//              alone turns the encoder's boost off (engine-options.ts)
//   cross      the Swiss cross in the middle (§2.6), 7 × 7 mm on the
//              46 × 46 mm code (§6.4, §6.4.2): 7/46 of the symbol
//   colors     black dots on white: the modules are "the white and black
//              dots of the code" (§2.4) and the cross is "in black and
//              white" (§6.4.2)
//   border     nothing printed around the code: the quiet zone is an
//              "unprinted border" (§6.4.1), so no frame, outline shape,
//              template or rounded background
//
// The guidelines say nothing about the shape of the dots or the eyes, or
// about the dots' size within a module, so those stay the design's.

import { isFrameActive } from "qrdx";
import type { ThemeStyles } from "@/types/theme";
import {
  SWISS_CROSS_LOGO,
  SWISS_QR_ERROR_CORRECTION,
  swissCrossShare,
} from "@/utils/swiss-qr-bill";

export type SwissQrStylePart = "level" | "cross" | "colors" | "border";

export const SWISS_QR_STYLE_PARTS: readonly SwissQrStylePart[] = [
  "level",
  "cross",
  "colors",
  "border",
];

const BLACK = "#000000";
const WHITE = "#ffffff";

/** "#FFF", "#ffffff" and "#ffffffff" → "#ffffff"; null for anything else. */
function solidHex(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${[...value.slice(1)].map((digit) => digit + digit).join("")}`;
  }
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{6}ff$/.test(value)) return value.slice(0, 7);
  return null;
}

/** The cross is shown, centred, at 7/46 of the symbol for `margin`. */
export function hasSwissCross(
  styles: Partial<ThemeStyles>,
  value: string,
  margin = styles.margin ?? 0,
): boolean {
  const options = styles.logoOptions ?? {};
  return (
    styles.showLogo === true &&
    styles.customLogo === SWISS_CROSS_LOGO &&
    options.size === swissCrossShare(value, margin) &&
    (options.x ?? 0.5) === 0.5 &&
    (options.y ?? 0.5) === 0.5 &&
    !options.padding &&
    (options.shape ?? "square") === "square" &&
    !options.plate
  );
}

function blackOnWhite(styles: Partial<ThemeStyles>): boolean {
  const black = (color: unknown) => solidHex(color) === BLACK;
  return (
    black(styles.fgColor) &&
    solidHex(styles.bgColor) === WHITE &&
    (styles.eyeColor === undefined || black(styles.eyeColor)) &&
    (styles.dotColor === undefined || black(styles.dotColor)) &&
    !styles.eyeColors &&
    !styles.art &&
    !styles.halo &&
    !styles.shadow
  );
}

function clearBorder(styles: Partial<ThemeStyles>): boolean {
  return (
    !isFrameActive(styles.frame) &&
    (styles.shape ?? "square") === "square" &&
    !styles.silhouette &&
    !styles.bgRadius
  );
}

/** The parts of the QR-bill style `styles` has changed, in display order. */
export function swissQrStyleIssues(
  styles: Partial<ThemeStyles>,
  value: string,
): SwissQrStylePart[] {
  const kept: Record<SwissQrStylePart, boolean> = {
    level: styles.level === SWISS_QR_ERROR_CORRECTION && !styles.autoLevel,
    cross: hasSwissCross(styles, value),
    colors: blackOnWhite(styles),
    border: clearBorder(styles),
  };
  return SWISS_QR_STYLE_PARTS.filter((part) => !kept[part]);
}

/**
 * `styles` in the QR-bill style: error correction M, the cross, black on
 * white and a clear border. Dot and eye shapes, the dots' size and the
 * margin are kept.
 */
export function withSwissQrStyle(
  styles: ThemeStyles,
  value: string,
): ThemeStyles {
  const {
    autoLevel: _autoLevel,
    eyeColors: _eyeColors,
    art: _art,
    halo: _halo,
    shadow: _shadow,
    eyeGradient: _eyeGradient,
    frame: _frame,
    shape: _shape,
    silhouette: _silhouette,
    bgRadius: _bgRadius,
    backdrop: _backdrop,
    ...kept
  } = styles;
  return {
    ...kept,
    level: SWISS_QR_ERROR_CORRECTION,
    fgColor: BLACK,
    bgColor: WHITE,
    eyeColor: BLACK,
    dotColor: BLACK,
    showLogo: true,
    customLogo: SWISS_CROSS_LOGO,
    logoOptions: { size: swissCrossShare(value, styles.margin ?? 0) },
  };
}
