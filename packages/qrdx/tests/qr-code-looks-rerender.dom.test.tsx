/** biome-ignore-all lint/style/noMagicNumbers: look settings under test */
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
import { afterEach, describe, expect, it as test } from "vitest";
import { QRCode } from "../src/index";
import type { QRCodeProps } from "../src/qr-code-props";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The editor's "Folio" look, as the bug was reported on. */
const FOLIO: QRCodeProps = {
  value: "https://qrdx.dev",
  bgColor: "#FAF7F0",
  fgColor: "#1F1B16",
  eyeColor: "#1F1B16",
  dotColor: "#1F1B16",
  bodyPattern: "classy-rounded",
  cornerEyePattern: "leaf",
  cornerEyeDotPattern: "leaf",
  level: "Q",
  margin: 4,
  partMarkers: true,
  frameLabelMarkers: true,
};

const BUBBLE = { style: "speech-bubble", text: "Scan me" } as const;

const EYE_GRADIENT = {
  type: "linear" as const,
  angle: 45,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#7c3aed", offset: 100 },
  ],
};

const look = (svg: Element, name: string) =>
  svg.querySelectorAll(`[data-qrdx-look="${name}"]`).length;

/** The background's corner radius as drawn, 0 when it is square. */
const backgroundRadius = (svg: Element) =>
  Number(
    svg.querySelector('[data-qrdx-part="background"]')?.getAttribute("rx") ?? 0
  );

/** The markup inside one eye's part. */
const eyePart = (svg: Element, part: string, eye: string) =>
  svg.querySelector(`[data-qrdx-part="${part}"][data-qrdx-eye="${eye}"]`)
    ?.innerHTML;

/** Where the gradient painting an eye's frame starts across the code. */
function eyeGradientStart(svg: Element, eye: string): number | null {
  const fill = svg
    .querySelector(`[data-qrdx-part="eye-outer"][data-qrdx-eye="${eye}"]`)
    ?.getAttribute("fill");
  const id = /url\(#([^)]+)\)/.exec(fill ?? "")?.[1];
  const gradient = id ? svg.querySelector(`[id="${id}"]`) : null;
  return gradient ? Number(gradient.getAttribute("x1")) : null;
}

interface Look {
  name: string;
  /** What the code starts from (the look's prerequisites, without it). */
  base?: Partial<QRCodeProps>;
  /** The look turned on. */
  on: Partial<QRCodeProps>;
  /** True when `svg` shows the look. */
  shows: (svg: Element) => boolean;
}

const LOOKS: Look[] = [
  {
    name: "shadow",
    on: { shadow: { dx: 0.2, dy: 0.2, opacity: 0.35, color: "#000000" } },
    shows: (svg) => look(svg, "shadow") === 1,
  },
  {
    name: "rounded corners",
    on: { bgRadius: 0.21 },
    shows: (svg) => backgroundRadius(svg) > 0,
  },
  {
    name: "backdrop",
    base: { bgRadius: 0.21 },
    on: { bgRadius: 0.21, backdrop: "#1F1B16" },
    shows: (svg) => look(svg, "backdrop") === 1 && backgroundRadius(svg) > 0,
  },
  {
    name: "halo",
    // A rim no lighter than the background (looks.ts getHaloRisk)
    on: { halo: { color: "#e5e7eb", width: 0.25 } },
    shows: (svg) => look(svg, "halo") === 1,
  },
  {
    name: "eye shapes",
    on: { eyeShapes: { topRight: { outer: "square", inner: "square" } } },
    // The top-right eye drawn as a code with square eyes draws it
    shows: (svg) =>
      eyePart(svg, "eye-outer", "top-right") ===
      eyePart(
        mount({ ...FOLIO, cornerEyePattern: "square" }).svg(),
        "eye-outer",
        "top-right"
      ),
  },
  {
    name: "eye gradient across the eyes",
    base: { eyeColor: EYE_GRADIENT },
    on: { eyeColor: EYE_GRADIENT, eyeGradient: "code" },
    // Across the code, the top-right eye's gradient starts at its left edge;
    // per eye, at the eye's own
    shows: (svg) => eyeGradientStart(svg, "top-right") === 0,
  },
];

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

describe.each([
  ["unframed", {}],
  ["framed (Bubble)", { frame: BUBBLE }],
] as const)(
  "React QRCode, %s: a look turned on in a mounted code",
  (_, framing) => {
    test.each(LOOKS.map((item) => [item.name, item] as const))(
      "%s: draws on the next render, as a fresh code with it does",
      (_name, item) => {
        const before: QRCodeProps = { ...FOLIO, ...framing, ...item.base };
        const after: QRCodeProps = { ...before, ...item.on };
        const code = mount(before);
        const off = code.container.innerHTML;
        expect(item.shows(code.svg())).toBe(false);

        code.rerender(after);
        expect(item.shows(code.svg())).toBe(true);
        expect(code.container.innerHTML).toBe(freshMarkup(after));

        // And off again
        code.rerender(before);
        expect(item.shows(code.svg())).toBe(false);
        expect(code.container.innerHTML).toBe(off);
      }
    );

    test("every look at once, then a change to one of them, redraws each time", () => {
      const all: QRCodeProps = Object.assign(
        { ...FOLIO, ...framing },
        ...LOOKS.map((item) => ({ ...item.base, ...item.on }))
      );
      const code = mount({ ...FOLIO, ...framing });
      code.rerender(all);
      for (const item of LOOKS) {
        expect(item.shows(code.svg()), item.name).toBe(true);
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
    });
  }
);
