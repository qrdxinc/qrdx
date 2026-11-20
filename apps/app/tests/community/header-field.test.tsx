// @vitest-environment jsdom
// The community header's ASCII field (components/community/header-field.ts
// and header-field-art.tsx): a real QR code for the community's address,
// drawn in glyphs the same way every time for a given code and size, hidden
// from screen readers, and still with reduced motion, off screen or in a
// hidden tab. When it moves, it re-rolls a few glyphs at a time and never
// changes the field's shape.
import { getQRModuleCount, scanQRPixels } from "qrdx";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIELD_COLS,
  FIELD_ROWS,
  fieldRows,
  fieldSize,
  qrModules,
} from "@/components/community/header-field";
import { HeaderFieldArt } from "@/components/community/header-field-art";
import { RAMP } from "@/components/fx/glyphs";

const URL = "https://qrdx.dev/community";

/** The modules as RGBA pixels, 8 px a module with a 4-module margin. */
function pixelsOf(modules: boolean[][]) {
  const scale = 8;
  const margin = 4;
  const size = (modules.length + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + margin) * scale + dx;
          const py = (y + margin) * scale + dy;
          const i = (py * size + px) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    });
  });
  return { data, width: size, height: size };
}

describe("the code", () => {
  it("is a real QR code for the address it's given", async () => {
    const modules = await qrModules(URL);
    expect(modules.length).toBe(
      getQRModuleCount({ value: URL, level: "L", margin: 0 }),
    );
    const scan = await scanQRPixels(pixelsOf(modules), URL);
    expect(scan.data).toBe(URL);
  });
});

describe("the field's rows", () => {
  it("are the same every time for the same code and size", async () => {
    const modules = await qrModules(URL);
    expect(fieldRows(modules)).toEqual(fieldRows(modules));
    expect(fieldRows(modules, { cols: 140, rows: 40 })).toEqual(
      fieldRows(modules, { cols: 140, rows: 40 }),
    );
  });

  it("change with the code", async () => {
    const a = fieldRows(await qrModules(URL));
    const b = fieldRows(await qrModules("https://example.com/community"));
    expect(a).not.toEqual(b);
  });

  it("fill the size, in the ramp's glyphs only", async () => {
    const rows = fieldRows(await qrModules(URL));
    expect(rows).toHaveLength(FIELD_ROWS);
    for (const row of rows) {
      expect(row).toHaveLength(FIELD_COLS);
      expect([...row].every((glyph) => RAMP.includes(glyph))).toBe(true);
    }
    // A longer address makes a bigger code, and a field big enough for it.
    const big = await qrModules(`${URL}/${"x".repeat(120)}`);
    const size = fieldSize(big.length);
    expect(size.rows).toBeGreaterThan(big.length);
    expect(fieldRows(big)).toHaveLength(size.rows);
  });

  it("draw dark modules dense and light ones faint at the code's heart", async () => {
    const modules = await qrModules(URL);
    const rows = fieldRows(modules);
    const n = modules.length;
    const span = n + 4;
    // Where fieldRows puts the code: 8 columns from the right, centred.
    const left = FIELD_COLS - 8 - span * 2;
    const top = Math.floor((FIELD_ROWS - span) / 2);
    const level = (glyph: string | undefined) => RAMP.indexOf(glyph ?? " ");
    let dark = 0;
    let light = 0;
    // The finder pattern's centre (dark) and its inner ring (light), top left.
    for (const [x, y, wantDark] of [
      [3, 3, true],
      [2, 2, true],
      [1, 3, false],
      [3, 5, false],
    ] as const) {
      const row = rows[top + 2 + y];
      const col = left + (2 + x) * 2;
      const glyph = level(row?.[col]);
      if (wantDark) {
        expect(glyph).toBeGreaterThanOrEqual(7);
        dark++;
      } else {
        expect(glyph).toBeLessThanOrEqual(2);
        light++;
      }
    }
    expect(dark + light).toBe(4);
  });
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("the drawn field", () => {
  let rows: string[];
  let container: HTMLDivElement;
  let root: Root;
  let reduced: boolean;
  let visible: (on: boolean) => void;

  beforeEach(async () => {
    rows = fieldRows(await qrModules(URL));
    reduced = false;
    // The wave's position comes from performance.now(): fake it too.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
    });
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce") ? reduced : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        visible = (on) =>
          callback(
            [{ isIntersecting: on } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const shown = () =>
    [...(container.querySelector("pre")?.children ?? [])].map(
      (line) => line.textContent ?? "",
    );

  it("is in the server's HTML, hidden from screen readers", () => {
    const html = renderToStaticMarkup(<HeaderFieldArt rows={rows} />);
    expect(html.startsWith('<pre aria-hidden="true"')).toBe(true);
    for (const row of rows.slice(0, 3)) expect(html).toContain(row);
  });

  it("stays still with reduced motion", () => {
    reduced = true;
    act(() => root.render(<HeaderFieldArt rows={rows} />));
    act(() => visible(true));
    act(() => vi.advanceTimersByTime(10_000));
    expect(shown()).toEqual(rows);
  });

  it("stays still off screen", () => {
    act(() => root.render(<HeaderFieldArt rows={rows} />));
    act(() => visible(false));
    act(() => vi.advanceTimersByTime(10_000));
    expect(shown()).toEqual(rows);
  });

  it("stays still in a hidden tab", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => root.render(<HeaderFieldArt rows={rows} />));
    act(() => visible(true));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(10_000);
    });
    expect(shown()).toEqual(rows);
    hidden.mockRestore();
  });

  it("re-rolls a few glyphs at a time on screen, keeping the field's shape", () => {
    // A fixed sequence (a small LCG), so the wave picks the same cells
    // every run.
    let seed = 7;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      return seed / 2 ** 32;
    });
    act(() => root.render(<HeaderFieldArt rows={rows} />));
    act(() => visible(true));
    let changedAtOnce = 0;
    let everChanged = false;
    for (let step = 0; step < 80; step++) {
      act(() => vi.advanceTimersByTime(125));
      const now = shown();
      let changed = 0;
      now.forEach((line, row) => {
        const base = rows[row] ?? "";
        expect(line).toHaveLength(base.length);
        for (let col = 0; col < line.length; col++) {
          if (line[col] === base[col]) continue;
          changed++;
          // Blank cells stay blank; glyphs stay glyphs of the ramp.
          expect(base[col]).not.toBe(" ");
          expect(RAMP.includes(line[col] ?? "")).toBe(true);
        }
      });
      changedAtOnce = Math.max(changedAtOnce, changed);
      everChanged ||= changed > 0;
    }
    expect(everChanged).toBe(true);
    // Three new glyphs an update, each back within 1.4 s: at most 36 at once.
    expect(changedAtOnce).toBeLessThanOrEqual(36);
    // Off screen again: it stops, and nothing changes until it's back.
    act(() => visible(false));
    act(() => vi.advanceTimersByTime(2000));
    const settled = shown();
    act(() => vi.advanceTimersByTime(2000));
    expect(shown()).toEqual(settled);
  });
});
