// A frame drawn on its own (createFrameTree, QRFrameSVG): the framed code's
// markup with an empty slot, or the caller's element, where the code goes,
// and no code drawn at all.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createFrameTree, getFrameLayout } from "../src/frame";
import { OFFICIAL_FRAMES } from "../src/frames/official";
import { QRFrameSVG } from "../src/index";
import { h } from "../src/jsx/runtime";
import { renderToString } from "../src/render/string";
import { toSVGString } from "../src/svg";
import type { AnyQRFrame } from "../types";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const SIZE = 200;
const BUILT_IN: AnyQRFrame = {
  style: "banner-bottom",
  text: "Scan for our menu",
};
const CUSTOM: AnyQRFrame = {
  style: "custom",
  spec: (OFFICIAL_FRAMES[0] as (typeof OFFICIAL_FRAMES)[number]).spec,
};

/** The code's nested <svg> in a framed code (no template, so no svg in it). */
function codeElement(markup: string): string {
  const start = markup.indexOf("<svg", 1);
  return markup.slice(start, markup.indexOf("</svg>", start) + "</svg>".length);
}

describe("createFrameTree", () => {
  it.each([
    ["a built-in frame", BUILT_IN],
    ["a custom frame", CUSTOM],
  ])("draws %s exactly as around a code, with an empty slot", (_, frame) => {
    const framed = toSVGString({ value: VALUE, size: SIZE, frame });
    const alone = renderToString(createFrameTree({ frame, size: SIZE }));
    const layout = getFrameLayout(SIZE, frame);
    const slot = `<svg height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" xmlns="http://www.w3.org/2000/svg" x="${layout.qrX}" y="${layout.qrY}"></svg>`;

    // Everything but the code is the same markup
    expect(alone.replace(slot, "")).toBe(
      framed.replace(codeElement(framed), "")
    );
    expect(alone).toContain(slot);
    // No modules, eyes or code background: the slot is the only nested svg
    expect(alone.match(/<svg\b/g)).toHaveLength(2);
  });

  it("puts the slot where the code goes, sized as the code", () => {
    const layout = getFrameLayout(SIZE, BUILT_IN);
    const slot = h("svg", { "data-slot": "", viewBox: "0 0 10 10" });
    const markup = renderToString(
      createFrameTree({ frame: BUILT_IN, size: SIZE, slot })
    );
    expect(markup).toContain(
      `<svg data-slot="" viewBox="0 0 10 10" x="${layout.qrX}" y="${layout.qrY}" width="${SIZE}" height="${SIZE}"></svg>`
    );
  });

  it("puts attributes on the outer <svg>", () => {
    const markup = renderToString(
      createFrameTree({
        frame: BUILT_IN,
        svgProps: { "aria-hidden": "true", className: "frame" },
      })
    );
    expect(markup.slice(0, markup.indexOf(">"))).toMatch(
      /aria-hidden="true" class="frame"$/
    );
  });

  it("draws the slot alone without an active frame", () => {
    const markup = renderToString(
      createFrameTree({ frame: { style: "none" }, size: 64 })
    );
    expect(markup).toBe(
      '<svg height="64" viewBox="0 0 64 64" width="64" xmlns="http://www.w3.org/2000/svg"><svg height="64" viewBox="0 0 64 64" width="64" xmlns="http://www.w3.org/2000/svg" x="0" y="0"></svg></svg>'
    );
  });
});

describe("QRFrameSVG", () => {
  it("renders the core's markup with a React element in the slot", () => {
    const html = renderToStaticMarkup(
      <QRFrameSVG
        aria-hidden
        className="frame"
        frame={CUSTOM}
        size={SIZE}
        slot={<svg data-slot="" viewBox="0 0 10 10" />}
      />
    );
    const core = renderToString(
      createFrameTree({
        frame: CUSTOM,
        size: SIZE,
        slot: h("svg", { "data-slot": "", viewBox: "0 0 10 10" }),
        svgProps: { "aria-hidden": true, className: "frame" },
      })
    );
    expect(html).toBe(core);
  });
});
