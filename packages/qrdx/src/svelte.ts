/** biome-ignore-all lint/performance/noBarrelFile: the Svelte entry re-exports the core */
// qrdx/svelte: a Svelte action that draws the code into an element and
// keeps it up to date, `<div use:qrcode={options}></div>`. An action is a
// plain function, so building the package needs no Svelte compiler, and this
// file imports nothing from Svelte: it works with any Svelte that runs
// actions. Actions don't run on a server, so a server-rendered page writes
// the markup itself with `{@html toSVGString(options)}` inside the element,
// and the action takes that <svg> over when the page hydrates instead of
// drawing it again. Everything in qrdx/core is re-exported, so one import
// covers a component. Built as dist/svelte.mjs, which imports dist/core.mjs.

import {
  createQRCodeTree,
  type QRSVGOptions,
  renderToDOM,
  renderToString,
} from "./core";

export * from "./core";

const SVG_NS = "http://www.w3.org/2000/svg";

/** What `qrcode` returns to Svelte: the action's `update` and `destroy`. */
export interface QRCodeActionReturn {
  /** Redraws the code with `options`; the page is left alone when the markup is the same */
  update(options: QRSVGOptions): void;
  /** Removes the code from the element */
  destroy(): void;
}

/** The first `<svg>` among the element's children, if it has one. */
function svgChild(node: Element): Element | null {
  for (const child of node.children) {
    if (child.localName === "svg" && child.namespaceURI === SVG_NS) {
      return child;
    }
  }
  return null;
}

/**
 * A Svelte action that draws a QR code into the element and redraws it when
 * the options change. Takes every option `QRCodeSVG` takes; attributes such
 * as `class` or `aria-label` go on the `<svg>`. If the element already holds
 * an `<svg>` (the server's markup from `{@html toSVGString(options)}`), the
 * action keeps it when it is the same code and replaces it otherwise.
 *
 * @example
 * <div use:qrcode={{ value: "https://qrdx.dev", size: 256 }}></div>
 */
export function qrcode(
  node: Element,
  options: QRSVGOptions
): QRCodeActionReturn {
  let svg: Element | null = null;
  let markup = "";

  const draw = (next: QRSVGOptions) => {
    const tree = createQRCodeTree(next);
    const nextMarkup = renderToString(tree);
    if (svg?.parentNode === node && nextMarkup === markup) {
      return;
    }
    const element = renderToDOM(tree, node.ownerDocument).firstChild as Element;
    // Ours while it's in the element; otherwise the first <svg> there: the
    // server's, or one a {@html} redraw put in place of ours
    const current = svg?.parentNode === node ? svg : svgChild(node);
    if (current?.isEqualNode(element)) {
      svg = current;
    } else {
      if (current) {
        current.replaceWith(element);
      } else {
        node.appendChild(element);
      }
      svg = element;
    }
    markup = nextMarkup;
  };

  draw(options);

  return {
    update: draw,
    destroy() {
      svg?.remove();
      svg = null;
      markup = "";
    },
  };
}
