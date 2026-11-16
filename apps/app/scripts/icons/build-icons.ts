// bun run --filter app icons:build   (tsx, on Node)
//
// Draws the site's icons in public/ from the QRdx mark (LOGO_MARK_PATH) in
// the brand blue. The mark is 9/16 of the canvas wide, centred, so all of it
// sits inside the inscribed circle and inside the 80% safe zone of maskable
// icons: Google shows site icons in a circle, and launchers crop to circles
// and squircles. At 9/16 every straight edge of the mark lands on a whole
// pixel when the canvas is a multiple of 32 px (32, 96, 192, 512), so those
// sizes stay sharp. Re-run it after the mark or the brand colour changes, and
// commit what it writes.
//
// - favicon.ico, favicon.svg, favicon-96x96.png and logo.png (the Organization
//   logo in the JSON-LD) are the mark on a transparent background;
// - apple-touch-icon.png and the maskable web-app-manifest icons need an
//   opaque square (iOS turns transparency black; launchers fill the mask), so
//   they put the same mark on plain white.
//
// The scanner app's icons (public/app-icons/scanner) come from
// scripts/scanner-app-icons.ts.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BRAND_BLUE } from "@repo/config";
import { LOGO_MARK_PATH } from "@repo/design-system/components/brand/brand-marks";
import sharp from "sharp";

const PUBLIC = path.join(import.meta.dirname, "../../public");
/** The mark's width as a share of the canvas. */
const MARK_SCALE = 9 / 16;
/** The mark's own box (LOGO_MARK_PATH is drawn in 256 × 256). */
const MARK_BOX = 256;
const WHITE = "#ffffff";

/**
 * The mark centred on a `size` square, on `background` or transparent. The
 * offset is rounded down to a whole pixel, so at 16 and 48 px the brackets
 * stay sharp (the mark sits at most half a pixel left of and above centre).
 */
function iconSvg(size: number, background?: string): string {
  const scale = (size * MARK_SCALE) / MARK_BOX;
  const offset = Math.floor((size * (1 - MARK_SCALE)) / 2);
  const tile = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}<path fill="${BRAND_BLUE}" transform="matrix(${scale} 0 0 ${scale} ${offset} ${offset})" d="${LOGO_MARK_PATH}"/></svg>\n`;
}

function png(size: number, background?: string): Promise<Buffer> {
  return sharp(Buffer.from(iconSvg(size, background)))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * One ICO image: a 32-bit BMP (BGRA rows bottom-up, then the 1-bit AND mask,
 * set where a pixel is fully transparent), as favicon.ico has always held.
 */
async function icoImage(size: number): Promise<Buffer> {
  const { data } = await sharp(Buffer.from(iconSvg(size)))
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
  write("favicon.svg", iconSvg(MARK_BOX));
  write("favicon.ico", await ico([16, 32, 48]));
  write("favicon-96x96.png", await png(96));
  write("logo.png", await png(512));
  // Opaque squares, where the platform requires one.
  write("apple-touch-icon.png", await png(180, WHITE));
  for (const size of [192, 512]) {
    write(`web-app-manifest-${size}x${size}.png`, await png(size, WHITE));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
