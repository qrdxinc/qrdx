/** biome-ignore-all lint/style/noMagicNumbers: GIF format constants and color maths */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: LZW codes, packed fields and color keys */
// A GIF writer in plain TypeScript with no DOM. Canvases can't encode GIF
// (toBlob("image/gif") hands back a PNG), so every browser and the CLI use
// this one; the server uses sharp.
//
// A GIF holds at most 256 colors and one of them may be transparent, so the
// pixels are first reduced to a palette (`quantizeRGBA`): the image's own
// colors when it has few enough (lossless, which a QR code in flat colors
// almost always does), otherwise a median-cut palette with no dithering,
// because dither noise is what stops a code scanning. The indexed pixels are
// then written as one GIF89a image with LZW compression (`encodeGIF`).

/** Most colors a GIF palette holds. */
export const GIF_MAX_COLORS = 256;

/** Largest width or height written (the format allows 65 535). */
export const GIF_MAX_DIMENSION = 16_384;

/** A pixel with less alpha than this is transparent; with this or more, opaque. */
export const GIF_ALPHA_THRESHOLD = 128;

const OPAQUE = 255;
/**
 * Bits kept of each channel to bucket colors for median cut: 6 means colors
 * within 3 of each other (out of 255) share a bucket, which no eye or scanner
 * tells apart, and keeps the histogram to 262 144 buckets.
 */
const BUCKET_BITS = 6;
const BUCKET_SHIFT = 8 - BUCKET_BITS;
const BUCKET_COUNT = 1 << (BUCKET_BITS * 3);
/** The most codes LZW may use (12-bit codes). */
const MAX_CODES = 4096;

/** An image as a palette and one palette index per pixel. */
export interface IndexedImage {
  width: number;
  height: number;
  /** Red, green, blue for each color, in that order: 3 bytes a color */
  palette: Uint8Array;
  /** One palette index per pixel, top row first */
  indices: Uint8Array;
  /** The palette index that is see-through, or null when nothing is */
  transparentIndex: number | null;
}

export interface QuantizedImage extends IndexedImage {
  /** How many palette entries are used (the transparent one included) */
  colors: number;
  /**
   * True when every pixel keeps its color and its opacity exactly: the
   * image had no more than 256 colors and no half-transparent pixel.
   */
  lossless: boolean;
}

const validateSize = (width: number, height: number): void => {
  if (
    !(Number.isInteger(width) && Number.isInteger(height)) ||
    width < 1 ||
    height < 1 ||
    width > GIF_MAX_DIMENSION ||
    height > GIF_MAX_DIMENSION
  ) {
    throw new RangeError(
      `GIF width and height must be whole numbers from 1 to ${GIF_MAX_DIMENSION}, got ${width} x ${height}`
    );
  }
};

/** A box of color buckets, for median cut. */
interface Box {
  /** The bucket keys inside, sorted along no particular axis until split */
  keys: number[];
  pixels: number;
}

const channelOf = (key: number, channel: 0 | 1 | 2): number =>
  (key >> (BUCKET_BITS * (2 - channel))) & ((1 << BUCKET_BITS) - 1);

/**
 * RGBA pixels (as a canvas's getImageData or sharp's raw output returns them:
 * `width * height * 4` bytes, top row first, not premultiplied) reduced to a
 * GIF palette. A pixel with alpha under 128 becomes the one transparent
 * color, and any other becomes opaque. The image's own colors are kept
 * when they fit in 256 (255 plus the transparent one); otherwise a
 * median-cut palette stands in for them. Throws a RangeError for a size
 * outside 1 to GIF_MAX_DIMENSION, or pixels that don't match it.
 */
export function quantizeRGBA(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): QuantizedImage {
  validateSize(width, height);
  const count = width * height;
  if (rgba.length !== count * 4) {
    throw new RangeError(
      `Expected ${count * 4} RGBA bytes for ${width} x ${height}, got ${rgba.length}`
    );
  }

  // Pass 1: which colors are there, and is anything see-through
  const exactColors = new Map<number, number>();
  let transparent = false;
  let partial = false;
  let tooMany = false;
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    const alpha = rgba[at + 3] as number;
    if (alpha < GIF_ALPHA_THRESHOLD) {
      transparent = true;
      partial ||= alpha > 0;
      continue;
    }
    partial ||= alpha < OPAQUE;
    if (!tooMany) {
      const key =
        ((rgba[at] as number) << 16) |
        ((rgba[at + 1] as number) << 8) |
        (rgba[at + 2] as number);
      if (!exactColors.has(key)) {
        exactColors.set(key, exactColors.size);
        // 256 opaque colors fit only when nothing is transparent; the
        // check is repeated below, once the transparency is known
        tooMany = exactColors.size > GIF_MAX_COLORS;
      }
    }
  }
  const room = transparent ? GIF_MAX_COLORS - 1 : GIF_MAX_COLORS;
  const exact = !tooMany && exactColors.size <= room;

  const indices = new Uint8Array(count);
  let opaqueColors: number;
  let paletteRGB: number[];
  let lookup: (red: number, green: number, blue: number) => number;

  if (exact) {
    // The image's own colors, in the order they first appear
    paletteRGB = [];
    for (const key of exactColors.keys()) {
      paletteRGB.push((key >> 16) & 255, (key >> 8) & 255, key & 255);
    }
    opaqueColors = exactColors.size;
    lookup = (red, green, blue) =>
      exactColors.get((red << 16) | (green << 8) | blue) as number;
  } else {
    const built = medianCut(rgba, count, room);
    paletteRGB = built.palette;
    opaqueColors = built.palette.length / 3;
    lookup = (red, green, blue) =>
      built.bucketIndex[bucketKey(red, green, blue)] as number;
  }

  const transparentIndex = transparent ? opaqueColors : null;
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    if ((rgba[at + 3] as number) < GIF_ALPHA_THRESHOLD) {
      indices[pixel] = transparentIndex as number;
    } else {
      indices[pixel] = lookup(
        rgba[at] as number,
        rgba[at + 1] as number,
        rgba[at + 2] as number
      );
    }
  }

  const colors = opaqueColors + (transparent ? 1 : 0);
  const palette = new Uint8Array(colors * 3);
  palette.set(paletteRGB);
  if (transparent) {
    // The color behind the see-through entry, for a reader that ignores it
    palette.fill(255, opaqueColors * 3);
  }
  return {
    width,
    height,
    palette,
    indices,
    transparentIndex,
    colors,
    lossless: exact && !partial,
  };
}

const bucketKey = (red: number, green: number, blue: number): number =>
  ((red >> BUCKET_SHIFT) << (BUCKET_BITS * 2)) |
  ((green >> BUCKET_SHIFT) << BUCKET_BITS) |
  (blue >> BUCKET_SHIFT);

/**
 * At most `limit` colors that stand for the opaque pixels, by median cut:
 * the pixels are counted into 6-bit-a-channel buckets, the box with the most
 * pixels is split at its weighted median along its widest channel until there
 * are `limit` boxes, and each box becomes its pixels' mean color. Every
 * bucket is mapped to the nearest of those colors.
 */
function medianCut(
  rgba: ArrayLike<number>,
  count: number,
  limit: number
): { palette: number[]; bucketIndex: Uint8Array } {
  const population = new Uint32Array(BUCKET_COUNT);
  const sumRed = new Float64Array(BUCKET_COUNT);
  const sumGreen = new Float64Array(BUCKET_COUNT);
  const sumBlue = new Float64Array(BUCKET_COUNT);
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    if ((rgba[at + 3] as number) < GIF_ALPHA_THRESHOLD) {
      continue;
    }
    const red = rgba[at] as number;
    const green = rgba[at + 1] as number;
    const blue = rgba[at + 2] as number;
    const key = bucketKey(red, green, blue);
    population[key] = (population[key] as number) + 1;
    sumRed[key] = (sumRed[key] as number) + red;
    sumGreen[key] = (sumGreen[key] as number) + green;
    sumBlue[key] = (sumBlue[key] as number) + blue;
  }

  const keys: number[] = [];
  for (let key = 0; key < BUCKET_COUNT; key++) {
    if ((population[key] as number) > 0) {
      keys.push(key);
    }
  }
  const boxes: Box[] = [
    {
      keys,
      pixels: keys.reduce((sum, key) => sum + (population[key] as number), 0),
    },
  ];

  while (boxes.length < limit) {
    // The splittable box holding the most pixels
    let pick = -1;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index] as Box;
      if (
        box.keys.length > 1 &&
        (pick === -1 || box.pixels > (boxes[pick] as Box).pixels)
      ) {
        pick = index;
      }
    }
    if (pick === -1) {
      break;
    }
    const box = boxes[pick] as Box;

    // Widest channel in this box
    let widest: 0 | 1 | 2 = 0;
    let widestRange = -1;
    for (const channel of [0, 1, 2] as const) {
      let low = 255;
      let high = 0;
      for (const key of box.keys) {
        const value = channelOf(key, channel);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      if (high - low > widestRange) {
        widestRange = high - low;
        widest = channel;
      }
    }

    // Split at the weighted median, keeping at least one bucket a side
    const sorted = [...box.keys].sort(
      (a, b) => channelOf(a, widest) - channelOf(b, widest) || a - b
    );
    const half = box.pixels / 2;
    let running = 0;
    let cut = 1;
    for (let index = 0; index < sorted.length - 1; index++) {
      running += population[sorted[index] as number] as number;
      cut = index + 1;
      if (running >= half) {
        break;
      }
    }
    const left = sorted.slice(0, cut);
    const right = sorted.slice(cut);
    const weigh = (list: number[]) =>
      list.reduce((sum, key) => sum + (population[key] as number), 0);
    boxes.splice(
      pick,
      1,
      { keys: left, pixels: weigh(left) },
      { keys: right, pixels: weigh(right) }
    );
  }

  const palette: number[] = [];
  for (const box of boxes) {
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const key of box.keys) {
      red += sumRed[key] as number;
      green += sumGreen[key] as number;
      blue += sumBlue[key] as number;
    }
    palette.push(
      Math.round(red / box.pixels),
      Math.round(green / box.pixels),
      Math.round(blue / box.pixels)
    );
  }

  // Each bucket takes the nearest palette color to its own mean
  const bucketIndex = new Uint8Array(BUCKET_COUNT);
  const total = palette.length / 3;
  for (const key of keys) {
    const pop = population[key] as number;
    const red = (sumRed[key] as number) / pop;
    const green = (sumGreen[key] as number) / pop;
    const blue = (sumBlue[key] as number) / pop;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < total; index++) {
      const dr = red - (palette[index * 3] as number);
      const dg = green - (palette[index * 3 + 1] as number);
      const db = blue - (palette[index * 3 + 2] as number);
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    bucketIndex[key] = best;
  }
  return { palette, bucketIndex };
}

/** Bits a palette of `colors` entries needs, from 1 (GIF tables hold 2 to 256). */
const tableBitsFor = (colors: number): number =>
  Math.max(1, Math.ceil(Math.log2(colors)));

/** A growable list of bytes, so a big image doesn't cost a second copy. */
class ByteWriter {
  private buffer = new Uint8Array(1024);
  length = 0;

  push(...bytes: number[]): void {
    this.ensure(bytes.length);
    for (const byte of bytes) {
      this.buffer[this.length++] = byte;
    }
  }

  u16(value: number): void {
    this.push(value & 255, (value >> 8) & 255);
  }

  ascii(text: string): void {
    for (let index = 0; index < text.length; index++) {
      this.push(text.charCodeAt(index));
    }
  }

  bytes(source: Uint8Array): void {
    this.ensure(source.length);
    this.buffer.set(source, this.length);
    this.length += source.length;
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) {
      return;
    }
    let size = this.buffer.length;
    while (size < this.length + extra) {
      size *= 2;
    }
    const grown = new Uint8Array(size);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  result(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

/** The LZW stream of GIF: variable-width codes, packed low bit first, in 255-byte blocks. */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out = new ByteWriter();
  const clear = 1 << minCodeSize;
  const end = clear + 1;

  let block: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const flushBlock = () => {
    if (block.length > 0) {
      out.push(block.length, ...block);
      block = [];
    }
  };
  const writeByte = (byte: number) => {
    block.push(byte);
    if (block.length === 255) {
      flushBlock();
    }
  };
  const emit = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      writeByte(bitBuffer & 255);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // table[(prefix << 8) | next] is the code of that string plus one, 0 for none
  let table = new Int32Array(MAX_CODES << 8);
  let codeSize = minCodeSize + 1;
  let nextCode = end + 1;

  emit(clear, codeSize);
  let prefix = indices[0] as number;
  for (let at = 1; at < indices.length; at++) {
    const next = indices[at] as number;
    const key = (prefix << 8) | next;
    const known = table[key] as number;
    if (known !== 0) {
      prefix = known - 1;
      continue;
    }
    emit(prefix, codeSize);
    if (nextCode === MAX_CODES) {
      // The table is full: start again
      emit(clear, codeSize);
      table = new Int32Array(MAX_CODES << 8);
      nextCode = end + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (nextCode >= 1 << codeSize) {
        codeSize++;
      }
      table[key] = nextCode + 1;
      nextCode++;
    }
    prefix = next;
  }
  emit(prefix, codeSize);
  emit(end, codeSize);
  if (bitCount > 0) {
    writeByte(bitBuffer & 255);
  }
  flushBlock();
  return out.result();
}

/**
 * An indexed image as a GIF89a file: one frame, a global color table, the
 * transparent index (if any) in a graphic control extension, and LZW data.
 * Throws a RangeError for a size outside 1 to GIF_MAX_DIMENSION, an empty or
 * oversized palette, a transparent index outside it, or indices that don't
 * match the size or point past the palette.
 */
export function encodeGIF(image: IndexedImage): Uint8Array {
  const { width, height, palette, indices, transparentIndex } = image;
  validateSize(width, height);
  const colors = palette.length / 3;
  if (!Number.isInteger(colors) || colors < 1 || colors > GIF_MAX_COLORS) {
    throw new RangeError(
      `A GIF palette holds 1 to ${GIF_MAX_COLORS} colors, got ${palette.length} bytes`
    );
  }
  if (indices.length !== width * height) {
    throw new RangeError(
      `Expected ${width * height} palette indices for ${width} x ${height}, got ${indices.length}`
    );
  }
  if (
    transparentIndex !== null &&
    !(
      Number.isInteger(transparentIndex) &&
      transparentIndex >= 0 &&
      transparentIndex < colors
    )
  ) {
    throw new RangeError(
      `The transparent index ${transparentIndex} isn't in a palette of ${colors} colors`
    );
  }
  for (let at = 0; at < indices.length; at++) {
    if ((indices[at] as number) >= colors) {
      throw new RangeError(
        `Pixel ${at} points at color ${indices[at]}, past the palette of ${colors}`
      );
    }
  }

  const tableBits = tableBitsFor(colors);
  const tableSize = 1 << tableBits;
  const minCodeSize = Math.max(2, tableBits);

  const out = new ByteWriter();
  out.ascii("GIF89a");
  out.u16(width);
  out.u16(height);
  // Global color table present, 8 bits of color resolution, not sorted
  out.push(0x80 | (7 << 4) | (tableBits - 1), 0, 0);
  out.bytes(palette);
  out.bytes(new Uint8Array((tableSize - colors) * 3)); // pad to a power of 2

  if (transparentIndex !== null) {
    // Graphic control extension: no delay, transparent color flag set
    out.push(0x21, 0xf9, 4, 0x01, 0, 0, transparentIndex, 0);
  }
  out.push(0x2c);
  out.u16(0);
  out.u16(0);
  out.u16(width);
  out.u16(height);
  out.push(0); // no local table, not interlaced
  out.push(minCodeSize);
  out.bytes(lzwEncode(indices, minCodeSize));
  out.push(0); // end of the image data
  out.push(0x3b); // trailer
  return out.result();
}

/** Pixels as a GIF: the palette from `quantizeRGBA`, then `encodeGIF`. */
export function encodeGIFFromRGBA(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): { file: Uint8Array; image: QuantizedImage } {
  const image = quantizeRGBA(rgba, width, height);
  return { file: encodeGIF(image), image };
}

/** An indexed image back to RGBA (see-through pixels get alpha 0). */
export function indexedToRGBA(image: IndexedImage): Uint8ClampedArray {
  const { palette, indices, transparentIndex } = image;
  const out = new Uint8ClampedArray(indices.length * 4);
  for (let pixel = 0; pixel < indices.length; pixel++) {
    const index = indices[pixel] as number;
    const at = pixel * 4;
    out[at] = palette[index * 3] as number;
    out[at + 1] = palette[index * 3 + 1] as number;
    out[at + 2] = palette[index * 3 + 2] as number;
    out[at + 3] = index === transparentIndex ? 0 : OPAQUE;
  }
  return out;
}

const SIGNATURE = "GIF89a";

/**
 * True when `bytes` is a GIF this writer would make: the GIF89a header, a
 * color table that fits the file, one image of the size the header gives with
 * well-formed data blocks, and the trailer. Used to check a file before it is
 * saved, so nothing else is handed out as a GIF.
 */
export function isGIFFile(bytes: Uint8Array): boolean {
  if (bytes.length < 13 + 6 + 10 + 3) {
    return false;
  }
  for (let index = 0; index < SIGNATURE.length; index++) {
    if (bytes[index] !== SIGNATURE.charCodeAt(index)) {
      return false;
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = bytes[10] as number;
  if (width < 1 || height < 1 || !(packed & 0x80)) {
    return false;
  }
  let at = 13 + 3 * (1 << ((packed & 7) + 1));
  if (bytes.length < at) {
    return false;
  }

  // The data sub-blocks that follow `at`: a run of length-prefixed blocks
  // ending in a zero. Returns where the run ends, or -1 when it doesn't.
  const skipBlocks = (from: number): number => {
    let position = from;
    while (position < bytes.length) {
      const length = bytes[position] as number;
      position += 1;
      if (length === 0) {
        return position;
      }
      position += length;
    }
    return -1;
  };

  let images = 0;
  while (at < bytes.length) {
    const marker = bytes[at] as number;
    if (marker === 0x3b) {
      return images === 1 && at === bytes.length - 1;
    }
    if (marker === 0x21) {
      at = skipBlocks(at + 2);
    } else if (marker === 0x2c) {
      if (at + 10 > bytes.length) {
        return false;
      }
      if (
        view.getUint16(at + 5, true) !== width ||
        view.getUint16(at + 7, true) !== height ||
        (bytes[at + 9] as number) & 0x80 // no local color table here
      ) {
        return false;
      }
      const minCodeSize = bytes[at + 10] as number;
      if (minCodeSize < 2 || minCodeSize > 8) {
        return false;
      }
      images += 1;
      at = skipBlocks(at + 11);
    } else {
      return false;
    }
    if (at === -1) {
      return false;
    }
  }
  return false;
}
