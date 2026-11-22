import { resolveShadow } from "qrdx";
import type {
  EyeColors,
  EyeGradientSpan,
  EyeShapes,
  LogoOptions,
  QRCodeShape,
  QRHalo,
  QRShadow,
} from "qrdx/types";
import type { ThemeStyles } from "@/types/theme";
import {
  isSwissQrPayload,
  SWISS_CROSS_LOGO,
  swissCrossShare,
} from "@/utils/swiss-qr-bill";

/** Engine options a style can carry beyond colors, shapes and the frame. */
export interface StyleEngineOptions {
  eyeColors?: EyeColors;
  moduleScale?: number;
  autoLevel?: boolean;
  exactLevel?: boolean;
  logoOptions?: LogoOptions;
  shape?: QRCodeShape;
  // The looks around the shapes (qrdx looks.ts)
  eyeShapes?: EyeShapes;
  eyeGradient?: EyeGradientSpan;
  bgRadius?: number;
  backdrop?: string;
  halo?: QRHalo;
  shadow?: QRShadow;
}

/** The looks a style sets, each only when it draws something. */
function styleLooks(
  style: Partial<ThemeStyles>,
): Pick<
  StyleEngineOptions,
  "eyeShapes" | "eyeGradient" | "bgRadius" | "backdrop" | "halo" | "shadow"
> {
  const eyeShapes = style.eyeShapes;
  const hasEyeShapes =
    eyeShapes !== undefined &&
    Object.values(eyeShapes).some((eye) => eye?.outer || eye?.inner);
  const rounded = (style.bgRadius ?? 0) > 0;
  return {
    ...(hasEyeShapes && { eyeShapes }),
    ...(style.eyeGradient === "code" && { eyeGradient: "code" as const }),
    ...(rounded && { bgRadius: style.bgRadius }),
    ...(rounded && style.backdrop && { backdrop: style.backdrop }),
    ...(style.halo && { halo: style.halo }),
    ...(style.shadow &&
      resolveShadow(style.shadow) && { shadow: style.shadow }),
  };
}

/**
 * The outline the code is drawn in: a silhouette of your own wins over a
 * named shape; square (the default) is left out.
 */
function codeShape(style: Partial<ThemeStyles>): QRCodeShape | undefined {
  if (style.silhouette) return style.silhouette;
  return style.shape === "circle" || style.shape === "heart"
    ? style.shape
    : undefined;
}

/**
 * What the payload itself asks of the engine. A Swiss QR-bill is encoded at
 * exactly its level: SIX's guidelines want M (IG §6.1), and the encoder
 * would otherwise raise it when the data fits the same version anyway.
 * Spread it wherever `value` is drawn without `styleEngineOptions`.
 */
export function payloadEngineOptions(
  value: string,
): Pick<StyleEngineOptions, "exactLevel"> {
  return isSwissQrPayload(value) ? { exactLevel: true } : {};
}

/**
 * A Swiss QR-bill's cross stays 7/46 of the symbol (7 × 7 mm on the 46 mm
 * code, IG §6.4.2) at the margin it is drawn with, which can be more than
 * the style's (the generator pages' quiet zone).
 */
function swissCrossOptions(
  style: Partial<ThemeStyles>,
  value: string,
  margin: number,
): Pick<StyleEngineOptions, "logoOptions"> {
  const cross =
    style.showLogo === true &&
    style.customLogo === SWISS_CROSS_LOGO &&
    isSwissQrPayload(value);
  return cross
    ? {
        logoOptions: {
          ...style.logoOptions,
          size: swissCrossShare(value, margin),
        },
      }
    : {};
}

/**
 * Per-eye colors, module size, auto error correction and the logo layout of
 * `style`, ready to spread into `getQRData(...)` or `<QRCode>` for `value`.
 * Only set values are returned, so a style without them renders exactly as
 * before. Pass `level` and `margin` to `getQRData` too: logo clear space and
 * position are laid out in modules. `margin` is the one drawn, when it isn't
 * the style's. `value` adds what the payload asks for (payloadEngineOptions).
 */
export function styleEngineOptions(
  style: Partial<ThemeStyles>,
  value: string,
  margin = style.margin ?? 0,
): StyleEngineOptions {
  const eyeColors = style.eyeColors;
  const hasEyeColors =
    eyeColors !== undefined &&
    Object.values(eyeColors).some((eye) => eye?.outer || eye?.inner);
  return {
    ...(hasEyeColors && { eyeColors }),
    ...(style.moduleScale !== undefined &&
      style.moduleScale < 1 && { moduleScale: style.moduleScale }),
    ...(style.autoLevel && { autoLevel: true }),
    ...payloadEngineOptions(value),
    ...(style.logoOptions &&
      Object.keys(style.logoOptions).length > 0 && {
        logoOptions: style.logoOptions,
      }),
    ...swissCrossOptions(style, value, margin),
    ...(codeShape(style) && { shape: codeShape(style) }),
    ...styleLooks(style),
  };
}

/**
 * The options `<QRCodeSVG>` takes directly (per-eye colors, module size,
 * the code shape, the looks around the shapes and what the payload asks
 * for), for previews without a logo. Logo layout goes through `getQRData`.
 */
export function styleSvgOptions(
  style: Partial<ThemeStyles>,
  value: string,
): Omit<StyleEngineOptions, "autoLevel" | "logoOptions"> {
  const {
    autoLevel: _autoLevel,
    logoOptions: _logoOptions,
    ...rest
  } = styleEngineOptions(style, value);
  return rest;
}
