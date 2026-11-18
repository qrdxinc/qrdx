import { type LoaderProps, LoaderSvg } from "./loader-svg";

/**
 * The loader for applying a style or switching themes: one module in the
 * brand accent morphs through a code's body patterns, square → rounded →
 * dot → diamond, and turns back into the square (2.4 s). The corner radius
 * animates as the CSS `rx` property; a browser that can't animate it keeps
 * the rounded module and still turns it into the diamond.
 */
export function ShapeMorph({ size = 24, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <rect
        className="qrdx-loader-accent qrdx-loader-morph"
        height="22"
        rx="6"
        width="22"
        x="13"
        y="13"
      />
    </LoaderSvg>
  );
}
