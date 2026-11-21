// React's QRCode keeps the code's layout (getQRCodeData) between renders and
// lays it out again only when a prop it reads changes. An editor turns a look
// on by re-rendering the same mounted QRCode with one more prop, and the
// looks (per-eye shapes, the eyes' gradient span, the rounded background and
// its backdrop, the halo and the shadow) were missing from that check: on
// qrdx.dev the preview kept drawing the code without them (21 Nov 2026),
// framed or not, while the scan score judged the new design. Each look here
// is turned on in a mounted QRCode, the way the playground's preview and the
// dashboard's code previews draw, and must draw exactly what a QRCode
// mounted with it draws, then go away again when it is turned off.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { QRCode } from "../src/index";
import type { QRCodeProps } from "../src/qr-code-props";
import {
  allLooks,
  eyePart,
  LOOK_BASE,
  LOOK_FRAMINGS,
  LOOK_STEPS,
  lookToggles,
} from "./support/look-steps";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

/** A mounted QRCode and a way to re-render it with new props. */
function mount(props: QRCodeProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(createElement(QRCode, props)));
  return {
    container,
    rerender: (next: QRCodeProps) =>
      act(() => root.render(createElement(QRCode, next))),
    svg: () => container.querySelector("svg") as SVGSVGElement,
  };
}

/** What a QRCode mounted with `props` draws. */
function freshMarkup(props: QRCodeProps): string {
  return mount(props).container.innerHTML;
}

/** The top-right eye frame of `props` drawn with square eyes. */
const squareEye = (props: QRCodeProps) =>
  eyePart(
    mount({ ...props, cornerEyePattern: "square" }).svg(),
    "eye-outer",
    "top-right"
  );

describe("React QRCode: a look turned on in a mounted code", () => {
  it.each(lookToggles().map((toggle) => [toggle.name, toggle] as const))(
    "%s: draws on the next render, as a fresh code with it does",
    (_name, { step, before, after }) => {
      const square = squareEye(before);
      const code = mount(before);
      const off = code.container.innerHTML;
      expect(step.shows(code.svg(), square)).toBe(false);

      code.rerender(after);
      expect(step.shows(code.svg(), square)).toBe(true);
      expect(code.container.innerHTML).toBe(freshMarkup(after));

      // And off again
      code.rerender(before);
      expect(step.shows(code.svg(), square)).toBe(false);
      expect(code.container.innerHTML).toBe(off);
    }
  );

  it.each(LOOK_FRAMINGS)(
    "%s: every look at once, then a change to one of them, redraws each time",
    (_framing, frame) => {
      const all = allLooks(frame);
      const square = squareEye(all);
      const code = mount({ ...LOOK_BASE, ...frame });
      code.rerender(all);
      for (const step of LOOK_STEPS) {
        expect(step.shows(code.svg(), square), step.name).toBe(true);
      }
      expect(code.container.innerHTML).toBe(freshMarkup(all));

      // The shadow's opacity and the radius moved, as their sliders do
      const moved: QRCodeProps = {
        ...all,
        shadow: { dx: 0.2, dy: 0.2, opacity: 0.2, color: "#000000" },
        bgRadius: 0.1,
      };
      code.rerender(moved);
      expect(code.container.innerHTML).toBe(freshMarkup(moved));
    }
  );
});
