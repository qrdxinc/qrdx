// DotCode (lib/barcode/formats.ts, drawn by bwip-js's `dotcode`). No reader
// here decodes it (tests/barcode/decode.test.ts), so these check what bwip-js
// draws: round dots one module across, on DotCode's checkerboard grid where
// no two dots touch, the same SVG from the browser and Node builds, and the
// size limit: the largest symbol an outside DotCode reader was seen to read
// (DOTCODE_MAX_DOTS), with a plain message past it.
import { describe, expect, it } from "vitest";
import {
  DOTCODE_MAX_DOTS,
  dotcodeDots,
  MODULE_UNITS,
} from "@/lib/barcode/draw";
import { getBarcodeFormat, validateBarcodeInput } from "@/lib/barcode/formats";
import { renderBarcodeSVG } from "@/lib/barcode/render";
import { renderBarcodeServer } from "@/lib/barcode/server";
import {
  type BarcodeStyle,
  defaultBarcodeStyle,
  minScale,
  resolveBarcodeStyle,
} from "@/lib/barcode/style";

const ID = "dotcode";

const VALUES = [
  getBarcodeFormat(ID).example,
  "A",
  "1234567890",
  "https://qrdx.dev/barcode-generator/dotcode",
  "Line one\nLine two",
  "héllo ✓ 日本",
  "Hello World 123 ".repeat(25).slice(0, 390),
];

const FULL =
  "Too much data for one DotCode here: it holds up to about 390 letters or 780 digits, and less with accents or other scripts. Shorten the text.";

/** Each dot's centre and radius: bwip-js draws a dot as four curves. */
function dots(svg: string) {
  return [
    ...svg.matchAll(/M([\d.]+) ([\d.]+)C[\d. ]+?C[\d. ]+?C[\d. ]+?C[\d. ]+?Z/g),
  ].map((match) => {
    const left = Number(match[1]);
    const y = Number(match[2]);
    const segment = match[0];
    // The second curve ends at the top of the circle: its x is the centre.
    const ends = [...segment.matchAll(/C(?:[\d.]+ ){4}([\d.]+) ([\d.]+)/g)];
    const cx = Number(ends[0]?.[1]);
    return { cx, cy: y, r: cx - left };
  });
}

describe("DotCode", () => {
  it.each(VALUES.map((value) => [value.slice(0, 40), value] as const))(
    "%j: the browser and server builds draw the same SVG",
    (_, raw) => {
      const checked = validateBarcodeInput(ID, raw);
      if (!checked.ok) throw new Error(checked.error);
      for (const style of [
        defaultBarcodeStyle(ID),
        {
          ...defaultBarcodeStyle(ID),
          foreground: "#1e3a8a",
          background: "#fffbeb",
          quietZone: 0,
          scale: 2,
          rotation: 90,
        } satisfies BarcodeStyle,
      ]) {
        const browser = renderBarcodeSVG(ID, checked.value, style);
        expect(renderBarcodeServer(ID, checked.value, style).svg).toBe(
          browser.svg,
        );
      }
    },
  );

  it("draws round dots one module across, on a checkerboard grid", () => {
    for (const raw of VALUES) {
      const style = defaultBarcodeStyle(ID);
      const { svg } = renderBarcodeSVG(ID, raw, style);
      // Filled dots, no stroked bars or squares.
      expect(svg).not.toContain("stroke-width");
      const found = dots(svg);
      expect(found.length).toBeGreaterThan(10);
      const module = MODULE_UNITS[ID] * style.scale;
      const minX = Math.min(...found.map((dot) => dot.cx));
      const minY = Math.min(...found.map((dot) => dot.cy));
      const parities = new Set<number>();
      for (const dot of found) {
        expect(dot.r * 2).toBeCloseTo(module, 5);
        const column = (dot.cx - minX) / module;
        const row = (dot.cy - minY) / module;
        expect(Number.isInteger(column)).toBe(true);
        expect(Number.isInteger(row)).toBe(true);
        parities.add((column + row) % 2);
      }
      // Every dot on the same colour of the checkerboard: neighbours are
      // diagonal, so no two dots touch.
      expect(parities.size).toBe(1);
    }
  });

  it("starts with the 3-module quiet zone DotCode needs all round", () => {
    const format = getBarcodeFormat(ID);
    expect(format.quietZone).toEqual({ min: 3, default: 3 });
    const style = defaultBarcodeStyle(ID);
    const { svg } = renderBarcodeSVG(ID, format.example, style);
    const found = dots(svg);
    const margin = 3 * MODULE_UNITS[ID] * style.scale;
    expect(Math.min(...found.map((dot) => dot.cx - dot.r))).toBe(margin);
    expect(Math.min(...found.map((dot) => dot.cy - dot.r))).toBe(margin);
  });

  it("counts the dots it draws, in any shape, scale, margin and rotation", () => {
    for (const raw of [VALUES[0] as string, VALUES[6] as string]) {
      for (const style of [
        defaultBarcodeStyle(ID),
        { ...defaultBarcodeStyle(ID), scale: 2, quietZone: 0 },
        { ...defaultBarcodeStyle(ID), scale: 10, quietZone: 10, rotation: 90 },
      ] satisfies BarcodeStyle[]) {
        const rendered = renderBarcodeSVG(ID, raw, style);
        const found = dots(rendered.svg);
        const module = MODULE_UNITS[ID] * style.scale;
        const span = (values: number[]) =>
          Math.round((Math.max(...values) - Math.min(...values)) / module) + 1;
        expect(dotcodeDots(rendered.width, rendered.height, style)).toBe(
          span(found.map((dot) => dot.cx)) * span(found.map((dot) => dot.cy)),
        );
      }
    }
  });

  it("stops at the largest size an outside reader read: about 390 letters or 780 digits", () => {
    // Measured: every symbol up to 126 × 85 dot positions decoded, none from
    // 128 × 85 (the next size bwip-js draws), whatever the text.
    expect(DOTCODE_MAX_DOTS).toBe(10_710);
    const style = defaultBarcodeStyle(ID);
    const fits = (raw: string) => {
      const rendered = renderBarcodeSVG(ID, raw, style);
      return dotcodeDots(rendered.width, rendered.height, style);
    };
    expect(fits("A".repeat(392))).toBe(126 * 85);
    expect(fits(`A${"1".repeat(783)}`)).toBeLessThanOrEqual(DOTCODE_MAX_DOTS);
    expect(fits("é".repeat(162))).toBeLessThanOrEqual(DOTCODE_MAX_DOTS);
    for (const raw of [
      "A".repeat(396),
      `A${"1".repeat(799)}`,
      "é".repeat(200),
      // Past 2,000 bytes bwip-js refuses it itself: the same message.
      "日".repeat(667),
    ]) {
      expect(() => renderBarcodeSVG(ID, raw, style)).toThrow(FULL);
      expect(() => renderBarcodeServer(ID, raw, style)).toThrow(FULL);
    }
  });

  it("takes a scale of 2 or more: at 1 its dots are 2 pixels across", () => {
    expect(minScale(ID)).toBe(2);
    expect(resolveBarcodeStyle(ID, { scale: 1 })).toEqual({
      ok: false,
      field: "scale",
      message: "DotCode takes a scale of 2 to 10",
    });
  });
});
