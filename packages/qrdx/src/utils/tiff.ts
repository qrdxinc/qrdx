/** biome-ignore-all lint/style/noMagicNumbers: TIFF tags, field types and values */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: the horizontal predictor */
// A baseline TIFF writer in plain TypeScript with no DOM. No browser encodes
// TIFF from a canvas (toBlob("image/tiff") hands back a PNG), so every
// browser, the CLI and the image API use this one and write the same file.
//
// One strip of 8-bit samples, Deflate-compressed (Adobe Deflate, with the
// horizontal predictor) through Compression Streams, or uncompressed where
// those are missing. The resolution is recorded as `dpi`, 300 by default.
//
// - "rgb": RGBA with unassociated alpha, so a transparent background stays
//   transparent.
// - "cmyk": separated CMYK by the engine's own conversion (rgbToCmyk, as the
//   print PDF and EPS use): pure black is K only, white is no ink, and no
//   ICC profile is embedded. A transparent or see-through pixel is laid over
//   white first, as print has no transparency.

import { rgbToCmyk } from "./parse-color";
import { deflate } from "./png";

/** Largest width or height written. */
export const TIFF_MAX_DIMENSION = 16_384;
/** The resolution recorded when none is given: print's usual 300 dpi. */
export const TIFF_DPI = 300;

export type TIFFColorMode = "rgb" | "cmyk";

export interface TIFFOptions {
  /** "rgb" (default) keeps transparency; "cmyk" is for print */
  colorMode?: TIFFColorMode;
  /** Pixels per inch recorded in the file (default 300) */
  dpi?: number;
}

const OPAQUE = 255;
const SAMPLES = 4;

const TAG = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  xResolution: 282,
  yResolution: 283,
  planarConfiguration: 284,
  resolutionUnit: 296,
  predictor: 317,
  inkSet: 332,
  extraSamples: 338,
} as const;

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

const COMPRESSION_NONE = 1;
const COMPRESSION_DEFLATE = 8;
const PHOTOMETRIC_RGB = 2;
const PHOTOMETRIC_SEPARATED = 5;
const PREDICTOR_HORIZONTAL = 2;
const INK_SET_CMYK = 1;
const EXTRA_SAMPLES_UNASSOCIATED_ALPHA = 2;
const RESOLUTION_UNIT_INCH = 2;

/** A color channel laid over white at `alpha` (0 to 255). */
const overWhite = (channel: number, alpha: number): number =>
  Math.floor((channel * alpha + OPAQUE * (OPAQUE - alpha) + 127) / OPAQUE);

function checkSize(rgba: ArrayLike<number>, width: number, height: number) {
  for (const [name, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > TIFF_MAX_DIMENSION) {
      throw new RangeError(
        `TIFF ${name} must be a whole number from 1 to ${TIFF_MAX_DIMENSION}, not ${value}`
      );
    }
  }
  if (rgba.length !== width * height * SAMPLES) {
    throw new RangeError(
      `Expected ${width * height * SAMPLES} RGBA bytes for ${width} × ${height}, got ${rgba.length}`
    );
  }
}

/** The samples as stored: RGBA as given, or CMYK over white. */
function samples(rgba: ArrayLike<number>, cmyk: boolean): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += SAMPLES) {
    const r = rgba[i] as number;
    const g = rgba[i + 1] as number;
    const b = rgba[i + 2] as number;
    const a = rgba[i + 3] as number;
    if (!cmyk) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
      continue;
    }
    const ink = rgbToCmyk(overWhite(r, a), overWhite(g, a), overWhite(b, a));
    for (let c = 0; c < SAMPLES; c++) {
      out[i + c] = Math.round((ink[c] as number) * OPAQUE);
    }
  }
  return out;
}

/** Horizontal differencing (TIFF predictor 2), row by row, in place. */
function predict(data: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * SAMPLES;
  for (let row = 0; row < height; row++) {
    const start = row * stride;
    for (let i = start + stride - 1; i >= start + SAMPLES; i--) {
      data[i] = ((data[i] as number) - (data[i - SAMPLES] as number)) & 0xff;
    }
  }
  return data;
}

/**
 * RGBA pixels (as a canvas's getImageData returns them: `width * height * 4`
 * bytes, top row first) as a TIFF file. Throws a RangeError for a size that
 * is not a whole number from 1 to TIFF_MAX_DIMENSION, pixels that don't
 * match it, or a `dpi` that isn't a positive number.
 */
export async function encodeTIFF(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: TIFFOptions = {}
): Promise<Uint8Array> {
  checkSize(rgba, width, height);
  const dpi = options.dpi ?? TIFF_DPI;
  if (!(Number.isFinite(dpi) && dpi > 0)) {
    throw new RangeError(`TIFF dpi must be a positive number, not ${dpi}`);
  }
  const cmyk = options.colorMode === "cmyk";
  const raw = samples(rgba, cmyk);
  const compressed = await deflate(predict(raw.slice(), width, height));
  const data = compressed ?? raw;

  const tags: [tag: number, type: number, count: number, value: number][] = [
    [TAG.imageWidth, LONG, 1, width],
    [TAG.imageLength, LONG, 1, height],
    [TAG.bitsPerSample, SHORT, SAMPLES, 0],
    [
      TAG.compression,
      SHORT,
      1,
      compressed ? COMPRESSION_DEFLATE : COMPRESSION_NONE,
    ],
    [TAG.photometric, SHORT, 1, cmyk ? PHOTOMETRIC_SEPARATED : PHOTOMETRIC_RGB],
    [TAG.stripOffsets, LONG, 1, 0],
    [TAG.samplesPerPixel, SHORT, 1, SAMPLES],
    [TAG.rowsPerStrip, LONG, 1, height],
    [TAG.stripByteCounts, LONG, 1, data.length],
    [TAG.xResolution, RATIONAL, 1, 0],
    [TAG.yResolution, RATIONAL, 1, 0],
    [TAG.planarConfiguration, SHORT, 1, 1],
    [TAG.resolutionUnit, SHORT, 1, RESOLUTION_UNIT_INCH],
  ];
  if (compressed) {
    tags.push([TAG.predictor, SHORT, 1, PREDICTOR_HORIZONTAL]);
  }
  tags.push(
    cmyk
      ? [TAG.inkSet, SHORT, 1, INK_SET_CMYK]
      : [TAG.extraSamples, SHORT, 1, EXTRA_SAMPLES_UNASSOCIATED_ALPHA]
  );

  // Header, then the directory, then the values too big for it, then the
  // strip. Every offset stays even.
  const ifdOffset = 8;
  const ifdSize = 2 + tags.length * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const xResolutionOffset = bitsOffset + SAMPLES * 2;
  const yResolutionOffset = xResolutionOffset + 8;
  const dataOffset = yResolutionOffset + 8;

  const file = new Uint8Array(dataOffset + data.length);
  const view = new DataView(file.buffer);
  file.set([0x49, 0x49], 0); // "II": little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, tags.length, true);
  tags.forEach(([tag, type, count, value], index) => {
    const entry = ifdOffset + 2 + index * 12;
    let field = value;
    if (tag === TAG.bitsPerSample) field = bitsOffset;
    if (tag === TAG.stripOffsets) field = dataOffset;
    if (tag === TAG.xResolution) field = xResolutionOffset;
    if (tag === TAG.yResolution) field = yResolutionOffset;
    view.setUint16(entry, tag, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, count, true);
    if (type === SHORT && count === 1) {
      view.setUint16(entry + 8, field, true);
    } else {
      view.setUint32(entry + 8, field, true);
    }
  });
  view.setUint32(ifdOffset + 2 + tags.length * 12, 0, true); // no next IFD
  for (let c = 0; c < SAMPLES; c++) {
    view.setUint16(bitsOffset + c * 2, 8, true);
  }
  // dpi as a fraction over 100, so 299.5 survives.
  for (const offset of [xResolutionOffset, yResolutionOffset]) {
    view.setUint32(offset, Math.round(dpi * 100), true);
    view.setUint32(offset + 4, 100, true);
  }
  file.set(data, dataOffset);
  return file;
}

/** True for a little- or big-endian TIFF file. */
export function isTIFFFile(bytes: ArrayLike<number>): boolean {
  if (bytes.length < 8) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x49) {
    return bytes[2] === 42 && bytes[3] === 0;
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x4d) {
    return bytes[2] === 0 && bytes[3] === 42;
  }
  return false;
}
