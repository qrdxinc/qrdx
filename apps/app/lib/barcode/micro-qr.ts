// Which Micro QR symbol (ISO/IEC 18004) bwip-js draws for a text: its
// version, M1 to M4, and its error correction level. Pure, with no
// renderer, so the barcode generator can check a value and say what it will
// draw before bwip-js loads.
//
// bwip-js (BWIPP) splits the text into numeric, alphanumeric and byte
// segments with a heuristic of its own, which isn't always the shortest
// split. The capacity check has to agree with the drawing, so this is that
// heuristic, ported from BWIPP's qrcode encoder for Micro QR, with Kanji mode
// off (draw.ts sets suppresskanjimode: the text is UTF-8, never Shift JIS).
// tests/barcode/micro-qr.test.ts checks it against bwip-js.
//
// The rest reads a drawn symbol's modules and judges its mask, so draw.ts
// can avoid the masks ZXing's detector misses (microQrCornerShows).

export type MicroQrVersion = "M1" | "M2" | "M3" | "M4";
export type MicroQrLevel = "L" | "M" | "Q";

export interface MicroQrSymbol {
  version: MicroQrVersion;
  /** Modules on a side, quiet zone not included */
  modules: number;
  /** "L" for M1, which only detects errors */
  level: MicroQrLevel;
}

const N = 0;
const A = 1;
const B = 2;
type Mode = typeof N | typeof A | typeof B;

interface VersionSpec {
  version: MicroQrVersion;
  modules: number;
  /** Mode indicator length in bits */
  indicator: number;
  /** Character count indicator lengths, by mode; 0 where the mode is missing */
  count: readonly [number, number, number];
  /** Data bits each level leaves, smallest error correction first */
  capacity: readonly (readonly [MicroQrLevel, number])[];
  /** BWIPP's mode optimisation thresholds for this version group */
  t: Thresholds;
}

/** Never reached: BWIPP's `e`. */
const E = 10_000;

interface Thresholds {
  mode0forceA: number;
  mode0forceN: number;
  mode0forceKB: number;
  mode0NbeforeB: number;
  modeBAbeforeB: number;
  modeBAbeforeN: number;
  modeBAbeforeE: number;
  modeBNbeforeB: number;
  modeBNbeforeA: number;
  modeBNbeforeE: number;
  modeANbeforeA: number;
  modeANbeforeB: number;
  modeANbeforeE: number;
}

// The Micro QR columns of BWIPP's tables (qrcode.mode0forceKB and the rest,
// barcode.ps 2026052800), and the data modules qrcode.metrics leaves at each
// level: M1 and M3 end in a 4-bit codeword.
const VERSIONS: readonly VersionSpec[] = [
  {
    version: "M1",
    modules: 11,
    indicator: 0,
    count: [3, 0, 0],
    capacity: [["L", 20]],
    t: {
      mode0forceA: E,
      mode0forceN: 1,
      mode0forceKB: E,
      mode0NbeforeB: E,
      modeBAbeforeB: E,
      modeBAbeforeN: E,
      modeBAbeforeE: E,
      modeBNbeforeB: E,
      modeBNbeforeA: E,
      modeBNbeforeE: E,
      modeANbeforeA: E,
      modeANbeforeB: E,
      modeANbeforeE: E,
    },
  },
  {
    version: "M2",
    modules: 13,
    indicator: 1,
    count: [4, 3, 0],
    capacity: [
      ["L", 40],
      ["M", 32],
    ],
    t: {
      mode0forceA: 1,
      mode0forceN: 1,
      mode0forceKB: E,
      mode0NbeforeB: E,
      modeBAbeforeB: E,
      modeBAbeforeN: E,
      modeBAbeforeE: E,
      modeBNbeforeB: E,
      modeBNbeforeA: E,
      modeBNbeforeE: E,
      modeANbeforeA: 5,
      modeANbeforeB: E,
      modeANbeforeE: 3,
    },
  },
  {
    version: "M3",
    modules: 15,
    indicator: 2,
    count: [5, 4, 4],
    capacity: [
      ["L", 84],
      ["M", 68],
    ],
    t: {
      mode0forceA: 1,
      mode0forceN: 1,
      mode0forceKB: 1,
      mode0NbeforeB: 2,
      modeBAbeforeB: 6,
      modeBAbeforeN: 6,
      modeBAbeforeE: 3,
      modeBNbeforeB: 3,
      modeBNbeforeA: 3,
      modeBNbeforeE: 2,
      modeANbeforeA: 7,
      modeANbeforeB: 7,
      modeANbeforeE: 4,
    },
  },
  {
    version: "M4",
    modules: 17,
    indicator: 3,
    count: [6, 5, 5],
    capacity: [
      ["L", 128],
      ["M", 112],
      ["Q", 80],
    ],
    t: {
      mode0forceA: 1,
      mode0forceN: 1,
      mode0forceKB: 1,
      mode0NbeforeB: 3,
      modeBAbeforeB: 7,
      modeBAbeforeN: 8,
      modeBAbeforeE: 4,
      modeBNbeforeB: 4,
      modeBNbeforeA: 4,
      modeBNbeforeE: 3,
      modeANbeforeA: 9,
      modeANbeforeB: 9,
      modeANbeforeE: 5,
    },
  },
];

/** Micro QR's largest symbol, M4 at level L. */
export const MICRO_QR_LIMITS = { digits: 35, alphanumeric: 21, bytes: 15 };

const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39;
/** Alphanumeric mode's characters other than digits. */
const ALPHA = new Set([..." $%*+-./:ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(code));
function code(char: string): number {
  return char.charCodeAt(0);
}

/** Run lengths and distances BWIPP's heuristic reads, per byte. */
function runs(msg: Uint8Array) {
  const n = msg.length;
  const numNs = new Array<number>(n + 1).fill(0);
  const numAs = new Array<number>(n + 1).fill(0);
  const numAorNs = new Array<number>(n + 1).fill(0);
  const numBs = new Array<number>(n + 1).fill(0);
  const nextNs = new Array<number>(n + 1).fill(0);
  const nextAs = new Array<number>(n + 1).fill(0);
  const nextBs = new Array<number>(n + 1).fill(0);
  nextNs[n] = 9999;
  nextAs[n] = 9999;
  nextBs[n] = 9999;
  for (let i = n - 1; i >= 0; i--) {
    const byte = msg[i] as number;
    if (isDigit(byte)) {
      nextNs[i] = 0;
      numNs[i] = (numNs[i + 1] as number) + 1;
      numAorNs[i] = (numAorNs[i + 1] as number) + 1;
    } else {
      nextNs[i] = (nextNs[i + 1] as number) + 1;
    }
    if (ALPHA.has(byte)) {
      nextAs[i] = 0;
      numAs[i] = (numAs[i + 1] as number) + 1;
      numAorNs[i] = (numAorNs[i + 1] as number) + 1;
    } else {
      nextAs[i] = (nextAs[i + 1] as number) + 1;
    }
    if (numNs[i] === 0 && numAs[i] === 0) {
      nextBs[i] = 0;
      numBs[i] = (numBs[i + 1] as number) + 1;
    } else {
      nextBs[i] = (nextBs[i + 1] as number) + 1;
    }
  }
  return { numNs, numAs, numAorNs, numBs, nextNs, nextAs, nextBs };
}

/** BWIPP's segments for `msg` in one version, or null if it can't hold them. */
function segments(
  msg: Uint8Array,
  spec: VersionSpec,
): { mode: Mode; length: number }[] | null {
  const n = msg.length;
  const r = runs(msg);
  const t = spec.t;
  const at = (array: number[], index: number) => array[index] as number;
  const out: { mode: Mode; length: number }[] = [];
  let mode: Mode | -1 = -1;
  let i = 0;
  while (i < n) {
    const numN = at(r.numNs, i);
    const numA = at(r.numAs, i);
    const numB = at(r.numBs, i);
    const numAorN = at(r.numAorNs, i);
    // M1 holds digits only, M2 no bytes.
    if (spec.version === "M1" && (numA > 0 || numB > 0)) return null;
    if (spec.version === "M2" && numB > 0) return null;
    const aBefore = (min: number, next: number[]) =>
      numA >= min && at(next, numA + i) === 0;
    const nBefore = (min: number, next: number[]) =>
      numN >= min && at(next, numN + i) === 0;
    const aBeforeEnd = (min: number) => numA >= min && numA + i === n;
    const nBeforeEnd = (min: number) => numN >= min && numN + i === n;
    const aOrNBeforeB = (min: number) =>
      numAorN >= min && at(r.nextBs, numAorN + i) === 0;
    const aOrNBeforeEnd = (min: number) => numAorN >= min && numAorN + i === n;
    let next: Mode;
    if (mode === -1) {
      if (nBefore(t.mode0NbeforeB, r.nextBs)) next = N;
      else if (nBefore(t.mode0forceKB, r.nextBs)) next = B;
      else if (nBefore(t.modeANbeforeE, r.nextAs)) next = N;
      else if (nBeforeEnd(t.mode0forceN)) next = N;
      else if (aOrNBeforeB(t.modeBAbeforeE)) next = A;
      else if (aOrNBeforeEnd(t.mode0forceA)) next = A;
      else next = B;
    } else if (mode === B) {
      if (aBefore(t.modeBAbeforeB, r.nextBs)) next = A;
      else if (aBefore(t.modeBAbeforeN, r.nextNs)) next = A;
      else if (aBeforeEnd(t.modeBAbeforeE)) next = A;
      else if (nBefore(t.modeBNbeforeB, r.nextBs)) next = N;
      else if (nBefore(t.modeBNbeforeA, r.nextAs)) next = N;
      else if (nBeforeEnd(t.modeBNbeforeE)) next = N;
      else if (
        aOrNBeforeEnd(t.modeBAbeforeE) &&
        numAorN <= t.modeBAbeforeN &&
        nextNShorter(r, i, n, t.modeBNbeforeA)
      ) {
        next = A;
      } else next = B;
    } else if (mode === A) {
      if (numB > 0) next = B;
      else if (nBefore(t.modeANbeforeA, r.nextAs)) next = N;
      else if (nBefore(t.modeANbeforeB, r.nextBs)) next = N;
      else if (nBeforeEnd(t.modeANbeforeE)) next = N;
      else if (numA > 0 || numN > 0) next = A;
      else next = B;
    } else if (numB > 0) next = B;
    else if (numA > 0) next = A;
    else if (numN > 0) next = N;
    else next = B;

    const last = out.at(-1);
    if (next === mode && last) {
      // Same mode: one more character on the segment.
      last.length += 1;
      i += 1;
    } else {
      // A new segment takes the whole run of its own characters (a byte
      // segment may start empty and grow one character at a time).
      mode = next;
      const length = next === N ? numN : next === A ? numA : numB;
      out.push({ mode: next, length });
      i += length;
    }
  }
  return out;
}

/** BWIPP's nextNslt: the next run of digits is shorter than `min`, or there's none. */
function nextNShorter(
  r: ReturnType<typeof runs>,
  i: number,
  n: number,
  min: number,
): boolean {
  const gap = r.nextNs[i] as number;
  if (gap >= n) return true;
  return (r.numNs[gap + i] as number) < min;
}

/** Bits the segments take in one version, or null past a count indicator. */
function bitLength(
  parts: { mode: Mode; length: number }[],
  spec: VersionSpec,
): number | null {
  let bits = 0;
  for (const { mode, length } of parts) {
    const countBits = spec.count[mode];
    if (length >= 2 ** countBits) return null;
    bits += spec.indicator + countBits;
    if (mode === N) {
      bits += 10 * Math.floor(length / 3) + [0, 4, 7][length % 3]!;
    } else if (mode === A) {
      bits += 11 * Math.floor(length / 2) + 6 * (length % 2);
    } else {
      bits += 8 * length;
    }
  }
  return bits;
}

/**
 * The symbol bwip-js draws for `text` (as UTF-8): the smallest version it
 * fits at level L, at the highest level that version still has room for.
 * Null when it doesn't fit an M4.
 */
export function microQrSymbol(text: string): MicroQrSymbol | null {
  const msg = new TextEncoder().encode(text);
  if (msg.length === 0) return null;
  for (const spec of VERSIONS) {
    const parts = segments(msg, spec);
    const bits = parts && bitLength(parts, spec);
    if (bits === null || bits === undefined) continue;
    const fits = spec.capacity.filter(([, room]) => bits <= room);
    const level = fits.at(-1)?.[0];
    if (level) {
      return { version: spec.version, modules: spec.modules, level };
    }
  }
  return null;
}

/**
 * A Micro QR's modules, dark = true, rows top to bottom, from bwip-js's SVG
 * of it drawn at scale 1 with no padding and no rotation: one even-odd path
 * of rectangles, 2 units a module.
 */
export function microQrModules(svg: string): boolean[][] {
  const size = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
  const side = size / 2;
  if (!Number.isInteger(side) || side < 11) {
    throw new Error("Not a Micro QR drawn at scale 1 without padding");
  }
  // The vertical edges of every rectangle: a ray from a module's center to
  // the right crosses an odd number of them when the module is dark.
  const edges: { x: number; top: number; bottom: number }[] = [];
  for (const [, path] of svg.matchAll(/<path d="([^"]+)"/g)) {
    for (const shape of (path as string).split("Z")) {
      const points = [...shape.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(
        ([, x, y]) => [Number(x), Number(y)] as const,
      );
      points.forEach(([x, y], i) => {
        const [nextX, nextY] = points[(i + 1) % points.length] ?? [x, y];
        if (x === nextX && y !== nextY) {
          edges.push({
            x,
            top: Math.min(y, nextY),
            bottom: Math.max(y, nextY),
          });
        }
      });
    }
  }
  return Array.from({ length: side }, (_, row) =>
    Array.from({ length: side }, (_, column) => {
      const x = 2 * column + 1;
      const y = 2 * row + 1;
      const crossed = edges.filter(
        (edge) => edge.x > x && edge.top < y && y < edge.bottom,
      ).length;
      return crossed % 2 === 1;
    }),
  );
}

/**
 * Whether ZXing finds this symbol's bottom-right corner where it is.
 *
 * ZXing's Micro QR detector (zxing-cpp's SampleMQR, in zxing-wasm 3.1.6)
 * lays its grid from the finder pattern, then moves three corners onto what
 * it sees: the ends of the two timing patterns, always found in a clean
 * image, and the bottom-right corner (LocalGrid::findCorner). It takes that
 * corner where the bottom row and the right column each have a dark module
 * among their last 6. When either is all light there, it looks at the
 * modules around and can settle on a corner inside the symbol: the grid
 * skews and the symbol doesn't read, though it's valid (it reads with the
 * detector skipped). 47 of 22,000 random values bwip-js drew had this.
 */
export function microQrCornerShows(modules: boolean[][]): boolean {
  const last = modules.length - 1;
  const bottomRow = modules[last] ?? [];
  const tail = (cells: boolean[]) => cells.slice(-6).some(Boolean);
  return tail(bottomRow) && tail(modules.map((row) => row[last] ?? false));
}

/**
 * ISO/IEC 18004's score for a Micro QR mask, as bwip-js computes it to pick
 * one: the dark modules on the right edge and on the bottom edge (the
 * timing pattern's ends left out), the smaller count weighted 16 times.
 * Higher is better.
 */
export function microQrMaskScore(modules: boolean[][]): number {
  const last = modules.length - 1;
  let right = 0;
  let bottom = 0;
  for (let i = 1; i <= last; i++) {
    if (modules[i]?.[last]) right++;
    if (modules[last]?.[i]) bottom++;
  }
  return Math.min(right, bottom) * 16 + Math.max(right, bottom);
}

/** Micro QR's four mask patterns, as bwip-js numbers them. */
export const MICRO_QR_MASKS = [1, 2, 3, 4] as const;
