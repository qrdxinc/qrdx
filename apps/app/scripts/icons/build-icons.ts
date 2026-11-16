// bun run --filter app icons:build   (tsx, on Node)
//
// Draws the site's icons in public/ from the QRdx mark (LOGO_MARK_PATH) in
// the brand blue, centred, small enough that a round crop keeps all of it:
// Google shows a site icon cropped to a circle, and launchers crop maskable
// icons to circles and squircles. The mark's farthest point (the rounded
// outer corner of a bracket) is 0.627 of the mark's width from its centre.
// Re-run it after the mark or the brand colour changes, and commit what it
// writes.
//
// - favicon.ico, favicon.svg, favicon-96x96.png and logo.png (the Organization
//   logo in the JSON-LD) are the mark on a transparent background, 72% of the
//   canvas wide: its corners reach 45% of the width from the centre, inside
//   the inscribed circle (50%) with a small margin;
// - apple-touch-icon.png and the maskable web-app-manifest icons need an
//   opaque square (iOS turns transparency black; launchers fill the mask), so
//   they put the mark on plain white, 60% of the canvas wide: its corners
//   reach 37.6%, inside the 80% safe zone (40%).
//
// The status pages' logo-mark.svg and the scanner app's icons
// (public/app-icons/scanner, scripts/scanner-app-icons.ts) are separate.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BRAND_BLUE } from "@repo/config";
import { LOGO_MARK_PATH } from "@repo/design-system/components/brand/brand-marks";
import sharp from "sharp";

const PUBLIC = path.join(import.meta.dirname, "../../public");
/** The mark's own box (LOGO_MARK_PATH is drawn in 256 × 256). */
const MARK_BOX = 256;
const WHITE = "#ffffff";

interface IconOptions {
  /** The mark's width as a share of the canvas. */
  scale: number;
  /** A full-bleed square behind the mark; transparent when left out. */
  background?: string;
}

/** Shown in a circle: as large as fits inside it with a small margin. */
const CIRCLE: IconOptions = { scale: 0.72 };
/** Opaque, with the mark inside the 80% safe zone. */
const OPAQUE: IconOptions = { scale: 0.6, background: WHITE };

/** The mark centred on a `size` square. */
function iconSvg(size: number, { scale, background }: IconOptions): string {
  const factor = (size * scale) / MARK_BOX;
  const offset = (size * (1 - scale)) / 2;
  const tile = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}<path fill="${BRAND_BLUE}" transform="matrix(${factor} 0 0 ${factor} ${offset} ${offset})" d="${LOGO_MARK_PATH}"/></svg>\n`;
}

function png(size: number, options: IconOptions): Promise<Buffer> {
  return sharp(Buffer.from(iconSvg(size, options)))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * One ICO image: a 32-bit BMP (BGRA rows bottom-up, then the 1-bit AND mask,
 * set where a pixel is fully transparent), as favicon.ico has always held.
 */
async function icoImage(size: number): Promise<Buffer> {
  const { data } = await sharp(Buffer.from(iconSvg(size, CIRCLE)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // colour rows plus mask rows
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = (row * size + x) * 4;
      pixels[to] = data[from + 2];
      pixels[to + 1] = data[from + 1];
      pixels[to + 2] = data[from];
      pixels[to + 3] = data[from + 3];
      if (data[from + 3] === 0) {
        mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, pixels, mask]);
}

async function ico(sizes: number[]): Promise<Buffer> {
  const images = await Promise.all(sizes.map(icoImage));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, index) => {
    const entry = 6 + 16 * index;
    head.writeUInt8(size, entry);
    head.writeUInt8(size, entry + 1);
    head.writeUInt16LE(1, entry + 4); // colour planes
    head.writeUInt16LE(32, entry + 6); // bits per pixel
    head.writeUInt32LE(images[index].length, entry + 8);
    head.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([head, ...images]);
}

function write(name: string, contents: Buffer | string): void {
  writeFileSync(path.join(PUBLIC, name), contents);
  console.log(`public/${name} (${Buffer.byteLength(contents)} bytes)`);
}

async function main(): Promise<void> {
  // The mark alone: favicons and the Organization logo.
  write("favicon.svg", iconSvg(MARK_BOX, CIRCLE));
  write("favicon.ico", await ico([16, 32, 48]));
  write("favicon-96x96.png", await png(96, CIRCLE));
  write("logo.png", await png(512, CIRCLE));
  // Opaque squares, where the platform requires one.
  write("apple-touch-icon.png", await png(180, OPAQUE));
  for (const size of [192, 512]) {
    write(`web-app-manifest-${size}x${size}.png`, await png(size, OPAQUE));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
