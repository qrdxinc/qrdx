import type { QRFrameSVGProps, ReactQRElement } from "../types/react";
import { createFrameTree } from "./frame";
import { type QRNode, withElementFactory } from "./jsx/runtime";
import { REACT_ELEMENTS } from "./react-elements";

/**
 * A frame on its own, as a React component: `createFrameTree` drawn with
 * React's elements, so its markup is the core's. The code's slot holds
 * `slot` (a React element, placed and sized as the code would be) or is
 * left empty. No hooks: it renders in React Server Components too.
 */
export function QRFrameSVG({
  frame,
  size,
  bgColor,
  slot,
  ...svgProps
}: QRFrameSVGProps): ReactQRElement {
  // Drawn with React's elements, the tree's nodes are React elements: the
  // slot is placed with React's cloneElement.
  const node = slot as unknown as QRNode | undefined;
  return withElementFactory(REACT_ELEMENTS, () =>
    createFrameTree({ frame, size, bgColor, slot: node, svgProps })
  ) as unknown as ReactQRElement;
}
