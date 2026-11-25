// Micro QR values whose symbol, at the mask bwip-js picks, has no dark
// module among the last 6 of its bottom row or of its right column. ZXing's
// Micro QR detector (zxing-wasm 3.1.6) misses those in a whole image, so the
// generator draws them at another mask (lib/barcode/draw.ts, drawMicroQr).
// The first four are every miss in a sweep of 2,000 random values (M2 and
// M3); the last two came up in earlier checks.
export const MICRO_QR_CORNER_MISSES = [
  "R",
  "JSJ-",
  "M3D0-IS1USS",
  "ZAMKYQ-MJ2QL",
  "8BG1CI+84Bz",
  "0éé5",
] as const;
