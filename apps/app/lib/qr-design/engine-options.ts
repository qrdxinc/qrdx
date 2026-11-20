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

/** Engine options a style can carry beyond colors, shapes and the frame. */
export interface StyleEngineOptions {
  eyeColors?: EyeColors;
  moduleScale?: number;
  autoLevel?: boolean;
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
    ...(style.shadow && resolveShadow(style.shadow) && { shadow: style.shadow }),
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
 * Per-eye colors, module size, auto error correction and the logo layout of
 * `style`, ready to spread into `getQRData(...)` or `<QRCode>`. Only set
 * values are returned, so a style without them renders exactly as before.
 * Pass `level` and `margin` to `getQRData` too: logo clear space and
 * position are laid out in modules.
 */
export function styleEngineOptions(
  style: Partial<ThemeStyles>,
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
    ...(style.logoOptions &&
      Object.keys(style.logoOptions).length > 0 && {
        logoOptions: style.logoOptions,
      }),
    ...(codeShape(style) && { shape: codeShape(style) }),
    ...styleLooks(style),
  };
}

/**
 * The options `<QRCodeSVG>` takes directly (per-eye colors, module size,
 * the code shape and the looks around the shapes), for previews without a
 * logo. Logo layout goes through `getQRData`.
 */
export function styleSvgOptions(
  style: Partial<ThemeStyles>,
): Omit<StyleEngineOptions, "autoLevel" | "logoOptions"> {
  const {
    autoLevel: _autoLevel,
    logoOptions: _logoOptions,
    ...rest
  } = styleEngineOptions(style);
  return rest;
}
