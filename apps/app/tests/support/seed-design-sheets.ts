// Contact sheets of the official designs, for a person to look at:
// COMMUNITY_DESIGN_SHEETS=<dir> bun x vitest run tests/database/seed-designs.test.ts
// writes designs-<n>.png there, 20 designs a sheet with their names and
// shapes under each. Rendered the way the gallery renders them (the
// server's design renderer), composed with sharp.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { GATE_SAMPLES } from "@/lib/community/scan-samples";
import { renderDesignPng } from "@/lib/qr-design/score";
import type { SeededDesign } from "./seed-designs";
import { shownStyle } from "./seed-designs";

const PER_SHEET = 20;
const COLUMNS = 5;
const TILE = { width: 300, height: 380 };
const IMAGE = { width: 260, height: 290 };

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function caption(item: SeededDesign, position: number): Buffer {
  const style = item.payload.style;
  const parts = `${style.bodyPattern} · ${style.cornerEyePattern} · ${style.cornerEyeDotPattern}`;
  const frame =
    item.facets.pairedFrame ??
    (style.frame && style.frame.style !== "custom" ? style.frame.style : "");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.width}" height="80">
      <text x="10" y="22" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="#111">${position + 1}. ${escapeXml(item.name)}</text>
      <text x="10" y="42" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#444">${escapeXml(item.slug)}${frame ? ` · ${escapeXml(frame)}` : ""}</text>
      <text x="10" y="60" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#666">${escapeXml(parts)}</text>
    </svg>`,
  );
}

/** Writes the sheets to `dir` and returns their paths. */
export async function writeDesignSheets(
  designs: SeededDesign[],
  dir: string,
): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (let start = 0; start < designs.length; start += PER_SHEET) {
    const page = designs.slice(start, start + PER_SHEET);
    const rows = Math.ceil(page.length / COLUMNS);
    const layers: OverlayOptions[] = [];
    for (const [i, item] of page.entries()) {
      const style = shownStyle(item);
      const png = await renderDesignPng(
        GATE_SAMPLES[0].value,
        style,
        256,
        style.customLogo,
      );
      const image = await sharp(Buffer.from(png))
        .resize(IMAGE.width, IMAGE.height, {
          fit: "contain",
          background: "#ffffff",
        })
        .png()
        .toBuffer();
      const x = (i % COLUMNS) * TILE.width;
      const y = Math.floor(i / COLUMNS) * TILE.height;
      layers.push({ input: image, left: x + 20, top: y + 10 });
      layers.push({
        input: caption(item, start + i),
        left: x,
        top: y + IMAGE.height + 14,
      });
    }
    const file = join(dir, `designs-${start / PER_SHEET + 1}.png`);
    await sharp({
      create: {
        width: COLUMNS * TILE.width,
        height: rows * TILE.height,
        channels: 4,
        background: "#f3f4f6",
      },
    })
      .composite(layers)
      .png()
      .toFile(file);
    files.push(file);
  }
  writeFileSync(
    join(dir, "index.txt"),
    `${designs.map((item, i) => `${i + 1}\t${item.slug}`).join("\n")}\n`,
  );
  return files;
}
