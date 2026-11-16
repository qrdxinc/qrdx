// The site's icons, its web app manifest and the home page's preferred image.
// The icons in public/ come from scripts/icons/build-icons.ts. Google shows a
// site icon cropped to a circle and launchers crop maskable icons, so the
// whole mark has to sit inside the circle (and inside the 80% safe zone on
// opaque icons), with no edge-to-edge artwork for a crop to cut off.

import { readFileSync } from "node:fs";
import path from "node:path";
import { BRAND_BLUE } from "@repo/config";
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES } from "@repo/i18n/config";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { baseUrl, defaultOgImage, siteDescription } from "@/lib/metadata";
import { siteIcons } from "@/lib/root-metadata";
import { homeWebPageSchema, webSiteId } from "@/lib/seo-schema";
import en from "@/messages/en.json";

const PUBLIC = path.join(import.meta.dirname, "../../public");
const read = (file: string) => readFileSync(path.join(PUBLIC, file));

interface Raster {
  size: number;
  /** RGBA, row by row from the top. */
  data: Buffer;
}

async function decodePng(file: string): Promise<Raster> {
  const { data, info } = await sharp(read(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width, file).toBe(info.height);
  return { size: info.width, data };
}

/** favicon.ico's images: 32-bit BMPs (BGRA rows from the bottom). */
function decodeIco(buffer: Buffer): Raster[] {
  expect(buffer.readUInt16LE(2)).toBe(1);
  const images: Raster[] = [];
  for (let index = 0; index < buffer.readUInt16LE(4); index++) {
    const entry = 6 + 16 * index;
    const size = buffer[entry] || 256;
    const offset = buffer.readUInt32LE(entry + 12);
    expect(buffer.readUInt32LE(offset)).toBe(40);
    expect(buffer.readUInt16LE(offset + 14)).toBe(32);
    const data = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = offset + 40 + ((size - 1 - y) * size + x) * 4;
        const to = (y * size + x) * 4;
        data[to] = buffer[from + 2];
        data[to + 1] = buffer[from + 1];
        data[to + 2] = buffer[from];
        data[to + 3] = buffer[from + 3];
      }
    }
    images.push({ size, data });
  }
  return images;
}

const hex = (data: Buffer, at: number) =>
  `#${[data[at], data[at + 1], data[at + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Where the mark is: the farthest mark pixel from the centre (as a share of
 * the width) and whether any pixel is exactly the brand blue. A mark pixel is
 * any visible pixel on a transparent icon, any non-white one on an opaque icon.
 */
function measure({ size, data }: Raster, opaque: boolean) {
  let farthest = 0;
  let brandBlue = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      const mark = opaque
        ? hex(data, at) !== "#ffffff"
        : (data[at + 3] as number) > 0;
      if (!mark) continue;
      if (hex(data, at) === BRAND_BLUE && data[at + 3] === 255) {
        brandBlue = true;
      }
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      farthest = Math.max(farthest, distance);
    }
  }
  return { farthest: farthest / size, brandBlue };
}

/**
 * Where the mark may reach, as a share of the width from the centre. Icons
 * shown in a circle fill it, short of its edge (0.5) by a small margin;
 * opaque icons stay inside the 80% safe zone (0.4). The lower bounds keep the
 * mark from shrinking: about 72% and 60% of the canvas wide.
 */
const REACH = {
  circle: { min: 0.42, max: 0.47 },
  safeZone: { min: 0.35, max: 0.4 },
};

function expectMarkWithin(
  raster: Raster,
  opaque: boolean,
  { min, max }: { min: number; max: number },
  label: string,
) {
  const { farthest, brandBlue } = measure(raster, opaque);
  // Half a pixel of antialiasing either way.
  const pixel = 0.5 / raster.size;
  expect(farthest, label).toBeLessThanOrEqual(max + pixel);
  expect(farthest, label).toBeGreaterThanOrEqual(min - pixel);
  expect(brandBlue, `${label} is drawn in ${BRAND_BLUE}`).toBe(true);
}

/** The byte offsets of the four corner pixels. */
function corners({ size }: Raster): number[] {
  return [0, size - 1, size * (size - 1), size * size - 1].map((i) => i * 4);
}

describe("site icons", () => {
  it("lists only files that exist", () => {
    for (const { url } of siteIcons.icon) {
      expect(() => read(url), url).not.toThrow();
    }
    expect(() => read(siteIcons.apple)).not.toThrow();
  });

  it("favicon.svg is the mark as vector paths in the brand blue", () => {
    const svg = read("favicon.svg").toString("utf8");
    expect(svg).toContain("<path");
    expect(svg).toContain(`fill="${BRAND_BLUE}"`);
    expect(svg).not.toMatch(/<image|base64|<rect/);
  });

  it("favicon.ico holds 16, 32 and 48 px, transparent, the mark inside the circle", () => {
    const images = decodeIco(read("favicon.ico"));
    expect(images.map((image) => image.size)).toEqual([16, 32, 48]);
    for (const image of images) {
      for (const at of corners(image)) expect(image.data[at + 3]).toBe(0);
      expectMarkWithin(image, false, REACH.circle, `favicon.ico ${image.size}`);
    }
  });

  it.each([
    ["favicon-96x96.png", 96],
    ["logo.png", 512],
  ])("%s is the mark on a transparent background", async (file, size) => {
    const image = await decodePng(file);
    expect(image.size).toBe(size);
    for (const at of corners(image)) expect(image.data[at + 3]).toBe(0);
    expectMarkWithin(image, false, REACH.circle, file);
  });

  it.each([
    ["apple-touch-icon.png", 180],
    ["web-app-manifest-192x192.png", 192],
    ["web-app-manifest-512x512.png", 512],
  ])(
    "%s is opaque white with the mark in the safe zone",
    async (file, size) => {
      const image = await decodePng(file);
      expect(image.size).toBe(size);
      for (let at = 3; at < image.data.length; at += 4) {
        expect(image.data[at]).toBe(255);
      }
      for (const at of corners(image))
        expect(hex(image.data, at)).toBe("#ffffff");
      expectMarkWithin(image, true, REACH.safeZone, file);
    },
  );
});

describe("site.webmanifest", () => {
  const manifest = JSON.parse(read("site.webmanifest").toString("utf8")) as {
    description: string;
    theme_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };

  it("describes the site as its meta description does", () => {
    expect(manifest.description).toBe(siteDescription);
    expect(manifest.description).toBe(en.meta.siteDescription);
  });

  it("uses the brand blue as its theme colour", () => {
    expect(manifest.theme_color).toBe(BRAND_BLUE);
  });

  it("points at maskable icons of the sizes it claims", async () => {
    for (const icon of manifest.icons) {
      const { size } = await decodePng(icon.src);
      expect(icon.sizes).toBe(`${size}x${size}`);
      expect(icon.purpose).toBe("maskable");
    }
  });
});

describe("home page WebPage node", () => {
  it("names the Open Graph image as the page's primary image", () => {
    const node = homeWebPageSchema("en");
    expect(node.url).toBe(new URL("/", baseUrl).toString());
    expect(node.isPartOf).toEqual({ "@id": webSiteId });
    expect(node.primaryImageOfPage).toEqual({
      "@type": "ImageObject",
      url: new URL(defaultOgImage.url, baseUrl).toString(),
      width: 1200,
      height: 630,
    });
  });

  it("uses each language's own home URL", () => {
    for (const locale of LOCALES.filter((other) => other !== DEFAULT_LOCALE)) {
      const node = homeWebPageSchema(locale);
      expect(node.url).toBe(
        new URL(`/${LOCALE_INFO[locale].segment}`, baseUrl).toString(),
      );
      expect(node.primaryImageOfPage.url).toBe(
        new URL(defaultOgImage.url, baseUrl).toString(),
      );
    }
  });
});
