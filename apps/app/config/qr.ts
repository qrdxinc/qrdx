import type { QRStyle, ThemeEditorState } from "@/types/editor";

// export const DEFAULT_FONT_SANS =
//   "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

// export const DEFAULT_FONT_SERIF =
//   'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

// export const DEFAULT_FONT_MONO =
//   'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * The quiet zone (light margin), in modules, a new design starts with: the
 * engine's QUIET_ZONE_MIN, below which the scan score warns. In QRdx's scan
 * study (scripts/scan-study), codes with no margin printed onto a dark or
 * busy surface were read in 0–70% of captures; with one module, 98% or more.
 * The engine's own default stays 0 (DEFAULT_MARGIN), for pages that lay the
 * library's component out.
 */
export const NEW_DESIGN_MARGIN = 2;

/**
 * Default QR code style: what a new design starts with (the editor, Reset to
 * the default look, a new code without a workspace theme), and what a
 * built-in preset, a community theme, an AI theme or a `style` link is laid
 * over, so one that leaves `margin` out gets NEW_DESIGN_MARGIN.
 */
export const defaultThemeState: ThemeEditorState = {
  styles: {
    bgColor: "#ffffff",
    fgColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
    margin: NEW_DESIGN_MARGIN,
  },
};

const { margin: _newDesignMargin, ...withoutMargin } = defaultThemeState.styles;

/**
 * The default style without its margin: fills in the fields a design that
 * already exists leaves out (a saved code or template, the design in the
 * editor). Designs from before new ones started with a margin have no
 * `margin`, which draws none (the engine's 0), so showing or editing one
 * never gives it a margin it didn't have.
 */
export const storedStyleDefaults: QRStyle = withoutMargin;
