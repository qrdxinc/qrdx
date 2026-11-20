/** biome-ignore-all lint/style/noMagicNumbers: shape geometry */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: integer hashing */
// Geometry primitives for the module, eye, eye-dot and frame shapes. Every
// shape is plain path data (M/L/A/C/Z, absolute coordinates, no transforms),
// so the SVG, canvas (Path2D), PDF and EPS outputs draw exactly the same
// outline. Closed shapes run clockwise on screen (y down), so many of them in
// one path union cleanly under the nonzero fill rule.

import { fmt } from "./utils/fmt";

export type Point = [number, number];

/** Closed polygon through `points`. */
export function polygonPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }
  const [first, ...rest] = points as [Point, ...Point[]];
  return `M${fmt(first[0])} ${fmt(first[1])}${rest
    .map(([x, y]) => `L${fmt(x)} ${fmt(y)}`)
    .join("")}Z`;
}

/**
 * Clockwise circle as two arcs. A counter-clockwise one (`ccw`) inside a
 * clockwise shape cuts a hole under the nonzero rule.
 */
export function circlePath(
  cx: number,
  cy: number,
  r: number,
  ccw = false
): string {
  const sweep = ccw ? 0 : 1;
  return `M${fmt(cx - r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(cx + r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(cx - r)} ${fmt(cy)}Z`;
}

/**
 * Rectangle with its own radius per corner, clockwise from the top-left:
 * `[topLeft, topRight, bottomRight, bottomLeft]`.
 */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: [number, number, number, number] | number = 0
): string {
  const limit = Math.min(width, height) / 2;
  const [tl, tr, br, bl] = (
    typeof radii === "number" ? [radii, radii, radii, radii] : radii
  ).map((r) => Math.max(0, Math.min(r, limit))) as [
    number,
    number,
    number,
    number,
  ];
  const arc = (r: number, toX: number, toY: number) =>
    r > 0 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(toX)} ${fmt(toY)}` : "";
  return (
    `M${fmt(x + tl)} ${fmt(y)}` +
    `H${fmt(x + width - tr)}${arc(tr, x + width, y + tr)}` +
    `V${fmt(y + height - br)}${arc(br, x + width - br, y + height)}` +
    `H${fmt(x + bl)}${arc(bl, x, y + height - bl)}` +
    `V${fmt(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

/** Square with `cut` chamfered off each corner, clockwise from the top. */
export function octagonPoints(
  x: number,
  y: number,
  size: number,
  cut: number
): Point[] {
  return [
    [x + cut, y],
    [x + size - cut, y],
    [x + size, y + cut],
    [x + size, y + size - cut],
    [x + size - cut, y + size],
    [x + cut, y + size],
    [x, y + size - cut],
    [x, y + cut],
  ];
}

/** Radius of a superellipse |x/a|^n + |y/a|^n = 1 at `angle` (radians). */
export function superellipseRadius(
  a: number,
  exponent: number,
  angle: number
): number {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return a / (cos ** exponent + sin ** exponent) ** (1 / exponent);
}

/**
 * A radius with `count` round bumps, `depth` deep, the first one centred on
 * the right (angle 0): for radialPoints.
 */
export function bumpedRadius(
  radius: number,
  count: number,
  depth: number
): (angle: number) => number {
  return (angle) => radius - (depth * (1 - Math.cos(count * angle))) / 2;
}

/**
 * A superellipse radius (exponent 3) with a hand-drawn wobble: a sum of
 * sin(4θ) and sin(8θ), so it vanishes on the axes and the diagonals.
 */
export function doodleRadius(a: number): (angle: number) => number {
  return (angle) =>
    superellipseRadius(a, 3, angle) *
    (1 + 0.045 * Math.sin(4 * angle) + 0.03 * Math.sin(8 * angle));
}

/** Points of a regular polygon (clockwise), first vertex at `rotation` degrees. */
export function regularPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = -90
): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((rotation + (360 / sides) * i) * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

/** Points of a star with `points` tips, the first tip straight up. */
export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5
): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (Math.PI / points) * i;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

/**
 * Points of a superellipse |x/a|^e + |y/b|^e = 1 (a squircle when e = 4),
 * clockwise from the right.
 */
export function superellipsePoints(
  cx: number,
  cy: number,
  a: number,
  b: number,
  exponent = 4,
  steps = 64
): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    return [
      cx + a * Math.sign(cos) * Math.abs(cos) ** (2 / exponent),
      cy + b * Math.sign(sin) * Math.abs(sin) ** (2 / exponent),
    ];
  });
}

/**
 * Heart centered on (cx, cy), `size` wide; its height is about 0.92 × size.
 * Drawn clockwise from the top notch.
 */
export function heartPath(cx: number, cy: number, size: number): string {
  const s = size / 2;
  const p = (x: number, y: number) => `${fmt(cx + x * s)} ${fmt(cy + y * s)}`;
  return (
    `M${p(0, -0.52)}` +
    `C${p(0.18, -0.92)} ${p(0.98, -0.94)} ${p(1, -0.34)}` +
    `C${p(1, 0.12)} ${p(0.5, 0.48)} ${p(0, 0.92)}` +
    `C${p(-0.5, 0.48)} ${p(-1, 0.12)} ${p(-1, -0.34)}` +
    `C${p(-0.98, -0.94)} ${p(-0.18, -0.92)} ${p(0, -0.52)}Z`
  );
}

/** Rotates `points` by `degrees` around (cx, cy). */
export function rotatePoints(
  points: Point[],
  cx: number,
  cy: number,
  degrees: number
): Point[] {
  if (degrees === 0) {
    return points;
  }
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([x, y]) => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ]);
}

/**
 * Deterministic pseudo-random number in [0, 1) for a module position, so
 * "random" styles render the same markup on the server and the client.
 */
export function hash2(x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x + 0x9e_37_79_b9, 0x85_eb_ca_6b) ^
    Math.imul(y + salt, 0xc2_b2_ae_35);
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d);
  h = Math.imul(h ^ (h >>> 12), 0x29_7a_2d_39);
  h ^= h >>> 15;
  return (h >>> 0) / 4_294_967_296;
}

/** Small deterministic string hash (FNV-1a), base 36. */
export function hashString(value: string): string {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return (h >>> 0).toString(36);
}

/**
 * Points of an outline given in polar form, `radius(angle)` for the angle in
 * radians, sampled `steps` times clockwise from the right. Shapes whose
 * radius is a sum of cosines of multiples of 4θ keep their size on the axes
 * and the diagonals, where decoders measure the finder.
 */
export function radialPoints(
  cx: number,
  cy: number,
  radius: (angle: number) => number,
  steps = 96
): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps;
    const r = radius(t);
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
}

/**
 * Points of a ring edge with `teeth` flat-topped teeth, each `duty` of its
 * pitch wide, the first tooth centred on the top: tips at `outer`, gaps at
 * `inner`.
 */
export function toothedPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  teeth: number,
  duty = 0.5
): Point[] {
  const pitch = (2 * Math.PI) / teeth;
  const half = (pitch * duty) / 2;
  const points: Point[] = [];
  const at = (angle: number, r: number): Point => [
    cx + r * Math.cos(angle),
    cy + r * Math.sin(angle),
  ];
  for (let i = 0; i < teeth; i++) {
    const centre = -Math.PI / 2 + i * pitch;
    points.push(
      at(centre - half, inner),
      at(centre - half, outer),
      at(centre + half, outer),
      at(centre + half, inner)
    );
  }
  return points;
}

/**
 * Rectangle whose corners are scooped out by concave quarter circles of
 * radius `scoop` (clockwise, like roundedRectPath).
 */
export function scoopedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  scoop: number
): string {
  const s = Math.max(0, Math.min(scoop, Math.min(width, height) / 2));
  const arc = (toX: number, toY: number) =>
    `A${fmt(s)} ${fmt(s)} 0 0 0 ${fmt(toX)} ${fmt(toY)}`;
  return (
    `M${fmt(x + s)} ${fmt(y)}` +
    `H${fmt(x + width - s)}${arc(x + width, y + s)}` +
    `V${fmt(y + height - s)}${arc(x + width - s, y + height)}` +
    `H${fmt(x + s)}${arc(x, y + height - s)}` +
    `V${fmt(y + s)}${arc(x + s, y)}Z`
  );
}

/** Rectangle with a square notch of side `notch` cut from each corner. */
export function notchedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  notch: number
): string {
  const n = Math.max(0, Math.min(notch, Math.min(width, height) / 2));
  return polygonPath([
    [x + n, y],
    [x + width - n, y],
    [x + width - n, y + n],
    [x + width, y + n],
    [x + width, y + height - n],
    [x + width - n, y + height - n],
    [x + width - n, y + height],
    [x + n, y + height],
    [x + n, y + height - n],
    [x, y + height - n],
    [x, y + n],
    [x + n, y + n],
  ]);
}

/**
 * Rounded square whose sides pinch in slightly, like a cushion. Sides meet
 * the corners tangentially, so the outline has no kinks.
 */
export function cushionPath(
  x: number,
  y: number,
  size: number,
  radius: number,
  pinch: number
): string {
  const r = radius;
  const mid = size / 2;
  const pull = (mid - r) * 0.55;
  const P = (px: number, py: number) => `${fmt(x + px)} ${fmt(y + py)}`;
  return (
    `M${P(r, 0)}` +
    `C${P(r + pull, 0)} ${P(mid - pull, pinch)} ${P(mid, pinch)}` +
    `C${P(mid + pull, pinch)} ${P(size - r - pull, 0)} ${P(size - r, 0)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(size, r)}` +
    `C${P(size, r + pull)} ${P(size - pinch, mid - pull)} ${P(size - pinch, mid)}` +
    `C${P(size - pinch, mid + pull)} ${P(size, size - r - pull)} ${P(size, size - r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(size - r, size)}` +
    `C${P(size - r - pull, size)} ${P(mid + pull, size - pinch)} ${P(mid, size - pinch)}` +
    `C${P(mid - pull, size - pinch)} ${P(r + pull, size)} ${P(r, size)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(0, size - r)}` +
    `C${P(0, size - r - pull)} ${P(pinch, mid + pull)} ${P(pinch, mid)}` +
    `C${P(pinch, mid - pull)} ${P(0, r + pull)} ${P(0, r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(r, 0)}Z`
  );
}

/**
 * Shield: flat top with corners of `radius`, straight sides down to
 * `shoulder`, then curving to a point at the bottom. `m` scales the curve.
 */
export function shieldPath(
  x: number,
  y: number,
  size: number,
  radius: number,
  shoulder: number,
  m: number
): string {
  const mid = size / 2;
  const P = (px: number, py: number) => `${fmt(x + px)} ${fmt(y + py)}`;
  return (
    `M${P(radius, 0)}H${fmt(x + size - radius)}` +
    `A${fmt(radius)} ${fmt(radius)} 0 0 1 ${P(size, radius)}` +
    `V${fmt(y + shoulder)}` +
    `C${P(size, shoulder + 1.55 * m)} ${P(mid + 1.6 * m, size)} ${P(mid, size)}` +
    `C${P(mid - 1.6 * m, size)} ${P(0, shoulder + 1.55 * m)} ${P(0, shoulder)}` +
    `V${fmt(y + radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${P(radius, 0)}Z`
  );
}

/**
 * Arch: a square with its top two corners rounded by `top` and the bottom
 * two cut by `cut` (a chamfer), clockwise from the top-left.
 */
export function archPath(
  x: number,
  y: number,
  size: number,
  top: number,
  cut: number
): string {
  const r = Math.min(top, size / 2);
  const c = Math.max(0, Math.min(cut, size / 2));
  const P = (px: number, py: number) => `${fmt(x + px)} ${fmt(y + py)}`;
  return (
    `M${P(r, 0)}H${fmt(x + size - r)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${P(size, r)}` +
    `V${fmt(y + size - c)}L${P(size - c, size)}H${fmt(x + c)}L${P(0, size - c)}` +
    `V${fmt(y + r)}A${fmt(r)} ${fmt(r)} 0 0 1 ${P(r, 0)}Z`
  );
}

/**
 * Square with chamfered corners (`cut` along each edge) and semicircular
 * bites of radius `bite` taken out of each side at `offsets` from the
 * side's middle, like the edge of a postage stamp. Clockwise.
 */
export function stampPath(
  x: number,
  y: number,
  size: number,
  cut: number,
  bite: number,
  offsets: number[]
): string {
  const mid = size / 2;
  const sorted = [...offsets].sort((a, b) => a - b);
  // One side, drawn left to right along the top; the others are the same
  // side turned around the centre.
  const bites = sorted.map((offset): Point[] => [
    [mid + offset - bite, 0],
    [mid + offset + bite, 0],
  ]);
  const turn = (point: Point, quarter: number): Point => {
    const [px, py] = [point[0] - mid, point[1] - mid];
    const [qx, qy] =
      quarter === 0
        ? [px, py]
        : quarter === 1
          ? [-py, px]
          : quarter === 2
            ? [-px, -py]
            : [py, -px];
    return [x + mid + qx, y + mid + qy];
  };
  let d = "";
  for (let quarter = 0; quarter < 4; quarter++) {
    const start = turn([cut, 0], quarter);
    d += quarter === 0 ? `M${fmt(start[0])} ${fmt(start[1])}` : "";
    for (const [from, to] of bites) {
      const a = turn(from, quarter);
      const b = turn(to, quarter);
      d += `L${fmt(a[0])} ${fmt(a[1])}A${fmt(bite)} ${fmt(bite)} 0 0 0 ${fmt(b[0])} ${fmt(b[1])}`;
    }
    const end = turn([size - cut, 0], quarter);
    d += `L${fmt(end[0])} ${fmt(end[1])}`;
    const next = turn([cut, 0], (quarter + 1) % 4);
    d += `L${fmt(next[0])} ${fmt(next[1])}`;
  }
  return `${d}Z`;
}
