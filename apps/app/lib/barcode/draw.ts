// Draws a barcode as SVG with bwip-js, given the encoders of one bwip-js
// build: the browser build in lib/barcode/render.ts (the generator and the
// dashboard) and the Node build in lib/barcode/server.ts (the image API,
// MCP and server downloads). Both are bwip-js 4.11.4 (package.json pins
// @bwip-js/browser and bwip-js to the same version), and every option is
// built here, so the two return the same SVG byte for byte
// (tests/barcode/parity.test.ts).
import {
  type BarcodeFormatId,
  barcodeIssueText,
  getBarcodeFormat,
  maxicodeMessage,
} from "./formats";
import {
  MICRO_QR_LIMITS,
  MICRO_QR_MASKS,
  microQrCornerShows,
  microQrMaskScore,
  microQrModules,
} from "./micro-qr";
import type { BarcodeRotation, BarcodeStyle } from "./style";

export type { BarcodeStyle } from "./style";

/** The bwip-js options this module sets (a subset of RenderOptions). */
export interface DrawOptions {
  bcid: string;
  text: string;
  scale: number;
  barcolor: string;
  textcolor: string;
  bordercolor: string;
  backgroundcolor: string;
  paddingwidth: number;
  paddingheight: number;
  rotate: "N" | "R" | "L" | "I";
  height?: number;
  includetext?: boolean;
  textxalign?: "center";
  /** Add the symbology's check characters (Code 93's C and K) */
  includecheck?: boolean;
  /** Modules between an EAN-13 and its add-on (ISBN, ISSN, ISMN) */
  addongap?: number;
  /** Text printed under the bars when the encoder prints none of its own */
  alttext?: string;
  /** Points between the bars and the text under them (negative: lower) */
  textyoffset?: number;
  /** Micro QR: no Kanji mode, since the text is UTF-8, not Shift JIS */
  suppresskanjimode?: boolean;
  /** Micro QR's mask pattern, 1 to 4; bwip-js picks one when it's left out */
  mask?: number;
  /** rMQR's size, rows × columns, e.g. "R7x43" (bwip-js picks none itself) */
  version?: string;
  /** MaxiCode's mode: 2 and 3 carrier messages, 4 text */
  mode?: number;
  /** Encode each character as one byte (MaxiCode's Latin-1), not UTF-8 */
  binarytext?: boolean;
}

/** One bwip-js build: its encoder per format and its SVG drawing. */
export interface BwipBuild<Drawing> {
  encoders: Record<
    BarcodeFormatId,
    (opts: DrawOptions, drawing: Drawing) => string
  >;
  drawingSVG: () => Drawing;
}

/** bwip-js encoder names (bcid), which the build's functions are named after. */
export const BCID: Record<BarcodeFormatId, string> = {
  ean13: "ean13",
  ean8: "ean8",
  upca: "upca",
  upce: "upce",
  isbn: "isbn",
  issn: "issn",
  ismn: "ismn",
  code128: "code128",
  code39: "code39",
  code93: "code93",
  codabar: "rationalizedCodabar",
  itf14: "itf14",
  "gs1-128": "gs1-128",
  "gs1-databar": "databaromni",
  "gs1-databar-expanded": "databarexpanded",
  "intelligent-mail": "onecode",
  datamatrix: "datamatrix",
  pdf417: "pdf417",
  aztec: "azteccode",
  microqr: "microqrcode",
  rmqr: "rectangularmicroqrcode",
  maxicode: "maxicode",
  dotcode: "dotcode",
};

/**
 * bwip-js drawing units per module: linear bars and PDF417 columns are one
 * unit wide, Data Matrix, Aztec, Micro QR and rMQR cells two, DotCode's dot
 * pitch two,
 * MaxiCode's hexagons 3.44 apart (101.5 units across 29.5 columns).
 * Intelligent Mail's bars are 1.44 units (0.02 in) wide on a 3.312-unit
 * pitch; its module is the bar's width. Padding is given in units.
 */
export const MODULE_UNITS: Record<BarcodeFormatId, number> = {
  ean13: 1,
  ean8: 1,
  upca: 1,
  upce: 1,
  isbn: 1,
  issn: 1,
  ismn: 1,
  code128: 1,
  code39: 1,
  code93: 1,
  codabar: 1,
  itf14: 1,
  "gs1-128": 1,
  "gs1-databar": 1,
  "gs1-databar-expanded": 1,
  "intelligent-mail": 1.44,
  datamatrix: 2,
  pdf417: 1,
  aztec: 2,
  microqr: 2,
  rmqr: 2,
  maxicode: 3.44,
  dotcode: 2,
};

/**
 * rMQR's 32 sizes (ISO/IEC 23941), rows × columns, the fewest rows first,
 * then the fewest columns: rMQR is for narrow spaces, so the generator keeps
 * it as low as the text allows and lets it grow longer first. bwip-js draws
 * only the size it's given, so drawBarcode takes the first one the text
 * fits, at error correction M (bwip-js's default).
 */
export const RMQR_SIZES: readonly string[] = [7, 9, 11, 13, 15, 17].flatMap(
  (rows) =>
    [27, 43, 59, 77, 99, 139]
      // Only 11 and 13 rows come 27 columns wide.
      .filter((columns) => columns !== 27 || rows === 11 || rows === 13)
      .map((columns) => `R${rows}x${columns}`),
);

const RMQR_FULL =
  "Too much data for one rMQR: it holds up to 361 digits, 219 capital letters or 150 characters of other text, and less with accents or other scripts. Shorten the text.";

/**
 * The largest DotCode drawn, in dot positions (columns × rows): 126 × 85 at
 * bwip-js's default shape. An outside DotCode reader decoded every symbol
 * up to this size and none from the next size bwip-js draws (128 × 85),
 * for letters, digits, URLs, accents, other scripts and control characters
 * alike, in any shape: about 390 letters or 780 digits.
 */
export const DOTCODE_MAX_DOTS = 10_710;

const MAXICODE_FULL =
  "Too much data for one MaxiCode: it holds up to 93 capital letters or 138 digits, fewer with lowercase or symbols, and about 84 characters after a carrier message's postcode, country and service class. Shorten the text.";

const DOTCODE_FULL =
  "Too much data for one DotCode here: it holds up to about 390 letters or 780 digits, and less with accents or other scripts. Shorten the text.";

/** One drawing unit is one PostScript point: 25.4 / 72 mm. */
export const MM_PER_UNIT = 25.4 / 72;

const ROTATE: Record<BarcodeRotation, DrawOptions["rotate"]> = {
  0: "N",
  90: "R",
  180: "I",
  270: "L",
};

export interface RenderedBarcode {
  /** SVG at `scale` (one unit = `scale` px), with width and height set */
  svg: string;
  /** Pixel size at `scale`: the PNG's size */
  width: number;
  height: number;
  /**
   * Size in points for vector downloads: one point a unit, times the
   * format's vectorScale (MaxiCode's fixed size)
   */
  widthUnits: number;
  heightUnits: number;
}

const hex = (color: string) => color.replace(/^#/, "").toLowerCase();

/** The bwip-js options for `value` in format `id`, drawn with `style`. */
export function drawOptions(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): DrawOptions {
  const format = getBarcodeFormat(id);
  const linear = format.kind === "linear";
  const modules = Math.max(0, style.quietZone) * MODULE_UNITS[id];
  // bwip-js drops a padding's fraction; MaxiCode's module is 3.44 units, so
  // round up to keep at least the quiet zone asked for.
  const padding = id === "maxicode" ? Math.ceil(modules) : modules;
  const color = hex(style.foreground);
  const options: DrawOptions = {
    bcid: BCID[id],
    text: value,
    scale: style.scale,
    barcolor: color,
    textcolor: color,
    bordercolor: color,
    backgroundcolor: hex(style.background),
    paddingwidth: padding,
    // Linear codes need no quiet zone above and below; a little keeps the
    // bars off the image edge.
    paddingheight: linear ? Math.min(padding, 2) : padding,
    rotate: ROTATE[style.rotation ?? 0] ?? "N",
  };
  if (linear) {
    options.height = format.fixedBarHeightMm ?? style.barHeightMm;
    options.includetext = style.showText;
    if (
      id === "code128" ||
      id === "code39" ||
      id === "code93" ||
      id === "codabar" ||
      id === "gs1-128" ||
      id === "gs1-databar" ||
      id === "gs1-databar-expanded"
    ) {
      options.textxalign = "center";
    }
    // bwip-js prints no text under DataBar Expanded, so give it the AIs and
    // values the way GS1-128 prints them.
    if (id === "gs1-databar-expanded" && style.showText) {
      options.alttext = value;
    }
    if (id === "intelligent-mail") {
      // USPS-B-3200 wants 0.028 in (2.02 points) clear above and below the
      // bars, and any human-readable text at least as far from them;
      // bwip-js prints the digits 1.8 points below.
      options.paddingheight = Math.min(padding, 3);
      options.textyoffset = -2;
    }
    // Code 93's two check characters are part of the symbology, and readers
    // reject a symbol without them; bwip-js leaves them out unless asked.
    if (id === "code93") options.includecheck = true;
    // GS1 puts an EAN-13's add-on 7 to 12 modules right of the bars. BWIPP
    // uses 12, where ZXing (the reader /scan falls back to, and many scanner
    // apps) no longer finds it; 9 is inside both. Without an add-on the
    // option draws nothing.
    if (id === "isbn" || id === "issn" || id === "ismn") options.addongap = 9;
  }
  // BWIPP may put byte pairs that look like Shift JIS in Kanji mode, which
  // tells a reader they're Shift JIS kanji; the text is UTF-8, so keep it in
  // byte mode. The size check (micro-qr.ts) counts without Kanji mode too.
  if (id === "microqr") options.suppresskanjimode = true;
  if (id === "maxicode") {
    // bwip-js picks mode 5 for a message it isn't told the mode of, so say
    // it; and MaxiCode reads bytes as Latin-1, so pass one byte a character.
    const message = maxicodeMessage(value);
    options.text = message.text;
    options.mode = message.mode;
    options.binarytext = true;
  }
  return options;
}

/**
 * Draws `value` (already checked by validateBarcodeInput) as SVG with one
 * bwip-js build. Throws a readable Error when the encoder rejects it, e.g.
 * too much data for a 2D code.
 */
export function drawBarcode<Drawing>(
  build: BwipBuild<Drawing>,
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): RenderedBarcode {
  const format = getBarcodeFormat(id);
  let svg: string;
  try {
    svg = encode(build, id, drawOptions(id, value, style));
  } catch (error) {
    // bwip-js 4.11.4 has no message for a DataBar Expanded past its last
    // segment: it fails with a TypeError of its own. That only happens when
    // the data doesn't fit (tests/barcode/render.test.ts).
    if (id === "gs1-databar-expanded" && error instanceof TypeError) {
      throw new Error(
        "Too much data for one GS1 DataBar Expanded: it holds up to 74 digits, and fewer when there are letters. Remove an AI or shorten a value.",
      );
    }
    // Past 2,000 bytes bwip-js refuses DotCode itself; say what fits here.
    if (id === "dotcode" && /dotcodeinputTooLong/.test(String(error))) {
      throw new Error(DOTCODE_FULL);
    }
    // validateBarcodeInput refuses what doesn't fit first (micro-qr.ts).
    if (id === "microqr" && /qrcodeNoValidSymbol/.test(String(error))) {
      throw new Error(
        barcodeIssueText({
          code: "microqrTooLong",
          values: { ...MICRO_QR_LIMITS },
        }),
      );
    }
    // drawRmqr's own message already says what fits.
    if (error instanceof Error && error.message === RMQR_FULL) throw error;
    // bwip-js 4.11.4: maxicodeMode23TooLong (a carrier message's rest),
    // maxicodeMode56TooLong (text, mode 4) or maxicodeInputTooLong.
    if (id === "maxicode" && /maxicode\w*TooLong/.test(String(error))) {
      throw new Error(MAXICODE_FULL);
    }
    throw new Error(encoderMessage(format.label, error));
  }

  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!viewBox) throw new Error(`Couldn't draw this ${format.label}.`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  if (
    id === "dotcode" &&
    dotcodeDots(width, height, style) > DOTCODE_MAX_DOTS
  ) {
    throw new Error(DOTCODE_FULL);
  }
  return {
    svg: svg.replace(
      "<svg ",
      `<svg width="${width}" height="${height}" shape-rendering="crispEdges" `,
    ),
    width,
    height,
    widthUnits: (width / style.scale) * (format.vectorScale ?? 1),
    heightUnits: (height / style.scale) * (format.vectorScale ?? 1),
  };
}

/** The SVG of one encoder, with rMQR's size and Micro QR's mask picked here. */
function encode<Drawing>(
  build: BwipBuild<Drawing>,
  id: BarcodeFormatId,
  options: DrawOptions,
): string {
  if (id === "rmqr") return drawRmqr(build, options);
  if (id === "microqr") return drawMicroQr(build, options);
  return build.encoders[id](options, build.drawingSVG());
}

/**
 * A Micro QR at the mask bwip-js picks, unless that leaves the bottom-right
 * corner where ZXing misses it (microQrCornerShows): then at the mask with
 * the best ISO/IEC 18004 score whose corner shows, or bwip-js's own if none
 * does. Every mask is a valid symbol; this one also reads with ZXing.
 */
function drawMicroQr<Drawing>(
  build: BwipBuild<Drawing>,
  options: DrawOptions,
): string {
  // The symbol alone (scale 1, no padding, upright), to read its modules.
  const modules = (mask?: number) =>
    microQrModules(
      build.encoders.microqr(
        {
          ...options,
          ...(mask ? { mask } : {}),
          scale: 1,
          paddingwidth: 0,
          paddingheight: 0,
          rotate: "N",
        },
        build.drawingSVG(),
      ),
    );
  if (microQrCornerShows(modules())) {
    return build.encoders.microqr(options, build.drawingSVG());
  }
  let best: { mask: number; score: number } | null = null;
  for (const mask of MICRO_QR_MASKS) {
    const masked = modules(mask);
    if (!microQrCornerShows(masked)) continue;
    const score = microQrMaskScore(masked);
    if (!best || score > best.score) best = { mask, score };
  }
  return build.encoders.microqr(
    best ? { ...options, mask: best.mask } : options,
    build.drawingSVG(),
  );
}

/** The smallest rMQR `options.text` fits (RMQR_SIZES), as SVG. */
function drawRmqr<Drawing>(
  build: BwipBuild<Drawing>,
  options: DrawOptions,
): string {
  for (const version of RMQR_SIZES) {
    try {
      return build.encoders.rmqr({ ...options, version }, build.drawingSVG());
    } catch (error) {
      // Too big for this size: try the next. Anything else is a real error.
      if (!/qrcodeNoValidSymbol/.test(String(error))) throw error;
    }
  }
  throw new Error(RMQR_FULL);
}

/**
 * A DotCode drawing's dot positions, columns × rows, from its size in
 * pixels: dots are 2 units apart and 2 across, inside the quiet zone on
 * every side, and bwip-js adds one pixel to each side's length.
 */
export function dotcodeDots(
  width: number,
  height: number,
  style: BarcodeStyle,
): number {
  const margins = 2 * Math.max(0, style.quietZone) * MODULE_UNITS.dotcode;
  const dots = (pixels: number) =>
    Math.round(((pixels - 1) / style.scale - margins) / 2);
  return dots(width) * dots(height);
}

/** bwip-js errors read "bwipp.ean13badLength#6878: EAN-13 must be …". */
export function encoderMessage(label: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/^bwip(?:p|-js)\.?[\w.]*#?\d*:\s*/, "").trim();
  if (/too long|too much|exceeds|InputTooLong/i.test(raw)) {
    return `Too much data for one ${label}. Shorten the text.`;
  }
  const ai = /^AI (\d+): (.*)$/.exec(message);
  if (ai) {
    const detail = ai[2] as string;
    return `AI (${ai[1]}): ${detail.charAt(0).toLowerCase()}${detail.slice(1)}.`;
  }
  return message ? `${label}: ${message}` : `Couldn't draw this ${label}.`;
}

/**
 * The SVG for download: sized in millimetres so one drawing unit is one
 * point (a linear module is 0.353 mm, the bars as tall as set) and print
 * layouts place it at that size.
 */
export function printableSVG(rendered: RenderedBarcode): string {
  const mm = (units: number) => (units * MM_PER_UNIT).toFixed(3);
  return rendered.svg.replace(
    /<svg width="[\d.]+" height="[\d.]+"/,
    `<svg width="${mm(rendered.widthUnits)}mm" height="${mm(rendered.heightUnits)}mm"`,
  );
}
