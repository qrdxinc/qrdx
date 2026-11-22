import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  getTemplateIds,
  CORNER_EYE_PATTERNS as QRDX_CORNER_EYE_PATTERNS,
} from "qrdx";

export interface Settings {
  bodyPattern: BodyPattern;
  cornerEyePattern: CornerEyePattern;
  cornerEyeDotPattern: CornerEyeDotPattern;
  fgColor: string;
  bgColor: string;
  eyeColor: string;
  dotColor: string;
  level: ErrorLevel;
  templateId: string;
  logo: string;
  size: string;
  margin: string;
}

export const DEFAULT_SETTINGS: Settings = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
  fgColor: "#000000",
  bgColor: "#ffffff",
  eyeColor: "",
  dotColor: "",
  level: "Q",
  templateId: "",
  logo: "",
  size: "512",
  margin: "0",
};

/** `first`, then the rest of `list` in qrdx's order. */
function startWith<T>(first: T, list: readonly T[]): T[] {
  return [first, ...list.filter((item) => item !== first)];
}

// The shapes qrdx offers, straight from the installed version, so a qrdx
// update brings its new shapes with it. Each one decodes with jsQR and ZXing
// in qrdx's own tests. Retired shapes (curly eyes; diamond, star and banner
// centres) aren't in these lists; qrdx still draws them for saved designs.
export const BODY_PATTERNS: BodyPattern[] = startWith<BodyPattern>(
  "square",
  BODY_PATTERN
);

export const CORNER_EYE_PATTERNS: CornerEyePattern[] =
  startWith<CornerEyePattern>("square", QRDX_CORNER_EYE_PATTERNS);

export const CORNER_DOT_PATTERNS: CornerEyeDotPattern[] =
  startWith<CornerEyeDotPattern>("square", CORNER_EYE_DOT_PATTERNS);

/** Whether an eye frame's name is also an eye centre (`circle`, `leaf`, …). */
export function isCornerDotPattern(name: string): name is CornerEyeDotPattern {
  return (CORNER_DOT_PATTERNS as string[]).includes(name);
}

export const ERROR_LEVELS: { value: ErrorLevel; label: string }[] = [
  { value: "L", label: "L — Low (7%)" },
  { value: "M", label: "M — Medium (15%)" },
  { value: "Q", label: "Q — Quartile (25%)" },
  { value: "H", label: "H — High (30%)" },
];

// qrdx's decorative templates ("default" is the plain code, offered as None).
export const TEMPLATES: { value: string; label: string }[] = [
  { value: "", label: "None" },
  ...getTemplateIds()
    .filter((id) => id !== "default")
    .map((id) => ({
      value: id,
      label: id.replace(/([a-z])([A-Z])/g, "$1 $2"),
    })),
];

export function toLabel(val: string): string {
  if (!val) return "None";
  return val.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
