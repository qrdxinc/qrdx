// The shape of an official design (./index.ts) and the small helpers the
// design files use to stay readable. Nothing here renders or scores: the
// seed test (tests/database/seed-designs*.test.ts) does that.
import type {
  BodyPattern,
  ColorConfig,
  PickableCornerEyeDotPattern,
  PickableCornerEyePattern,
} from "qrdx/types";
import type { LogoIconId } from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";

/**
 * An official frame (packages/qrdx/src/frames/official/<id>.json) with the
 * colors and labels the design sets on it. The seed script puts the frame's
 * spec in when it publishes, so the generated file stays small and the
 * frame stays the engine's.
 */
export interface OfficialFrameRef {
  id: string;
  /** The frame's main color (bands, cards, icons) */
  color?: string;
  /** The label color */
  textColor?: string;
  /** The accent color, on frames that have one */
  secondaryColor?: string;
  /** The first label, instead of the frame's own */
  text?: string;
  /** The second label, instead of the frame's own */
  secondaryText?: string;
}

export interface SeedDesign {
  /** The item's slug: /community/themes/<id>. Never reused. */
  id: string;
  name: string;
  /** What it looks like and what it's for, 40 to 500 characters */
  description: string;
  /** Up to five of COMMUNITY_THEME_TAGS (lib/constants.ts) */
  tags: string[];
  /** The code's style; a built-in frame (banner, sticker...) goes here */
  style: ThemeStyles;
  /** An official frame instead of a built-in one */
  frame?: OfficialFrameRef;
  /** One of the editor's quick icons in the middle (sets showLogo) */
  logoIcon?: LogoIconId;
}

/** The four colors of a code: background, modules, eye frames, eye centres. */
export const ink = (
  bg: string,
  fg: ColorConfig,
  eye: ColorConfig = fg,
  dot: ColorConfig = eye,
): Pick<ThemeStyles, "bgColor" | "fgColor" | "eyeColor" | "dotColor"> => ({
  bgColor: bg,
  fgColor: fg,
  eyeColor: eye,
  dotColor: dot,
});

/** The three shapes of a code: modules, eye frames, eye centres. */
export const shapes = (
  body: BodyPattern,
  eye: PickableCornerEyePattern,
  dot: PickableCornerEyeDotPattern,
): Pick<
  ThemeStyles,
  "bodyPattern" | "cornerEyePattern" | "cornerEyeDotPattern"
> => ({
  bodyPattern: body,
  cornerEyePattern: eye,
  cornerEyeDotPattern: dot,
});

/** A two-stop linear gradient. */
export const linear = (
  angle: number,
  from: string,
  to: string,
): ColorConfig => ({
  type: "linear",
  angle,
  stops: [
    { color: from, offset: 0 },
    { color: to, offset: 100 },
  ],
});

/** A two-stop radial gradient, from the centre out. */
export const radial = (from: string, to: string): ColorConfig => ({
  type: "radial",
  stops: [
    { color: from, offset: 0 },
    { color: to, offset: 100 },
  ],
});

/** Three eye colors, one per corner (top left, top right, bottom left). */
export const eyes = (
  topLeft: string,
  topRight: string,
  bottomLeft: string,
): Pick<ThemeStyles, "eyeColors"> => ({
  eyeColors: {
    topLeft: { outer: topLeft, inner: topLeft },
    topRight: { outer: topRight, inner: topRight },
    bottomLeft: { outer: bottomLeft, inner: bottomLeft },
  },
});
