// Prop types of the React components. Only the React entry (and the
// `qrdx/types` entry, for compatibility) reach this file; the core's types
// never do, so they work without React's types installed.
import type { CanvasHTMLAttributes, SVGProps } from "react";
import type { QRCodeProps } from "../src/qr-code-props";
import type { QRProps } from "./qr";

export type QRPropsCanvas = QRProps & CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & SVGProps<SVGSVGElement>;
/**
 * React's `QRCode` props: `QRCodeProps` (the logo API included) plus the
 * SVG attributes, which go on the `<svg>` as with `QRCodeSVG`.
 */
export type QRCodePropsSVG = QRCodeProps & SVGProps<SVGSVGElement>;
