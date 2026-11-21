/** biome-ignore-all lint/style/noMagicNumbers: look settings under test */
// The looks (src/looks.ts) as an editor turns them on: per-eye shapes, the
// eyes' gradient span, the rounded background and its backdrop, the halo and
// the shadow. Each step is the props a code starts from and the props with
// the look on, unframed and in a frame. The components' tests turn each look
// on and off in a mounted code and compare what's on the page with what the
// core draws for the same props: React's QRCode kept its old drawing when a
// look changed (qrdx.dev, 21 Nov 2026), and no adapter may.
import type { QRCodeProps } from "../../src/qr-code-props";

/** The editor's "Folio" look, the design the bug was reported on. */
export const LOOK_BASE: QRCodeProps = {
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
};

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
export const eyePart = (svg: Element, part: string, eye: string) =>
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

export interface LookStep {
  name: string;
  /** What the code starts from (the look's prerequisites, without it) */
  base?: Partial<QRCodeProps>;
  /** The look turned on */
  on: Partial<QRCodeProps>;
  /**
   * True when `svg` shows the look; `squareEye` is the top-right eye frame
   * of the same code drawn with square eyes (eyePart).
   */
  shows: (svg: Element, squareEye: string | undefined) => boolean;
}

export const LOOK_STEPS: LookStep[] = [
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
    // The top-right eye as a code with square eyes draws it
    shows: (svg, squareEye) =>
      eyePart(svg, "eye-outer", "top-right") === squareEye,
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

/** Each look on its own, without a frame and in the Bubble frame. */
export const LOOK_FRAMINGS = [
  ["unframed", {}],
  ["framed (Bubble)", { frame: { style: "speech-bubble", text: "Scan me" } }],
] as const;

export interface LookToggle {
  /** "shadow, framed (Bubble)" */
  name: string;
  step: LookStep;
  before: QRCodeProps;
  after: QRCodeProps;
}

/** Every look step in every framing, as the props before and after. */
export function lookToggles(): LookToggle[] {
  return LOOK_FRAMINGS.flatMap(([framing, frame]) =>
    LOOK_STEPS.map((step) => {
      const before: QRCodeProps = { ...LOOK_BASE, ...frame, ...step.base };
      return {
        name: `${step.name}, ${framing}`,
        step,
        before,
        after: { ...before, ...step.on },
      };
    })
  );
}

/** Every look at once, in a framing. */
export const allLooks = (frame: Partial<QRCodeProps> = {}): QRCodeProps =>
  Object.assign(
    { ...LOOK_BASE, ...frame },
    ...LOOK_STEPS.map((step) => ({ ...step.base, ...step.on }))
  );
