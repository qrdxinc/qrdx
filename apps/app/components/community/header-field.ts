// The ASCII field behind the community header (./header-field-art.tsx): a
// QR code for the community's own address drawn in monospace glyphs, dense
// where its modules are dark, dissolving into a faint dither toward its
// edges and a little noise around it. Pure and deterministic: the same code
// and size always give the same rows, so the server draws the first frame
// and the browser only re-rolls a few glyphs at a time. No "use client":
// the layout builds the rows, the browser gets them as strings.

import { getQRAsSVGNode } from "qrdx";
import { hash2, smoothstep, valueNoise } from "@/components/fx/engine";
import { RAMP } from "@/components/fx/glyphs";

/** The densest glyph's index in RAMP. */
const TOP = RAMP.length - 1;

/** Columns and rows of the field at its smallest. */
export const FIELD_COLS = 128;
export const FIELD_ROWS = 35;

/** Light modules around the code, as a scanner expects. */
const QUIET = 2;
/** Columns between the code's right edge and the field's. */
const RIGHT = 8;
/** Modules over which the code's edge dissolves into the dither. */
const DISSOLVE = 2.5;
/** How fast the noise around the code fades, in modules. */
const HALO = 6;

/** 4 × 4 ordered dither thresholds (Bayer), 0…15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * The glyph for a 0…1 density at a cell, dithered by its position: half an
 * ordered pattern, half a hash, so faint areas read as grain, not a lattice.
 */
function glyphAt(density: number, col: number, row: number): string {
  const ordered = ((BAYER[(row % 4) * 4 + (col % 4)] ?? 0) + 0.5) / 16;
  const threshold = (ordered + hash2(col, row)) / 2;
  const level = Math.floor(density * TOP + threshold);
  return RAMP[Math.min(TOP, Math.max(0, level))] ?? " ";
}

/** The field's size for a code `modules` wide: never smaller than the default. */
export function fieldSize(modules: number): { cols: number; rows: number } {
  const span = modules + QUIET * 2;
  return {
    cols: Math.max(FIELD_COLS, span * 2 + RIGHT + 48),
    rows: Math.max(FIELD_ROWS, span + 6),
  };
}

/**
 * The field's rows for a code (`modules[y][x]`, true = dark). A module is
 * two glyphs wide and one row tall, square in a monospace face with a line
 * height of 1.2. The code sits at the right, centred top to bottom.
 */
export function fieldRows(
  modules: readonly (readonly boolean[])[],
  size = fieldSize(modules.length),
): string[] {
  const n = modules.length;
  const span = n + QUIET * 2;
  const { cols, rows } = size;
  const left = cols - RIGHT - span * 2;
  const top = Math.floor((rows - span) / 2);
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let col = 0; col < cols; col++) {
      // Position in modules, the quiet zone included.
      const mx = Math.floor((col - left) / 2);
      const my = row - top;
      // A cell is half as wide as it is tall: stretch the noise to match.
      const noise = valueNoise(col * 0.11, row * 0.22) ** 2 * 0.5;
      let density: number;
      if (mx >= 0 && my >= 0 && mx < span && my < span) {
        const edge = Math.min(mx, my, span - 1 - mx, span - 1 - my);
        const keep = smoothstep(Math.min(1, edge / DISSOLVE));
        const x = mx - QUIET;
        const y = my - QUIET;
        const inCode = x >= 0 && y >= 0 && x < n && y < n;
        const module = inCode ? (modules[y]?.[x] ? 0.94 : 0.04) : 0.02;
        density = noise * (1 - keep) + module * keep;
      } else {
        // Distance to the code's box, in modules.
        const dx = Math.max(-mx, mx - span + 1, 0);
        const dy = Math.max(-my, my - span + 1, 0);
        density = noise * Math.exp(-Math.hypot(dx, dy) / HALO);
      }
      line += glyphAt(density, col, row);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The dark modules of a QR code for `value`, from the engine's plain SVG:
 * no margin, so its one dark path is a run of one-row rectangles
 * ("M x y h w v1 H x z") over a `size` × `size` grid.
 */
export async function qrModules(value: string): Promise<boolean[][]> {
  const svg = await getQRAsSVGNode({
    value,
    level: "L",
    margin: 0,
    fgColor: "#000000",
    bgColor: "#ffffff",
  });
  const paths: { d: string; fill: unknown }[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const { type, props } = node as {
      type: unknown;
      props: { children?: unknown; d?: unknown; fill?: unknown };
    };
    if (type === "path" && typeof props.d === "string") {
      paths.push({ d: props.d, fill: props.fill });
    }
    walk(props.children);
  };
  walk(svg);
  const viewBox = (svg as { props?: { viewBox?: unknown } }).props?.viewBox;
  const size = Number(String(viewBox ?? "").split(" ")[2]);
  const dark = paths.find((path) => path.fill === "#000000");
  if (!(dark && Number.isInteger(size) && size > 0)) {
    throw new Error("The engine's plain QR code has no dark path to read");
  }
  const modules = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );
  for (const run of dark.d.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) {
    const [x, y, width] = [Number(run[1]), Number(run[2]), Number(run[3])];
    const line = modules[y];
    if (!line) continue;
    for (let i = x; i < x + width && i < size; i++) line[i] = true;
  }
  return modules;
}
