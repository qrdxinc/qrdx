// What the study renders and how it photographs each render. One baseline
// code, changed one factor at a time:
//
//   baseline: a 33-character URL, error correction M (exactly M: the engine
//   would otherwise raise the level when the data still fits), square
//   modules and eyes, black on white, a 4-module quiet zone, no logo, on a
//   white page.
//
// Every design variant (shapes, logo, contrast, quiet zone) is encoded with
// twelve different URLs of the same length (so twelve different module
// layouts) and captured under the five standard conditions below: 60 images
// per variant, each read by every decoder. The module-size and degradation
// sweeps use the baseline design with 24 URLs and vary the capture instead.

import { contrastRatio, greyForContrast, seeded } from "./lib/image.mjs";

// --- Content ----------------------------------------------------------------

const SLUG_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** URLs of 33 characters: version 3 at L and M, version 4 at Q and H. */
export const PAYLOADS = Array.from({ length: 24 }, (_, i) => {
  const random = seeded(1000 + i);
  let slug = "";
  for (let k = 0; k < 11; k++) {
    slug += SLUG_CHARS[Math.floor(random() * SLUG_CHARS.length)];
  }
  return `https://example.com/p/${slug}`;
});

/** How many of PAYLOADS each design variant uses (the sweeps use all). */
export const DESIGN_PAYLOADS = 12;

// --- Captures ---------------------------------------------------------------

/**
 * The standard capture set every design variant goes through:
 * - crisp: a clean render at 8 px per module, as a screenshot or a scan;
 * - phone far / mid / close: QRdx's scan-score camera model (contrast down to
 *   70% and a blur about a quarter module wide) at 4, 6 and 9 px per module;
 * - rough: 5 px per module, turned 25° away from the camera, blurred
 *   (σ = 0.35 module), contrast down to 80%, sensor noise (σ = 6 of 255) and
 *   saved as a quality-50 JPEG.
 */
export const STANDARD_CONDITIONS = [
  { id: "crisp", label: "Crisp, 8 px/module", modulePx: 8, ops: [] },
  {
    id: "phone-far",
    label: "Camera model, 4 px/module",
    modulePx: 4,
    ops: [{ op: "camera" }],
  },
  {
    id: "phone-mid",
    label: "Camera model, 6 px/module",
    modulePx: 6,
    ops: [{ op: "camera" }],
  },
  {
    id: "phone-close",
    label: "Camera model, 9 px/module",
    modulePx: 9,
    ops: [{ op: "camera" }],
  },
  {
    id: "rough",
    label: "Rough phone shot, 5 px/module",
    modulePx: 5,
    ops: [
      { op: "tilt", degrees: 25 },
      { op: "blur", sigmaModules: 0.35 },
      { op: "flatten", factor: 0.8 },
      { op: "noise", sigma: 6 },
      { op: "jpeg", quality: 50 },
    ],
  },
];

/** Pixels per module for the size sweep. */
export const MODULE_SIZES = [
  1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4, 5, 6, 8, 10,
];

const sizeConditions = MODULE_SIZES.flatMap((px) => [
  {
    id: `size-${px}-crisp`,
    label: `${px} px/module, crisp`,
    modulePx: px,
    ops: [],
    series: "crisp",
    x: px,
  },
  {
    id: `size-${px}-soft`,
    label: `${px} px/module, sensor blur`,
    modulePx: px,
    // A fixed lens and sensor blur, the same in pixels at every size
    ops: [
      { op: "blurPx", sigma: 0.7 },
      { op: "flatten", factor: 0.85 },
      { op: "noise", sigma: 4 },
    ],
    series: "soft",
    x: px,
  },
]);

const DEGRADE_PX = 6;

const degradeConditions = [
  ...[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1].map((s) => ({
    id: `blur-${s}`,
    label: `Blur σ = ${s} module`,
    modulePx: DEGRADE_PX,
    ops: [{ op: "blur", sigmaModules: s }],
    series: "blur",
    x: s,
  })),
  ...[0, 16, 32, 48, 64, 80, 96, 128].map((s) => ({
    id: `noise-${s}`,
    label: `Noise σ = ${s}`,
    modulePx: DEGRADE_PX,
    ops: [{ op: "noise", sigma: s }],
    series: "noise",
    x: s,
  })),
  ...[95, 75, 50, 30, 20, 10, 5, 1].flatMap((q) => [
    {
      id: `jpeg-${q}-6px`,
      label: `JPEG quality ${q}, 6 px/module`,
      modulePx: DEGRADE_PX,
      ops: [{ op: "jpeg", quality: q }],
      series: "jpeg-6px",
      x: q,
    },
    {
      id: `jpeg-${q}-3px`,
      label: `JPEG quality ${q}, 3 px/module`,
      modulePx: 3,
      ops: [{ op: "jpeg", quality: q }],
      series: "jpeg-3px",
      x: q,
    },
  ]),
  ...[0, 15, 30, 40, 50, 55, 60, 65, 70, 75].map((d) => ({
    id: `tilt-${d}`,
    label: `Tilted ${d}°`,
    modulePx: DEGRADE_PX,
    ops: [{ op: "tilt", degrees: d }],
    series: "tilt",
    x: d,
  })),
];

// --- Designs ----------------------------------------------------------------

const SQUARE = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

const BASE = {
  level: "M",
  margin: 4,
  fgColor: "#000000",
  bgColor: "#ffffff",
  eyeColor: "#000000",
  dotColor: "#000000",
  ...SQUARE,
};

const colours = (fg, bg) => ({
  fgColor: fg,
  bgColor: bg,
  eyeColor: fg,
  dotColor: fg,
});

/** Colour pairs seen on printed codes: brand colours, pastels, light-on-dark. */
const COLOUR_PAIRS = [
  ["navy on white", "#1e3a8a", "#ffffff"],
  ["dark green on white", "#166534", "#ffffff"],
  ["red on white", "#dc2626", "#ffffff"],
  ["purple on white", "#7c3aed", "#ffffff"],
  ["orange on white", "#f97316", "#ffffff"],
  ["sky blue on white", "#38bdf8", "#ffffff"],
  ["pink on white", "#f472b6", "#ffffff"],
  ["yellow on white", "#facc15", "#ffffff"],
  ["brown on cream", "#78350f", "#fef3c7"],
  ["black on yellow", "#000000", "#facc15"],
  ["red on green", "#dc2626", "#16a34a"],
  ["blue on orange", "#1d4ed8", "#f97316"],
  ["lavender on pale lilac", "#a78bfa", "#f5f3ff"],
  ["white on black", "#ffffff", "#000000"],
  ["white on navy", "#ffffff", "#1e3a8a"],
  ["white on red", "#ffffff", "#dc2626"],
  ["gold on black", "#d4af37", "#000000"],
  ["yellow on dark blue", "#facc15", "#1e3a8a"],
];

const GREY_RATIOS = [21, 12, 7, 4.5, 3.5, 3, 2.5, 2, 1.75, 1.5, 1.3];

/**
 * Every design variant. `design` is passed to the engine (QRdx props) over
 * the baseline; `logoModules` clears a centred square that many modules wide
 * and draws a logo in it; `page` is what surrounds the code.
 */
export function designVariants(engine) {
  const variants = [];
  const add = (variant) =>
    variants.push({
      page: "white",
      logoModules: 0,
      conditions: "standard",
      score: true,
      ...variant,
      design: { ...BASE, ...variant.design },
    });

  // Shapes: the body, eye frames and eye centres, one at a time
  const retiredEyes = new Set(engine.RETIRED_CORNER_EYE_PATTERNS ?? []);
  const retiredDots = new Set(engine.RETIRED_CORNER_EYE_DOT_PATTERNS ?? []);
  for (const body of engine.BODY_PATTERN) {
    add({
      factor: "shape",
      group: "body",
      id: `body:${body}`,
      label: body,
      design: { bodyPattern: body },
    });
  }
  for (const eye of [
    ...engine.CORNER_EYE_PATTERNS,
    ...(engine.RETIRED_CORNER_EYE_PATTERNS ?? []),
  ]) {
    add({
      factor: "shape",
      group: "eye",
      id: `eye:${eye}`,
      label: eye,
      retired: retiredEyes.has(eye),
      design: { cornerEyePattern: eye },
    });
  }
  for (const dot of [
    ...engine.CORNER_EYE_DOT_PATTERNS,
    ...(engine.RETIRED_CORNER_EYE_DOT_PATTERNS ?? []),
  ]) {
    add({
      factor: "shape",
      group: "centre",
      id: `centre:${dot}`,
      label: dot,
      retired: retiredDots.has(dot),
      design: { cornerEyeDotPattern: dot },
    });
  }
  // QRdx's own default look: circle dots, gear eyes, circle centres
  const defaultLook = {
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
  };
  add({
    factor: "shape",
    group: "qrdx-default",
    id: "qrdx-default:M",
    label: "QRdx default look, level M",
    design: defaultLook,
  });
  add({
    factor: "shape",
    group: "qrdx-default",
    id: "qrdx-default:Q",
    label: "QRdx default look, level Q (the default level)",
    design: { ...defaultLook, level: "Q" },
  });

  // Logo size × error correction level. Versions: 3 (29 modules) at L and
  // M, 4 (33 modules) at Q and H; the logo clears 0 to ~42% of the width.
  for (const level of ["L", "M", "Q", "H"]) {
    const modules = level === "L" || level === "M" ? 29 : 33;
    for (let k = 0; k <= Math.round(modules * 0.42); k++) {
      add({
        factor: "logo",
        group: level,
        id: `logo:${level}:${k}`,
        label: `${k} of ${modules} modules (${((100 * k) / modules).toFixed(1)}%), level ${level}`,
        design: { level },
        logoModules: k,
        widthPct: (100 * k) / modules,
        areaPct: (100 * k * k) / (modules * modules),
      });
    }
  }

  // Contrast: grey on white, then colour pairs
  for (const ratio of GREY_RATIOS) {
    const fg = ratio === 21 ? "#000000" : greyForContrast(ratio);
    add({
      factor: "contrast",
      group: "grey",
      id: `contrast:grey:${ratio}`,
      label: `${fg} on white`,
      design: colours(fg, "#ffffff"),
      ratio: contrastRatio(fg, "#ffffff"),
      inverted: false,
    });
  }
  for (const [name, fg, bg] of COLOUR_PAIRS) {
    add({
      factor: "contrast",
      group: "colour",
      id: `contrast:pair:${name.replaceAll(" ", "-")}`,
      label: name,
      design: colours(fg, bg),
      ratio: contrastRatio(fg, bg),
      inverted: contrastRatio(fg, "#000000") > contrastRatio(bg, "#000000"),
    });
  }

  // Quiet zone 0–4 modules, on white, on a dark surface and on a busy one
  for (const page of ["white", "dark", "busy"]) {
    for (let margin = 0; margin <= 4; margin++) {
      add({
        factor: "quiet-zone",
        group: page,
        id: `quiet:${page}:${margin}`,
        label: `${margin} modules, ${page} surroundings`,
        design: { margin },
        page,
        quietModules: margin,
      });
    }
  }
  return variants;
}

/** The baseline design under the module-size and degradation sweeps. */
export function captureVariants() {
  return [
    {
      factor: "module-size",
      group: "baseline",
      id: "module-size",
      label: "Baseline design, pixels per module",
      design: BASE,
      page: "white",
      logoModules: 0,
      conditions: sizeConditions,
      score: false,
    },
    {
      factor: "degradation",
      group: "baseline",
      id: "degradation",
      label: "Baseline design, blur, noise, JPEG and tilt",
      design: BASE,
      page: "white",
      logoModules: 0,
      conditions: degradeConditions,
      score: false,
    },
  ];
}
