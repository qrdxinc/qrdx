// USPS Intelligent Mail (lib/barcode/formats.ts, drawn by bwip-js's
// `onecode`). No reader here decodes it (tests/barcode/decode.test.ts), so
// the bars are checked against the specification instead: USPS-B-3200 Rev H
// (2015), Appendix C, gives four worked examples with their 65 bars, and
// section 2.3 (Figure 6) the sizes every bar must keep.
import { describe, expect, it } from "vitest";
import { MODULE_UNITS } from "@/lib/barcode/draw";
import { validateBarcodeInput } from "@/lib/barcode/formats";
import { renderBarcodeSVG } from "@/lib/barcode/render";
import { renderBarcodeServer } from "@/lib/barcode/server";
import {
  type BarcodeStyle,
  defaultBarcodeStyle,
  minScale,
  resolveBarcodeStyle,
} from "@/lib/barcode/style";

const ID = "intelligent-mail";
const POINTS_PER_INCH = 72;

/** USPS-B-3200 Appendix C, Tables 13 to 16: payload and bars (A, D, F, T). */
const SPEC_EXAMPLES = [
  [
    "01234567094987654321",
    "ATTFATTDTTADTAATTDTDTATTDAFDDFADFDFTFFFFFTATFAAAATDFFTDAADFTFDTDT",
  ],
  [
    "0123456709498765432101234",
    "DTTAFADDTTFTDTFTFDTDDADADAFADFATDDFTAAAFDTTADFAAATDFDTDFADDDTDFFT",
  ],
  [
    "01234567094987654321012345678",
    "ADFTTAFDTTTTFATTADTAAATFTFTATDAAAFDDADATATDTDTTDFDTDATADADTDFFTFA",
  ],
  [
    "0123456709498765432101234567891",
    "AADTFFDFTDADTAADAATFDTDDAAADDTDTTDAFADADDDTFFFDDTTTADFAAADFTDAADA",
  ],
] as const;

interface Bar {
  x: number;
  top: number;
  bottom: number;
}

/** The stroked bars of a drawing: bwip-js draws each as one vertical line. */
function bars(svg: string): { bars: Bar[]; strokeWidth: number } {
  const path =
    /<path stroke="#[0-9a-f]{6}" stroke-width="([\d.]+)" d="([^"]+)"/.exec(svg);
  if (!path) throw new Error("No stroked bars in the drawing");
  const found = [
    ...(path[2] as string).matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g),
  ].map((match) => {
    const [x1, y1, x2, y2] = match.slice(1).map(Number) as number[];
    expect(x2).toBe(x1);
    return {
      x: x1 as number,
      top: Math.min(y1 as number, y2 as number),
      bottom: Math.max(y1 as number, y2 as number),
    };
  });
  return {
    bars: found.sort((a, b) => a.x - b.x),
    strokeWidth: Number(path[1]),
  };
}

/** The bars as USPS letters: Full, Ascender, Descender, Tracker. */
function barLetters(svg: string): string {
  const { bars: found } = bars(svg);
  const top = Math.min(...found.map((bar) => bar.top));
  const bottom = Math.max(...found.map((bar) => bar.bottom));
  return found
    .map((bar) => {
      if (bar.top === top) return bar.bottom === bottom ? "F" : "A";
      return bar.bottom === bottom ? "D" : "T";
    })
    .join("");
}

const plain = (scale: number): BarcodeStyle => ({
  ...defaultBarcodeStyle(ID),
  showText: false,
  scale,
});

describe("USPS Intelligent Mail bars", () => {
  it.each(SPEC_EXAMPLES)(
    "%s draws USPS-B-3200's 65 bars, in both builds",
    (payload, expected) => {
      expect(expected).toHaveLength(65);
      const checked = validateBarcodeInput(ID, payload);
      if (!checked.ok) throw new Error(checked.error);
      for (const scale of [2, 4, 10]) {
        const browser = renderBarcodeSVG(ID, checked.value, plain(scale));
        const server = renderBarcodeServer(ID, checked.value, plain(scale));
        expect(barLetters(browser.svg), `scale ${scale}`).toBe(expected);
        expect(server.svg).toBe(browser.svg);
      }
    },
  );

  it("draws the same bars from the digits typed with spaces and hyphens", () => {
    const checked = validateBarcodeInput(
      ID,
      "01 234 567094 987654321 01234-5678-91",
    );
    if (!checked.ok) throw new Error(checked.error);
    expect(barLetters(renderBarcodeSVG(ID, checked.value, plain(4)).svg)).toBe(
      SPEC_EXAMPLES[3][1],
    );
  });
});

describe("USPS Intelligent Mail sizes (USPS-B-3200 2.3)", () => {
  const value = SPEC_EXAMPLES[3][0];

  // Every scale the generator and the API allow for it: 2 to 10.
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "keeps every bar within the specification at scale %i",
    (scale) => {
      const rendered = renderBarcodeSVG(ID, value, plain(scale));
      const { bars: found, strokeWidth } = bars(rendered.svg);
      const inches = (pixels: number) => pixels / scale / POINTS_PER_INCH;
      const top = Math.min(...found.map((bar) => bar.top));
      const bottom = Math.max(...found.map((bar) => bar.bottom));
      const full = found.filter(
        (bar) => bar.top === top && bar.bottom === bottom,
      );
      const half = found.filter(
        (bar) => (bar.top === top) !== (bar.bottom === bottom),
      );
      const trackers = found.filter(
        (bar) => bar.top > top && bar.bottom < bottom,
      );
      expect(found).toHaveLength(65);

      // Bar width 0.020 ± 0.005 in.
      expect(inches(strokeWidth)).toBeGreaterThanOrEqual(0.015);
      expect(inches(strokeWidth)).toBeLessThanOrEqual(0.025);
      // Full bars 0.125 to 0.165 in, ascenders and descenders 0.082 to
      // 0.111 in, trackers 0.039 to 0.057 in.
      for (const bar of full) {
        expect(inches(bar.bottom - bar.top)).toBeGreaterThanOrEqual(0.125);
        expect(inches(bar.bottom - bar.top)).toBeLessThanOrEqual(0.165);
      }
      for (const bar of half) {
        expect(inches(bar.bottom - bar.top)).toBeGreaterThanOrEqual(0.082);
        expect(inches(bar.bottom - bar.top)).toBeLessThanOrEqual(0.111);
      }
      for (const bar of trackers) {
        expect(inches(bar.bottom - bar.top)).toBeGreaterThanOrEqual(0.039);
        expect(inches(bar.bottom - bar.top)).toBeLessThanOrEqual(0.057);
      }
      // Pitch 20 to 24 bars per inch, spaces 0.012 to 0.040 in.
      for (let i = 1; i < found.length; i++) {
        const pitch = inches((found[i] as Bar).x - (found[i - 1] as Bar).x);
        expect(pitch).toBeGreaterThanOrEqual(1 / 24);
        expect(pitch).toBeLessThanOrEqual(1 / 20);
        expect(pitch - inches(strokeWidth)).toBeGreaterThanOrEqual(0.012);
        expect(pitch - inches(strokeWidth)).toBeLessThanOrEqual(0.04);
      }
      // First bar's lead edge to the last's: at least 2.667 in; to its
      // trailing edge: at most 3.225 in.
      const first = found[0] as Bar;
      const last = found[64] as Bar;
      expect(inches(last.x - first.x)).toBeGreaterThanOrEqual(2.667);
      expect(inches(last.x - first.x + strokeWidth)).toBeLessThanOrEqual(3.225);
      // Clear zone: 0.125 in each end at the default quiet zone, 0.028 in
      // above and below.
      expect(inches(first.x - strokeWidth / 2)).toBeGreaterThanOrEqual(0.125);
      expect(
        inches(rendered.width - (last.x + strokeWidth / 2)),
      ).toBeGreaterThanOrEqual(0.125);
      expect(inches(top)).toBeGreaterThanOrEqual(0.028);
      expect(inches(rendered.height - bottom)).toBeGreaterThanOrEqual(0.028);
    },
  );

  it("prints the digits 0.028 to 0.5 in under the bars, from the first bar (2.4)", () => {
    for (const scale of [2, 3, 4, 5, 10]) {
      const rendered = renderBarcodeSVG(ID, value, {
        ...plain(scale),
        showText: true,
      });
      const drawn = bars(rendered.svg);
      const bottom = Math.max(...drawn.bars.map((bar) => bar.bottom));
      // The digits are filled glyph paths after the bars.
      const glyphs = [
        ...rendered.svg.matchAll(/<path (?!stroke)[^>]*d="([^"]+)"/g),
      ];
      expect(glyphs.length).toBeGreaterThan(0);
      const points = glyphs.flatMap((glyph) =>
        [...(glyph[1] as string).matchAll(/-?[\d.]+/g)].map((match) =>
          Number(match[0]),
        ),
      );
      const xs = points.filter((_, index) => index % 2 === 0);
      const ys = points.filter((_, index) => index % 2 === 1);
      const gap = (Math.min(...ys) - bottom) / scale / POINTS_PER_INCH;
      expect(gap, `scale ${scale}`).toBeGreaterThanOrEqual(0.028);
      expect(gap, `scale ${scale}`).toBeLessThanOrEqual(0.5);
      // The first digit starts at the first bar's left edge (within a point).
      const firstBar = (drawn.bars[0] as Bar).x - drawn.strokeWidth / 2;
      expect(
        Math.abs(Math.min(...xs) - firstBar) / scale,
        `scale ${scale}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("is drawn at its fixed height whatever bar height the style asks for", () => {
    const short = renderBarcodeSVG(ID, value, { ...plain(4), barHeightMm: 5 });
    const tall = renderBarcodeSVG(ID, value, { ...plain(4), barHeightMm: 60 });
    expect(tall.svg).toBe(short.svg);
  });

  it("measures its quiet zone in bar widths: 7 is at least USPS's 0.125 in", () => {
    expect(MODULE_UNITS[ID]).toBe(1.44);
    expect(defaultBarcodeStyle(ID).quietZone).toBe(7);
    expect((7 * MODULE_UNITS[ID]) / POINTS_PER_INCH).toBeGreaterThanOrEqual(
      0.125,
    );
    expect((6 * MODULE_UNITS[ID]) / POINTS_PER_INCH).toBeLessThan(0.125);
  });

  it("refuses scale 1, where whole pixels make the bars too wide", () => {
    expect(minScale(ID)).toBe(2);
    expect(minScale("ean13")).toBe(1);
    const { bars: found, strokeWidth } = bars(
      renderBarcodeSVG(ID, value, plain(1)).svg,
    );
    expect(found).toHaveLength(65);
    expect(strokeWidth / POINTS_PER_INCH).toBeGreaterThan(0.025);
    expect(resolveBarcodeStyle(ID, { scale: 1 })).toEqual({
      ok: false,
      field: "scale",
      message: "USPS Intelligent Mail takes a scale of 2 to 10",
    });
    expect(resolveBarcodeStyle(ID, { scale: 2 }).ok).toBe(true);
    expect(resolveBarcodeStyle("ean13", { scale: 1 }).ok).toBe(true);
  });
});
