// The two looks every docs picture gets, applied here and never by hand:
//
// - "window": the captured region, corners rounded, on a quiet neutral
//   backdrop with generous padding and one soft shadow.
// - "focus": the dialog or control the step is about stays crisp while the
//   rest of the capture is softly blurred and dimmed behind it; then the
//   window treatment around that.
//
// Captures come in at 2x (a 1440 px viewport is a 2880 px PNG). Output is
// WebP between 1600 and 2000 px wide. No device chrome, no arrows, no
// gradients, no text burned in.
import sharp, { type Sharp } from "sharp";
import type { Box, Theme } from "./types";

/** Device pixel ratio of the captures. */
export const SCALE = 2;

/** Final width of a window-look picture (clamped: a narrow crop stays narrower). */
const TARGET_WIDTH = 1800;
const MIN_WIDTH = 1600;
const MAX_WIDTH = 2000;

const BACKDROP: Record<Theme, string> = { light: "#eef0f3", dark: "#111318" };
/** A hairline around the captured surface so a white page edge reads as an edge. */
const EDGE: Record<Theme, { r: number; g: number; b: number; alpha: number }> =
  {
    light: { r: 0, g: 0, b: 0, alpha: 0.1 },
    dark: { r: 255, g: 255, b: 255, alpha: 0.12 },
  };

export interface Styled {
  webp: Buffer;
  width: number;
  height: number;
}

function roundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
}

function edgeSvg(
  width: number,
  height: number,
  radius: number,
  theme: Theme,
): Buffer {
  const { r, g, b, alpha } = EDGE[theme];
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" ry="${radius}" fill="none" stroke="rgba(${r},${g},${b},${alpha})" stroke-width="1"/></svg>`,
  );
}

/** Clamps a 2x pixel box to the image. */
function clamp(box: Box, width: number, height: number): Box {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  return {
    x,
    y,
    width: Math.min(width - x, Math.round(box.width)),
    height: Math.min(height - y, Math.round(box.height)),
  };
}

/** A box grown by `margin` on every side, kept inside the image. */
function grow(box: Box, margin: number, width: number, height: number): Box {
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  return {
    x,
    y,
    width: Math.min(width, box.x + box.width + margin) - x,
    height: Math.min(height, box.y + box.height + margin) - y,
  };
}

/** sharp's extract() region for a box. */
const extractRegion = (box: Box) => ({
  left: box.x,
  top: box.y,
  width: box.width,
  height: box.height,
});

/** Converts a CSS-pixel box (from the page) to capture pixels. */
export const scaled = (box: Box): Box => ({
  x: box.x * SCALE,
  y: box.y * SCALE,
  width: box.width * SCALE,
  height: box.height * SCALE,
  ...(box.radius !== undefined && { radius: box.radius * SCALE }),
});

/**
 * The window look around a surface (a PNG region): rounded corners, hairline
 * edge, shadow, padding, backdrop; then scaled to the target width.
 */
async function frame(surface: Sharp, theme: Theme): Promise<Styled> {
  const { width, height } = await surface.metadata();
  if (!(width && height)) throw new Error("frame: surface has no size");

  const radius = 12 * SCALE;
  // Generous padding; a narrow capture (a phone, one card) gets more at the
  // sides, so every picture is at least TARGET_WIDTH wide without upscaling.
  const padY = 56 * SCALE;
  const padX = Math.max(padY, Math.ceil((TARGET_WIDTH - width) / 2));
  const rounded = await surface
    .clone()
    .composite([
      { input: roundedMask(width, height, radius), blend: "dest-in" },
      { input: edgeSvg(width, height, radius, theme), blend: "over" },
    ])
    .png()
    .toBuffer();

  // One soft shadow, offset a little downwards.
  const blur = 22 * SCALE;
  const shadow = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: theme === "light" ? 0.22 : 0.55 },
    },
  })
    .composite([
      { input: roundedMask(width, height, radius), blend: "dest-in" },
    ])
    .png()
    .toBuffer();
  const shadowLayer = await sharp({
    create: {
      width: width + padX * 2,
      height: height + padY * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: shadow, left: padX, top: padY + 10 * SCALE }])
    .png()
    .toBuffer();
  const blurredShadow = await sharp(shadowLayer)
    .blur(blur / 2)
    .png()
    .toBuffer();

  const composed = sharp({
    create: {
      width: width + padX * 2,
      height: height + padY * 2,
      channels: 3,
      background: BACKDROP[theme],
    },
  }).composite([
    { input: blurredShadow, left: 0, top: 0 },
    { input: rounded, left: padX, top: padY },
  ]);

  const total = width + padX * 2;
  const outWidth = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, Math.min(TARGET_WIDTH, total)),
  );
  const resized = sharp(await composed.png().toBuffer()).resize({
    width: outWidth,
    kernel: "lanczos3",
  });
  const webp = await resized
    .webp({ quality: 82, effort: 5, smartSubsample: true })
    .toBuffer();
  const meta = await sharp(webp).metadata();
  return { webp, width: meta.width ?? outWidth, height: meta.height ?? 0 };
}

/** The window look of a capture, or of a region of it (capture pixels). */
export async function windowLook(
  png: Buffer,
  theme: Theme,
  region?: Box,
): Promise<Styled> {
  const image = sharp(png);
  const { width, height } = await image.metadata();
  if (!(width && height)) throw new Error("windowLook: capture has no size");
  const surface = region
    ? image.extract(extractRegion(clamp(region, width, height)))
    : image;
  return frame(sharp(await surface.png().toBuffer()), theme);
}

/**
 * The focus look: `focus` (capture pixels) stays as captured, everything
 * else in the region around it is blurred and dimmed; then the window look.
 */
export async function focusLook(
  png: Buffer,
  theme: Theme,
  focus: Box,
  options: { margin?: number } = {},
): Promise<Styled> {
  const image = sharp(png);
  const { width, height } = await image.metadata();
  if (!(width && height)) throw new Error("focusLook: capture has no size");
  const crisp = clamp(focus, width, height);
  const margin = (options.margin ?? 96) * SCALE;
  const region = grow(crisp, margin, width, height);

  const backdrop = await image
    .clone()
    .extract(extractRegion(region))
    .blur(9 * SCALE)
    // The app already dims the page behind a dialog; this only softens it.
    .modulate({ brightness: theme === "light" ? 1.02 : 0.82, saturation: 0.8 })
    .composite([
      {
        input: {
          create: {
            width: region.width,
            height: region.height,
            channels: 4,
            background:
              theme === "light"
                ? { r: 255, g: 255, b: 255, alpha: 0.2 }
                : { r: 0, g: 0, b: 0, alpha: 0.22 },
          },
        },
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  // The crisp surface, with a soft shadow of its own so it sits above the blur.
  // Its corners follow the element's own radius, so nothing of the page
  // behind shows in them.
  const radius = Math.round(focus.radius ?? 10 * SCALE);
  const crispPng = await sharp(png)
    .extract(extractRegion(crisp))
    .composite([
      {
        input: roundedMask(crisp.width, crisp.height, radius),
        blend: "dest-in",
      },
      {
        input: edgeSvg(crisp.width, crisp.height, radius, theme),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
  const halo = await sharp({
    create: {
      width: region.width,
      height: region.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: crisp.width,
            height: crisp.height,
            channels: 4,
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: theme === "light" ? 0.2 : 0.5,
            },
          },
        })
          .composite([
            {
              input: roundedMask(crisp.width, crisp.height, radius),
              blend: "dest-in",
            },
          ])
          .png()
          .toBuffer(),
        left: crisp.x - region.x,
        top: crisp.y - region.y + 6 * SCALE,
      },
    ])
    .png()
    .toBuffer();
  const blurredHalo = await sharp(halo)
    .blur(10 * SCALE)
    .png()
    .toBuffer();

  const surface = sharp(backdrop).composite([
    { input: blurredHalo, left: 0, top: 0 },
    { input: crispPng, left: crisp.x - region.x, top: crisp.y - region.y },
  ]);
  return frame(sharp(await surface.png().toBuffer()), theme);
}

/** A poster for a clip: the window look of its first frame (JPEG from the screencast). */
export async function posterLook(jpeg: Buffer, theme: Theme): Promise<Styled> {
  return frame(sharp(jpeg), theme);
}
