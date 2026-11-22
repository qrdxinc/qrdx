// Prop types of the React components. Only the React entry (and the
// `qrdx/types` entry, for compatibility) reach this file; the core's types
// never do, so they work without React's types installed.
import type { CanvasHTMLAttributes, ReactElement, Ref, SVGProps } from "react";
import type { FrameTreeOptions } from "../src/frame";
import type { QRCodeProps } from "../src/qr-code-props";
import type { QRProps } from "./qr";

/**
 * What the React components return: `ReactElement<any, any>`, the type that
 * React 18 and 19's types call `JSX.Element`. It's spelled out because the
 * `react` module of @types/react 16 and 17 has no `JSX` to import.
 */
export type ReactQRElement = ReactElement<any, any>;

/**
 * React's attributes for the `<svg>`, with `ref` a ref object or callback.
 * @types/react 16 to 18 also allow a string there (a legacy string ref,
 * which React never took on a function component), and with it a typed set
 * of these props didn't type-check when spread into `QRCode`, a memo
 * component, under those versions' types. React 19's types are the same
 * either way.
 */
type SVGRootProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  ref?: Ref<SVGSVGElement>;
};

export type QRPropsCanvas = QRProps & CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & SVGRootProps;
/**
 * React's `QRCode` props: `QRCodeProps` (the logo API included) plus the
 * SVG attributes, which go on the `<svg>` as with `QRCodeSVG`.
 */
export type QRCodePropsSVG = QRCodeProps & SVGRootProps;

/**
 * `QRFrameSVG`'s props: the frame, the code size it's laid out around and
 * the code's background, an optional element for the code's slot, and SVG
 * attributes for the outer `<svg>`.
 */
export type QRFrameSVGProps = Omit<FrameTreeOptions, "slot" | "svgProps"> & {
  slot?: ReactElement;
} & Omit<SVGProps<SVGSVGElement>, "children" | "slot">;
