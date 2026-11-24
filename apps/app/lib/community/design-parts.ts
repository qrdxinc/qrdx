// What a community theme or frame is made of, in the editor's words: a
// theme's patterns and colors (its card's swatch and its page's "What's in
// it"), and a frame's labels, colors and what the editor lets you change.
// Only what the design holds. Safe on the server and in the browser.
import { frameSpecOf, getFrameColors } from "qrdx";
import type { AnyQRFrame } from "qrdx/types";
import {
  labelOfSlot,
  specIcons,
  specTokens,
} from "@/components/editor/control-sections/frame-specs";
import { paintColors, swatchHex } from "@/lib/paint/swatches";
import {
  bodyPatternName,
  eyeDotPatternName,
  eyePatternName,
} from "@/lib/qr-design/pattern-names";
import type { ThemeStyles } from "@/types/theme";

/** Where a theme's color shows. */
export type ColorRole = "dots" | "eyes" | "eyeDots" | "background";

export interface DesignColor {
  /** Lowercase hex (#rrggbb, or #rrggbbaa with alpha) */
  hex: string;
  /** Every part painted with it: dots, eyes, eye dots, background */
  roles: ColorRole[];
}

/** What the engine draws when a design leaves a color out. */
const DEFAULT_DOTS = "#000000";
const DEFAULT_BACKGROUND = "#ffffff";

/**
 * A theme's colors, each once: the dots, the eyes (frames, then centres,
 * per-eye colors included) and the background, every gradient stop. Missing
 * colors are the engine's defaults (black dots, eyes like the dots, a white
 * background).
 */
export function themeColors(style: ThemeStyles): DesignColor[] {
  const dots = paintColors(style.fgColor ?? DEFAULT_DOTS);
  const perEye = Object.values(style.eyeColors ?? {});
  const parts: [ColorRole, string[]][] = [
    ["dots", dots],
    [
      "eyes",
      [
        ...(style.eyeColor === undefined ? dots : paintColors(style.eyeColor)),
        ...perEye.flatMap((eye) => paintColors(eye?.outer)),
      ],
    ],
    [
      "eyeDots",
      [
        ...(style.dotColor === undefined ? dots : paintColors(style.dotColor)),
        ...perEye.flatMap((eye) => paintColors(eye?.inner)),
      ],
    ],
    ["background", paintColors(style.bgColor ?? DEFAULT_BACKGROUND)],
  ];
  const found = new Map<string, ColorRole[]>();
  for (const [role, colors] of parts) {
    for (const color of colors) {
      const hex = swatchHex(color)?.toLowerCase();
      if (!hex) continue;
      const roles = found.get(hex) ?? [];
      if (!roles.includes(role)) roles.push(role);
      found.set(hex, roles);
    }
  }
  return [...found].map(([hex, roles]) => ({ hex, roles }));
}

/**
 * The code a theme's swatch draws: its dots, eyes and colors, without what
 * goes around the code (a frame), a logo or an outline shape.
 */
export function swatchStyle(style: ThemeStyles): ThemeStyles {
  const {
    frame: _frame,
    shape: _shape,
    silhouette: _silhouette,
    showLogo: _showLogo,
    customLogo: _customLogo,
    logoOptions: _logoOptions,
    art: _art,
    ...look
  } = style;
  return { ...look, showLogo: false };
}

/** A theme's parts by the editor's names (the engine's defaults if unset). */
export function themeParts(style: ThemeStyles) {
  return {
    dots: bodyPatternName(style.bodyPattern ?? "circle"),
    eyes: eyePatternName(style.cornerEyePattern ?? "gear"),
    eyeDots: eyeDotPatternName(style.cornerEyeDotPattern ?? "circle"),
  };
}

/** What a frame shows and what the editor lets you change on it. */
export interface FrameParts {
  /** Its label as drawn, if it has one */
  label: string | null;
  /** Its second line, if it has one */
  secondLine: string | null;
  /** Which lines the editor lets you write (a line can start empty) */
  lines: { label: boolean; secondLine: boolean };
  /** The colors it paints with, as the editor names them */
  colors: { name: "Frame" | "Text" | "Accent"; hex: string }[];
  /** How many icons it places */
  icons: number;
  /** Whether its labels' size can be changed */
  textSize: boolean;
}

export function frameParts(frame: AnyQRFrame): FrameParts | null {
  const spec = frameSpecOf(frame);
  if (!spec) return null;
  const primary = labelOfSlot(spec, "primary");
  const secondary = labelOfSlot(spec, "secondary");
  const text = (value: string | undefined) => value?.trim() || null;
  const tokens = specTokens(spec);
  const current = getFrameColors(frame);
  const colors: FrameParts["colors"] = [];
  if (current) {
    for (const [token, name] of [
      ["frame", "Frame"],
      ["text", "Text"],
      ["accent", "Accent"],
    ] as const) {
      const hex = tokens.has(token) ? swatchHex(current[token]) : null;
      if (hex) colors.push({ name, hex: hex.toLowerCase() });
    }
  }
  return {
    label: primary ? text(frame.text ?? primary.text) : null,
    secondLine: secondary ? text(frame.secondaryText ?? secondary.text) : null,
    lines: { label: Boolean(primary), secondLine: Boolean(secondary) },
    colors,
    // Only a custom frame's icons can be swapped (the editor's rule)
    icons: frame.style === "custom" ? specIcons(spec).length : 0,
    textSize: spec.labels.length > 0,
  };
}
