/** biome-ignore-all lint/style/noMagicNumbers: color math */
// sRGB to OKLCh and back (Björn Ottosson's OKLab matrices), so a color's
// lightness can move while its hue stays: the halo's rim (looks.ts
// fitHaloColor) keeps the hue a person picked and only changes how light
// it is.
import type { RGBAColor } from "./parse-color";

/** OKLab lightness (0 to 1), chroma and hue (radians). */
export interface OkLch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const toGamma = (value: number) =>
  255 *
  (value <= 0.003_130_8 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

/** An sRGB color (channels 0 to 255) in OKLCh; its alpha is dropped. */
export function rgbToOklch({ r, g, b }: RGBAColor): OkLch {
  const red = toLinear(r);
  const green = toLinear(g);
  const blue = toLinear(b);
  const l = Math.cbrt(
    0.412_221_470_8 * red + 0.536_332_536_3 * green + 0.051_445_992_9 * blue
  );
  const m = Math.cbrt(
    0.211_903_498_2 * red + 0.680_699_545_1 * green + 0.107_396_956_6 * blue
  );
  const s = Math.cbrt(
    0.088_302_461_9 * red + 0.281_718_837_6 * green + 0.629_978_700_5 * blue
  );
  const a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
  return {
    l: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    c: Math.hypot(a, bb),
    h: Math.atan2(bb, a),
  };
}

/** Linear sRGB (0 to 1 inside the gamut) of an OKLCh color. */
function toLinearRgb({ l, c, h }: OkLch): [number, number, number] {
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const long = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const medium = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const short = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * long - 3.307_711_591_3 * medium + 0.230_969_929_2 * short,
    -1.268_438_004_6 * long +
      2.609_757_401_1 * medium -
      0.341_319_396_5 * short,
    -0.004_196_086_3 * long - 0.703_418_614_7 * medium + 1.707_614_701 * short,
  ];
}

const GAMUT_SLACK = 1e-7;
const inGamut = (rgb: number[]) =>
  rgb.every((value) => value >= -GAMUT_SLACK && value <= 1 + GAMUT_SLACK);

/** Halvings of the chroma when a color is outside sRGB: well past a channel step. */
const GAMUT_STEPS = 20;

/**
 * An OKLCh color as sRGB, channels rounded to whole numbers. Outside sRGB
 * its chroma is reduced until it fits, its lightness and hue kept.
 */
export function oklchToRgb(color: OkLch): RGBAColor {
  let linear = toLinearRgb(color);
  if (!inGamut(linear)) {
    let inside = 0;
    let outside = color.c;
    for (let step = 0; step < GAMUT_STEPS; step++) {
      const c = (inside + outside) / 2;
      if (inGamut(toLinearRgb({ ...color, c }))) {
        inside = c;
      } else {
        outside = c;
      }
    }
    linear = toLinearRgb({ ...color, c: inside });
  }
  const [r = 0, g = 0, b = 0] = linear.map((value) =>
    Math.round(toGamma(Math.min(1, Math.max(0, value))))
  );
  return { r, g, b, a: 1 };
}
