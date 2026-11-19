// Prop types of the React components. Only the React entry (and the
// `qrdx/types` entry, for compatibility) reach this file; the core's types
// never do, so they work without React's types installed.
import type { CanvasHTMLAttributes, ReactElement, SVGProps } from "react";
import type { FrameTreeOptions } from "../src/frame";
import type { QRCodeProps } from "../src/qr-code-props";
import type { QRProps } from "./qr";

export type QRPropsCanvas = QRProps & CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & SVGProps<SVGSVGElement>;
/**
 * React's `QRCode` props: `QRCodeProps` (the logo API included) plus the
 * SVG attributes, which go on the `<svg>` as with `QRCodeSVG`.
 */
export type QRCodePropsSVG = QRCodeProps & SVGProps<SVGSVGElement>;

/**
 * `QRFrameSVG`'s props: the frame, the code size it's laid out around and
 * the code's background, an optional element for the code's slot, and SVG
 * attributes for the outer `<svg>`.
 */
export type QRFrameSVGProps = Omit<FrameTreeOptions, "slot" | "svgProps"> & {
  slot?: ReactElement;
} & Omit<SVGProps<SVGSVGElement>, "children" | "slot">;
