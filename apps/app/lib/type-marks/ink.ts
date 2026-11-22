// A type mark's colours beyond its fill (lib/type-marks/data.ts): the glyph
// on the filled tile, and the glyph of the `tint` variant, which sits on a
// light wash of the fill in either theme and is computed from it.

import { contrastRatio, luminance } from "@/lib/themes/color";
import {
  CONTENT_TYPE_MARKS,
  FALLBACK_FILL,
  PAGE_TYPE_MARKS,
  type TypeMarkEntry,
} from "./data";

export const WHITE_INK = "#FFFFFF";
export const DARK_INK = "#0B0B0C";

/** WCAG's minimum for non-text graphics. */
export const MIN_GLYPH_CONTRAST = 3;

/** The surfaces a tint mark sits on: the light and dark card colours. */
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#151618";

/**
 * The glyph on a filled tile: white, or near-black where a brand's own icon
 * draws a dark mark on its colour (the entry's `ink`). Generic fills are
 * chosen so white reaches 3:1 on them.
 */
export function glyphInk(entry: TypeMarkEntry | undefined): string {
  return entry?.ink === "dark" ? DARK_INK : WHITE_INK;
}

/** True for marks drawn with a brand's own logo, which set their own ink. */
export function isBrandGlyph(glyph: string): boolean {
  return (
    glyph.startsWith("brand:") ||
    glyph.startsWith("integration:") ||
    glyph === "LinkedinLogo"
  );
}

function mix(hex: string, toward: string, amount: number): string {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt(toward.slice(1), 16);
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * amount);
  };
  const value = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
}

/** The fill itself, moved toward black or white until it reads on `surface`. */
function readableOn(fill: string, surface: string): string {
  const toward = (luminance(surface) ?? 1) > 0.5 ? "#000000" : "#FFFFFF";
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(fill, toward, step / 20);
    if (contrastRatio(candidate, surface) >= MIN_GLYPH_CONTRAST) {
      return candidate;
    }
  }
  return toward;
}

/** The `tint` variant's glyph colour in the light and the dark theme. */
export function tintInks(fill: string): { light: string; dark: string } {
  return {
    light: readableOn(fill, LIGHT_SURFACE),
    dark: readableOn(fill, DARK_SURFACE),
  };
}

/**
 * Fills too dark to tell apart from the dark theme's background (X, TikTok,
 * Threads): their soft washes use the text colour there instead.
 */
export function isNearBlack(fill: string): boolean {
  return (luminance(fill) ?? 0) < 0.02;
}

/** A content type's mark, or undefined when it has no entry yet. */
export function contentTypeMark(type: string | undefined) {
  return type && Object.hasOwn(CONTENT_TYPE_MARKS, type)
    ? (CONTENT_TYPE_MARKS as Record<string, TypeMarkEntry>)[type]
    : undefined;
}

/** A hosted page type's mark, or undefined when it has no entry yet. */
export function pageTypeMark(pageType: string | undefined) {
  return pageType && Object.hasOwn(PAGE_TYPE_MARKS, pageType)
    ? (PAGE_TYPE_MARKS as Record<string, TypeMarkEntry>)[pageType]
    : undefined;
}

/** The fill a type is drawn with (slate when it has no entry). */
export function markFill(entry: TypeMarkEntry | undefined): string {
  return entry?.fill ?? FALLBACK_FILL;
}
