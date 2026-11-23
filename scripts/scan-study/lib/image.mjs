/** biome-ignore-all lint/suspicious/noBitwiseOperators: the seeded PRNG and the string hash work on 32-bit integers */
// Pixel operations the capture conditions are built from. Images are
// { data: Uint8ClampedArray (RGBA), width, height }. Everything is
// deterministic: noise comes from a seeded generator, so a rerun gives the
// same pixels (and, with the same decoder versions, the same results).

/** A small seeded PRNG (mulberry32): the same seed, the same sequence. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A 32-bit seed from a string (FNV-1a). */
export function seedOf(text) {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return h >>> 0;
}

const copy = (image) => ({
  data: new Uint8ClampedArray(image.data),
  width: image.width,
  height: image.height,
});

/** Contrast loss around mid grey, as a camera's exposure flattens print. */
export function flatten(image, factor) {
  const out = copy(image);
  const { data } = out;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = 128 + (data[i + c] - 128) * factor;
    }
  }
  return out;
}

/** Runs `pass(plane)` on the red, green and blue planes in float. */
function perChannel(image, pass) {
  const { width, height } = image;
  const count = width * height;
  const out = copy(image);
  const plane = new Float32Array(count);
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < count; p++) plane[p] = image.data[p * 4 + c];
    pass(plane, width, height);
    for (let p = 0; p < count; p++) out.data[p * 4 + c] = plane[p];
  }
  return out;
}

function boxPass(plane, width, height, radius, horizontal) {
  const lines = horizontal ? height : width;
  const span = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const line = new Float32Array(span);
  const window = 2 * radius + 1;
  for (let l = 0; l < lines; l++) {
    const start = horizontal ? l * width : l;
    for (let p = 0; p < span; p++) line[p] = plane[start + p * stride];
    const at = (p) => line[Math.min(Math.max(p, 0), span - 1)];
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += at(k);
    for (let p = 0; p < span; p++) {
      plane[start + p * stride] = sum / window;
      sum += at(p + radius + 1) - at(p - radius);
    }
  }
}

/**
 * The camera model of QRdx's scan score (packages/qrdx/src/scan-score.ts):
 * contrast down to 70%, then two box-blur passes about a quarter module
 * wide, which approximates a Gaussian. Its blur grows with the module, so it
 * models focus and motion relative to the code, not a fixed sensor.
 */
export function cameraModel(image, modulePx, contrast = 0.7) {
  const radius = Math.max(1, Math.round(modulePx * 0.25));
  return perChannel(flatten(image, contrast), (plane, width, height) => {
    for (let pass = 0; pass < 2; pass++) {
      boxPass(plane, width, height, radius, true);
      boxPass(plane, width, height, radius, false);
    }
  });
}

/** Gaussian blur with standard deviation `sigma` pixels (separable). */
export function gaussianBlur(image, sigma) {
  if (!(sigma > 0)) return copy(image);
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + radius] = w;
    total += w;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const convolve = (plane, width, height, horizontal) => {
    const lines = horizontal ? height : width;
    const span = horizontal ? width : height;
    const stride = horizontal ? 1 : width;
    const line = new Float32Array(span);
    for (let l = 0; l < lines; l++) {
      const start = horizontal ? l * width : l;
      for (let p = 0; p < span; p++) line[p] = plane[start + p * stride];
      for (let p = 0; p < span; p++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum +=
            kernel[k + radius] * line[Math.min(Math.max(p + k, 0), span - 1)];
        }
        plane[start + p * stride] = sum;
      }
    }
  };
  return perChannel(image, (plane, width, height) => {
    convolve(plane, width, height, true);
    convolve(plane, width, height, false);
  });
}

/**
 * Sensor noise: the same Gaussian offset (standard deviation `sigma` grey
 * levels out of 255) added to red, green and blue of each pixel.
 */
export function addNoise(image, sigma, random) {
  const out = copy(image);
  const { data } = out;
  for (let i = 0; i < data.length; i += 4) {
    // Box–Muller
    const u = Math.max(random(), 1e-12);
    const v = random();
    const n = sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  return out;
}

/**
 * The image as a pinhole camera sees it when the printed code turns
 * `degrees` about its vertical axis (0 = straight on). The camera sits
 * 2.5 image widths away, so the near edge grows and the far edge shrinks as
 * well as everything narrowing by cos(angle). Bilinear sampling, white
 * outside the print.
 */
export function tilt(image, degrees) {
  if (!degrees) return copy(image);
  const { width, height, data } = image;
  const theta = (degrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const distance = 2.5 * width;
  const cx = width / 2;
  const cy = height / 2;
  const project = (u, v) => {
    const z = distance + u * sin;
    return [(distance * u * cos) / z, (distance * v) / z];
  };
  const corners = [
    project(-cx, -cy),
    project(cx, -cy),
    project(cx, cy),
    project(-cx, cy),
  ];
  const minX = Math.floor(Math.min(...corners.map((p) => p[0]))) - 4;
  const maxX = Math.ceil(Math.max(...corners.map((p) => p[0]))) + 4;
  const minY = Math.floor(Math.min(...corners.map((p) => p[1]))) - 4;
  const maxY = Math.ceil(Math.max(...corners.map((p) => p[1]))) + 4;
  const outW = maxX - minX;
  const outH = maxY - minY;
  const out = new Uint8ClampedArray(outW * outH * 4).fill(255);
  for (let y = 0; y < outH; y++) {
    const py = y + minY + 0.5;
    for (let x = 0; x < outW; x++) {
      const px = x + minX + 0.5;
      // Inverse of `project`
      const u = (px * distance) / (distance * cos - px * sin);
      const v = (py * (distance + u * sin)) / distance;
      const sx = u + cx - 0.5;
      const sy = v + cy - 0.5;
      if (sx < -0.5 || sy < -0.5 || sx > width - 0.5 || sy > height - 0.5) {
        continue;
      }
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const fy = Math.min(1, Math.max(0, sy - y0));
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = data[(y0 * width + x0) * 4 + c];
        const b = data[(y0 * width + x1) * 4 + c];
        const d = data[(y1 * width + x0) * 4 + c];
        const e = data[(y1 * width + x1) * 4 + c];
        out[o + c] =
          (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

const raw = (image) => ({
  raw: { width: image.width, height: image.height, channels: 4 },
});

const bytesOf = (image) =>
  Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length);

/** A JPEG round trip at `quality` (libvips/mozjpeg defaults, 4:2:0 chroma). */
export async function jpeg(sharp, image, quality) {
  const bytes = await sharp(bytesOf(image), raw(image))
    .removeAlpha()
    .jpeg({ quality })
    .toBuffer();
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  };
}

/** Writes the image as an RGB PNG (what zbarimg reads). */
export async function writePng(sharp, image, file) {
  await sharp(bytesOf(image), raw(image))
    .removeAlpha()
    .png({ compressionLevel: 1 })
    .toFile(file);
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two #rrggbb colours (1 to 21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The grey (#gggggg) whose contrast with white is `ratio`. */
export function greyForContrast(ratio) {
  const target = 1.05 / ratio - 0.05;
  let lo = 0;
  let hi = 255;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const hex = `#${mid.toString(16).padStart(2, "0").repeat(3)}`;
    if (luminance(hex) > target) hi = mid;
    else lo = mid;
  }
  // The closer of the two neighbours
  const pick = [lo, hi].sort((x, y) => {
    const hx = `#${x.toString(16).padStart(2, "0").repeat(3)}`;
    const hy = `#${y.toString(16).padStart(2, "0").repeat(3)}`;
    return (
      Math.abs(contrastRatio(hx, "#ffffff") - ratio) -
      Math.abs(contrastRatio(hy, "#ffffff") - ratio)
    );
  })[0];
  return `#${pick.toString(16).padStart(2, "0").repeat(3)}`;
}
