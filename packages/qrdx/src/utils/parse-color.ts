/** biome-ignore-all lint/style/noMagicNumbers: color math */

import { roundTo } from "./fmt";

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  /** 0 (transparent) to 1 (opaque) */
  a: number;
}

/** The CSS named colors (CSS Color 4: 148 names), as rrggbb. */
const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aqua: "00ffff",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  black: "000000",
  blanchedalmond: "ffebcd",
  blue: "0000ff",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  cyan: "00ffff",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgreen: "006400",
  darkgrey: "a9a9a9",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkslategrey: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  fuchsia: "ff00ff",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  gray: "808080",
  green: "008000",
  greenyellow: "adff2f",
  grey: "808080",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgreen: "90ee90",
  lightgrey: "d3d3d3",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "778899",
  lightslategrey: "778899",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  lime: "00ff00",
  limegreen: "32cd32",
  linen: "faf0e6",
  magenta: "ff00ff",
  maroon: "800000",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  navy: "000080",
  oldlace: "fdf5e6",
  olive: "808000",
  olivedrab: "6b8e23",
  orange: "ffa500",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "ff0000",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  silver: "c0c0c0",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  slategrey: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  teal: "008080",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  white: "ffffff",
  whitesmoke: "f5f5f5",
  yellow: "ffff00",
  yellowgreen: "9acd32",
};

const NAMED_COLORS: Record<string, [number, number, number]> =
  Object.fromEntries(
    Object.entries(CSS_NAMED_COLORS).map(([name, hex]) => [
      name,
      [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ],
    ])
  );

function parseChannel(value: string, max: number): number {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (Number.isNaN(number)) {
    return Number.NaN;
  }
  return trimmed.endsWith("%") ? (number / 100) * max : number;
}

/**
 * Parses hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(), `transparent`
 * and the CSS color names. Returns null for anything else.
 */
export function parseColor(input: string | null | undefined): RGBAColor | null {
  if (!input) {
    return null;
  }
  const value = input.trim().toLowerCase();

  if (value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const named = NAMED_COLORS[value];
  if (named) {
    return { r: named[0], g: named[1], b: named[2], a: 1 };
  }

  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
      return null;
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(value);
  if (fn) {
    const [channels, alpha] = fn[1].split("/");
    const parts = channels.split(/[\s,]+/).filter(Boolean);
    // Three channels, plus an alpha either after "/" or as a fourth value.
    if (parts.length !== (alpha === undefined && parts.length === 4 ? 4 : 3)) {
      return null;
    }
    const alphaPart = alpha ?? parts[3];
    const [r, g, b] = parts.slice(0, 3).map((part) => parseChannel(part, 255));
    const a = alphaPart === undefined ? 1 : parseChannel(alphaPart, 1);
    if ([r, g, b, a].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    const clamp = (channel: number, max: number) =>
      Math.min(Math.max(channel, 0), max);
    return {
      r: clamp(r, 255),
      g: clamp(g, 255),
      b: clamp(b, 255),
      a: clamp(a, 1),
    };
  }

  return null;
}

/**
 * Naive RGB → CMYK conversion (no ICC profile): K = 1 − max(R, G, B) and
 * C/M/Y from what is left. Pure black maps to K only. Returns 0–1 values.
 * Ask your printer for a proper color-managed conversion when exact brand
 * colors matter.
 */
export function rgbToCmyk(
  r: number,
  g: number,
  b: number
): [c: number, m: number, y: number, k: number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const k = 1 - Math.max(red, green, blue);
  if (k >= 1) {
    return [0, 0, 0, 1];
  }
  return [
    roundTo((1 - red - k) / (1 - k)),
    roundTo((1 - green - k) / (1 - k)),
    roundTo((1 - blue - k) / (1 - k)),
    roundTo(k),
  ];
}
