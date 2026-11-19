import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { QRProps } from "qrdx";
import {
  decodePNGPixels,
  encodeBMP,
  encodeICO,
  ICO_SIZES,
  QRCodeSVG,
  svgToEPS,
} from "qrdx";
import { getQRAsPNG } from "qrdx/node";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * "webp" is lossless: the PNG's pixels in a smaller file. "bmp" is an
 * uncompressed 24-bit bitmap; a transparent background comes out white.
 * "ico" is a favicon holding the code at 16, 32, 48 and 256 px.
 */
export type OutputFormat = "svg" | "png" | "webp" | "bmp" | "ico" | "eps";

export const OUTPUT_FORMATS: readonly OutputFormat[] = [
  "svg",
  "png",
  "webp",
  "bmp",
  "ico",
  "eps",
];

export interface OutputOptions extends QRProps {
  size?: number;
  outputPath: string;
  format: OutputFormat;
}

type SharpFactory = typeof import("sharp").default;

export function buildSVGString(props: QRProps & { size?: number }): string {
  const element = createElement(QRCodeSVG as React.ComponentType<QRProps>, {
    size: props.size ?? 512,
    ...props,
  });
  return renderToStaticMarkup(element);
}

async function loadLogo(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    const payload = src.slice(comma + 1);
    return src.slice(0, comma).endsWith(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload));
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(
        `Could not download logo (${res.status} ${res.statusText}): ${src}`
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(src);
}

/**
 * EPS embeds PNG and JPEG logos, so other formats (SVG, WebP, …) are
 * converted with sharp when it is installed. Returns null when that fails.
 */
async function logoAsEmbeddableDataUrl(src: string): Promise<string | null> {
  const bytes = await loadLogo(src);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }
  try {
    const mod = await import("sharp");
    const sharp = (mod as { default: SharpFactory }).default;
    const png = await sharp(bytes).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Vector EPS, `size` points wide (72 per inch), plus any frame. */
async function buildEPSString(props: QRProps & { size?: number }) {
  const src = props.imageSettings?.src;
  let epsProps = props;
  if (src && props.imageSettings) {
    const dataUrl = await logoAsEmbeddableDataUrl(src);
    if (dataUrl) {
      epsProps = {
        ...props,
        imageSettings: { ...props.imageSettings, src: dataUrl },
      };
    } else {
      console.warn(
        "The logo could not be converted for EPS (PNG or JPEG work best), so it was left out."
      );
    }
  }
  return await svgToEPS(buildSVGString(epsProps));
}

export async function saveOutput(options: OutputOptions): Promise<void> {
  const { outputPath, format, ...qrProps } = options;

  const svgString = buildSVGString(qrProps);

  if (format === "svg") {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
    writeFileSync(outputPath, svgContent, "utf-8");
    return;
  }

  if (format === "eps") {
    writeFileSync(outputPath, await buildEPSString(qrProps), "utf-8");
    return;
  }

  // ICO: the code drawn at each of the icon's sizes (16, 32, 48 and 256 px),
  // each a PNG inside the engine's ICO writer, so it needs no sharp. --size
  // doesn't apply, and a frame is left out: every image is square. The small
  // sizes are for icons, not for scanning.
  if (format === "ico") {
    const images = [];
    for (const size of ICO_SIZES) {
      const png = await getQRAsPNG(
        { ...qrProps, frame: undefined, size },
        { size, loadExternalLogos: true }
      );
      images.push({ width: size, height: size, png });
    }
    writeFileSync(outputPath, encodeICO(images));
    return;
  }

  // One raster path with the library for the other raster formats: the engine
  // rasterizes its own SVG (an optional @resvg/resvg-js or sharp peer,
  // loaded on demand). The CLI loads external logos — the person running it
  // picked the path or URL.
  const pngBytes = await getQRAsPNG(qrProps, {
    size: qrProps.size ?? 512,
    loadExternalLogos: true,
  });

  if (format === "png") {
    writeFileSync(outputPath, pngBytes);
    return;
  }

  // BMP: the PNG's pixels written by the engine's own encoder, so it needs
  // no sharp. 24-bit has no alpha: a transparent background comes out white.
  if (format === "bmp") {
    const pixels = await decodePNGPixels(pngBytes);
    if (!pixels) {
      throw new Error("Could not read the rendered PNG to write a BMP file.");
    }
    writeFileSync(
      outputPath,
      encodeBMP(pixels.data, pixels.width, pixels.height)
    );
    return;
  }

  // WebP lossless: the PNG's pixels in a smaller file.
  let sharp: SharpFactory;
  try {
    const mod = await import("sharp");
    sharp = (mod as { default: SharpFactory }).default;
  } catch {
    throw new Error(
      "WebP output needs the sharp package (native binaries). It is optional and may not have installed; use SVG or reinstall: https://sharp.pixelplumbing.com/install"
    );
  }
  await sharp(Buffer.from(pngBytes))
    .webp({ lossless: true })
    .toFile(outputPath);
}
