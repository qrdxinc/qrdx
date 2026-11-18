// @vitest-environment jsdom
// The QRdx loaders (packages/design-system/components/loaders): each one is
// a decorative SVG beside a visually hidden role="status" label, drawn at the
// board's sizes, shown only after a delay, and still at full opacity with
// reduced motion. Plus the toaster that uses Module orbit for loading toasts,
// and the app's BrandLoader, which shows Jack-o'-scan instead of Scanframe
// during Halloween.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AssemblingCode,
  DEFAULT_LOADER_LABEL,
  FinderTrace,
  JackOScan,
  LOADER_DELAY,
  type LoaderProps,
  type LoaderSize,
  ModuleOrbit,
  ModuleWave,
  Scanframe,
  ScanLine,
  ShapeMorph,
} from "@repo/design-system/components/loaders";
import { Toaster } from "@repo/design-system/components/toaster";
import type { ComponentType, ReactElement } from "react";
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  it as test,
  vi,
} from "vitest";
import { BrandLoader } from "@/components/brand-loader";
import { HALLOWEEN_PUMPKIN } from "@/components/seasonal/halloween-presets";
import { HALLOWEEN_HIDDEN_KEY } from "@/components/seasonal/use-halloween";
import { SEASON_OVERRIDE_STORAGE_KEY } from "@/lib/seasonal";

const APP = join(import.meta.dirname, "../..");
const DESIGN_SYSTEM = join(APP, "../../packages/design-system");

// Name, component, default size, and how many modules use the brand accent
// (Jack-o'-scan is pumpkin orange instead).
const LOADERS: [string, ComponentType<LoaderProps>, LoaderSize, 0 | 1][] = [
  ["Scanframe", Scanframe, 40, 1],
  ["ModuleOrbit", ModuleOrbit, 16, 1],
  ["AssemblingCode", AssemblingCode, 40, 1],
  ["ModuleWave", ModuleWave, 16, 1],
  ["FinderTrace", FinderTrace, 24, 1],
  ["ScanLine", ScanLine, 40, 1],
  ["ShapeMorph", ShapeMorph, 24, 1],
  ["JackOScan", JackOScan, 40, 0],
];

/** Scanframe's four corner brackets, which Scan line and Jack-o'-scan share. */
const BRACKETS = [
  "M4 16V10a6 6 0 0 1 6-6h6",
  "M32 4h6a6 6 0 0 1 6 6v6",
  "M44 32v6a6 6 0 0 1-6 6h-6",
  "M16 44h-6a6 6 0 0 1-6-6v-6",
];

const CSS = readFileSync(
  join(DESIGN_SYSTEM, "components/loaders/loaders.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("no svg");
  return { host, svg, status: host.querySelector('[role="status"]') };
}

describe.each(LOADERS)("%s", (_name, Loader, defaultSize, accentCount) => {
  test("announces a visually hidden Loading… status", () => {
    const { status, svg } = render(<Loader />);
    expect(status?.textContent).toBe(DEFAULT_LOADER_LABEL);
    expect(status?.className).toBe("sr-only");
    expect(status?.tagName).toBe("SPAN");
    // The drawing itself is decorative.
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
  });

  test("takes a translated label", () => {
    const { status } = render(<Loader label="Cargando…" />);
    expect(status?.textContent).toBe("Cargando…");
  });

  test("leaves the status out when the loader is decorative", () => {
    const { host, status, svg } = render(<Loader aria-hidden />);
    expect(status).toBeNull();
    expect(host.textContent).toBe("");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  test(`is ${defaultSize} px unless told otherwise`, () => {
    const { svg } = render(<Loader />);
    expect(svg.getAttribute("width")).toBe(String(defaultSize));
    expect(svg.getAttribute("height")).toBe(String(defaultSize));
  });

  test.each([16, 24, 40, 64] as const)("draws at %i px", (size) => {
    const { svg } = render(<Loader size={size} />);
    expect(svg.getAttribute("width")).toBe(String(size));
    expect(svg.getAttribute("height")).toBe(String(size));
    // A square viewBox, so every size keeps the mark's proportions.
    const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(" ");
    expect(w).toBe(h);
  });

  test("keeps a size class and other classes from the caller", () => {
    const { svg } = render(
      <Loader className="size-3.5 text-muted-foreground" />,
    );
    expect(svg.getAttribute("class")).toContain("size-3.5");
    expect(svg.getAttribute("class")).toContain("text-muted-foreground");
    expect(svg.getAttribute("class")).toMatch(/loader/);
  });

  test(`shows after ${LOADER_DELAY} ms, or the delay it's given`, () => {
    expect(render(<Loader />).svg.getAttribute("style")).toContain(
      `--loader-delay:${LOADER_DELAY}ms`,
    );
    expect(render(<Loader delay={0} />).svg.getAttribute("style")).toContain(
      "--loader-delay:0ms",
    );
  });

  test(`draws in currentColor with ${accentCount ? "exactly one accent module" : "no brand accent"}`, () => {
    const { svg } = render(<Loader />);
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    const accents = [...svg.querySelectorAll("rect")].filter((rect) =>
      /accent/.test(rect.getAttribute("class") ?? ""),
    );
    expect(accents).toHaveLength(accentCount);
    expect(svg.querySelectorAll('[class*="accent"]')).toHaveLength(accentCount);
  });
});

describe("the marks", () => {
  it("Scanframe is four brackets and the X's five modules", () => {
    const { svg } = render(<Scanframe />);
    expect(svg.querySelectorAll("path")).toHaveLength(4);
    expect(svg.querySelectorAll("rect")).toHaveLength(5);
  });

  it("Module orbit circles five modules round a still centre", () => {
    const { svg } = render(<ModuleOrbit />);
    const ring = svg.querySelector("g");
    expect(ring?.getAttribute("class")).toMatch(/orbit/);
    expect(ring?.querySelectorAll("rect")).toHaveLength(5);
    // The accent centre sits outside the turning ring.
    expect(ring?.querySelector('[class*="accent"]')).toBeNull();
  });

  it("Module wave is a 3×3 patch that waves along its diagonals", () => {
    const { svg } = render(<ModuleWave />);
    const modules = [...svg.querySelectorAll("rect")].map((rect) => ({
      column: (Number(rect.getAttribute("x")) - 5) / 14,
      row: (Number(rect.getAttribute("y")) - 5) / 14,
      delay: Number.parseFloat(rect.style.animationDelay),
      accent: /accent/.test(rect.getAttribute("class") ?? ""),
    }));
    expect(modules).toHaveLength(9);
    expect(
      new Set(modules.map(({ column, row }) => `${column},${row}`)).size,
    ).toBe(9);
    for (const { column, row, delay, accent } of modules) {
      expect([0, 1, 2]).toContain(column);
      expect([0, 1, 2]).toContain(row);
      // One delay per diagonal, later the further down and right it is.
      expect(delay).toBeCloseTo((column + row) * 0.12);
      expect(accent).toBe(column === 1 && row === 1);
    }
  });

  it("Finder trace is a finder eye: a 7-module ring round a 3×3 accent centre", () => {
    const { svg } = render(<FinderTrace />);
    const ring = svg.querySelector("path");
    expect(ring?.getAttribute("class")).toMatch(/ring/);
    // The dash maths runs in a path length of 100 at every size.
    expect(ring?.getAttribute("pathLength")).toBe("100");
    const centre = svg.querySelector("rect");
    expect(centre?.getAttribute("class")).toMatch(/accent/);
    expect(centre?.getAttribute("width")).toBe("18");
    expect(centre?.getAttribute("x")).toBe("15");
    // A 6-unit module grid: the ring runs 3–45 with its stroke (7 modules),
    // a module of space, then the 3-module centre at 15–33.
    expect(CSS).toMatch(/\.qrdx-loader-ring\s*\{[^}]*stroke-width:\s*6;/);
    expect(ring?.getAttribute("d")).toMatch(/^M24 6h12/);
  });

  it("Scan line is Scanframe's brackets, two rows of modules and the accent line", () => {
    const { svg } = render(<ScanLine />);
    expect(
      [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d")),
    ).toEqual(BRACKETS);
    const rects = [...svg.querySelectorAll("rect")];
    const line = rects.filter((rect) =>
      /accent/.test(rect.getAttribute("class") ?? ""),
    );
    expect(line).toHaveLength(1);
    expect(line[0]?.getAttribute("class")).toMatch(/sweep/);
    const modules = rects.filter((rect) => !line.includes(rect));
    expect(modules).toHaveLength(6);
    // The line rests between the rows when nothing moves.
    const lineTop = Number(line[0]?.getAttribute("y"));
    for (const module of modules) {
      const y = Number(module.getAttribute("y"));
      expect(y + 6 <= lineTop || y >= lineTop + 2).toBe(true);
    }
  });

  it("Scan line's rows blink when the line crosses them", () => {
    // The sweep: its easing and how far it travels each way.
    const [x1, y1, x2, y2] = (
      /\.qrdx-loader-sweep\s*\{[^}]*cubic-bezier\(([^)]*)\)/.exec(CSS)?.[1] ??
      ""
    )
      .split(",")
      .map(Number);
    const travel = Number(
      /qrdx-loader-sweep\s*\{\s*from\s*\{\s*transform:\s*translateY\((-?[\d.]+)px\)/.exec(
        CSS,
      )?.[1],
    );
    const peak = Number(
      /qrdx-loader-blink\s*\{[^@]*?([\d.]+)%\s*\{\s*opacity:\s*1;/.exec(
        CSS,
      )?.[1],
    );
    const bezier = (t: number, a: number, b: number) =>
      3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    /** The share of a sweep at which the eased line reaches `progress`. */
    const timeAt = (progress: number) => {
      let low = 0;
      let high = 1;
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        if (bezier(mid, y1 ?? 0, y2 ?? 1) < progress) low = mid;
        else high = mid;
      }
      return bezier(low, x1 ?? 0, x2 ?? 1);
    };
    const { svg } = render(<ScanLine />);
    const line = svg.querySelector('[class*="sweep"]');
    const lineCentre =
      Number(line?.getAttribute("y")) +
      Number(line?.getAttribute("height")) / 2;
    const topRow = [...svg.querySelectorAll('[class*="blink"]')].filter(
      (module) => !module.getAttribute("style"),
    );
    const topCentre = Number(topRow[0]?.getAttribute("y")) + 3;
    const crossing = timeAt(
      (topCentre - (lineCentre + travel)) / (-2 * travel),
    );
    expect(Math.abs(crossing * 100 - peak)).toBeLessThan(1.5);
    // The bottom row mirrors it: its blink runs one sweep (0.8 s) ahead.
    const bottomRow = [...svg.querySelectorAll('[class*="blink"]')].filter(
      (module) => module.getAttribute("style"),
    );
    expect(bottomRow).toHaveLength(3);
    for (const module of bottomRow) {
      expect(Number(module.getAttribute("y")) + 3 - lineCentre).toBeCloseTo(
        lineCentre - topCentre,
      );
      expect((module as SVGElement).style.animationDelay).toBe("-0.8s");
    }
  });

  it("Shape morph is one accent module that morphs through the body patterns", () => {
    const { svg } = render(<ShapeMorph />);
    const rects = svg.querySelectorAll("rect");
    expect(rects).toHaveLength(1);
    expect(rects[0]?.getAttribute("class")).toMatch(/accent/);
    expect(rects[0]?.getAttribute("class")).toMatch(/morph/);
    // Still, it's the rounded module (the attribute); moving, CSS animates
    // the radius from square to dot and turns it into the diamond.
    expect(rects[0]?.getAttribute("rx")).toBe("6");
    const morph = /@keyframes qrdx-loader-morph\s*\{([\s\S]*?)\n {2}\}/.exec(
      CSS,
    )?.[1];
    expect(morph).toMatch(/rx:\s*1px/);
    expect(morph).toMatch(/rx:\s*11px/);
    expect(morph).toMatch(/rotate\(45deg\)/);
  });

  it("Jack-o'-scan is Scanframe's brackets round a flickering face, in pumpkin orange", () => {
    const { svg } = render(<JackOScan />);
    const pumpkin = svg.querySelector('[class*="pumpkin"]');
    expect(pumpkin).not.toBeNull();
    const paths = [...(pumpkin?.querySelectorAll("path") ?? [])];
    expect(paths.slice(0, 4).map((path) => path.getAttribute("d"))).toEqual(
      BRACKETS,
    );
    // The brackets breathe as Scanframe's do.
    expect(paths.slice(0, 4).map((path) => path.getAttribute("class"))).toEqual(
      [...render(<Scanframe />).svg.querySelectorAll("path")].map((path) =>
        path.getAttribute("class"),
      ),
    );
    const face = paths.slice(4);
    expect(face).toHaveLength(2);
    for (const feature of face) {
      expect(feature.getAttribute("class")).toMatch(/flicker/);
    }
    // The design system can't import the app's Halloween colour, so it keeps
    // its own copy: they must match.
    expect(CSS).toMatch(
      new RegExp(`\\.qrdx-loader-pumpkin\\s*\\{[^}]*${HALLOWEEN_PUMPKIN}`, "i"),
    );
  });

  it("Assembling code is a 7×7 mini code with three finder eyes", () => {
    const { svg } = render(<AssemblingCode />);
    const cells = [...svg.querySelectorAll("rect")].map(
      (rect) =>
        `${(Number(rect.getAttribute("x")) - 1) / 7},${(Number(rect.getAttribute("y")) - 1) / 7}`,
    );
    expect(new Set(cells).size).toBe(cells.length);
    for (const [left, top] of [
      [0, 0],
      [4, 0],
      [0, 4],
    ]) {
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          expect(cells).toContain(`${left + column},${top + row}`);
        }
      }
    }
    for (const cell of cells) {
      const [column, row] = cell.split(",").map(Number);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(7);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(7);
    }
  });
});

describe("reduced motion", () => {
  const css = CSS;

  /** The text of each `<prelude> { … }` block, matched brace by brace. */
  function blocks(source: string, prelude: RegExp) {
    const found: { start: number; end: number; body: string }[] = [];
    for (const match of source.matchAll(prelude)) {
      const open = source.indexOf("{", match.index);
      let depth = 0;
      for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") depth--;
        if (depth === 0) {
          found.push({
            start: match.index,
            end: i + 1,
            body: source.slice(open + 1, i),
          });
          break;
        }
      }
    }
    return found;
  }

  function without(source: string, ranges: { start: number; end: number }[]) {
    let out = source;
    for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, range.start) + out.slice(range.end);
    }
    return out;
  }

  const motion = blocks(
    css,
    /@media \(prefers-reduced-motion: no-preference\)/g,
  );
  const keyframes = blocks(css, /@keyframes [\w-]+/g);
  const always = without(css, [...motion, ...keyframes]);

  it("moves the marks only when motion is allowed", () => {
    expect(motion).toHaveLength(1);
    const body = motion[0]?.body ?? "";
    for (const name of [
      "breathe-top-left",
      "module-pop",
      "orbit",
      "build",
      "wave",
      "trace",
      "pulse",
      "sweep",
      "blink",
      "morph",
      "flicker",
    ]) {
      expect(body).toContain(name);
    }
  });

  it("otherwise holds the static mark at full opacity", () => {
    // No mark animation, no fade, no dimmed tail, no transform and no dash
    // outside the no-preference block: everything shows at full opacity,
    // and Finder trace's ring is drawn whole.
    expect(always).not.toMatch(/animation:/);
    expect(always).not.toMatch(/opacity/);
    expect(always).not.toMatch(/transform:/);
    expect(always).not.toMatch(/stroke-dash/);
    expect(always).toMatch(/animation-duration:\s*0s/);
    expect(motion[0]?.body).toMatch(/\.qrdx-loader-tail-\d\s*\{\s*opacity/);
  });

  it("still waits for the delay, appearing without a fade", () => {
    expect(always).toMatch(/animation-name:\s*qrdx-loader-in/);
    expect(always).toMatch(/animation-delay:\s*var\(--loader-delay/);
    expect(always).toMatch(/animation-fill-mode:\s*both/);
  });
});

describe("the stylesheet", () => {
  it("ships in the design system's globals, which every app imports", () => {
    const globals = readFileSync(
      join(DESIGN_SYSTEM, "styles/globals.css"),
      "utf8",
    );
    expect(globals).toContain('@import "../components/loaders/loaders.css";');
  });

  it("prefixes every class and keyframe, since the sheet is global", () => {
    for (const [, name] of CSS.matchAll(/\.([a-z][\w-]*)/g)) {
      expect(name).toMatch(/^qrdx-loader/);
    }
    for (const [, name] of CSS.matchAll(/@keyframes ([\w-]+)/g)) {
      expect(name).toMatch(/^qrdx-loader-/);
    }
  });

  it("names a keyframe for every animation it runs", () => {
    const defined = new Set(
      [...CSS.matchAll(/@keyframes ([\w-]+)/g)].map(([, name]) => name),
    );
    const used = [
      ...CSS.matchAll(/animation(?:-name)?:\s*(qrdx-loader-[\w-]+)/g),
    ].map(([, name]) => name);
    expect(used.length).toBeGreaterThan(10);
    for (const name of used) expect(defined).toContain(name);
  });
});

describe("the toaster", () => {
  it("shows Module orbit on loading toasts and keeps the other icons", () => {
    const element = Toaster({}) as ReactElement<{
      icons: Record<string, ReactElement>;
    }>;
    const { icons } = element.props;
    expect(icons.loading?.type).toBe(ModuleOrbit);
    expect(Object.keys(icons).sort()).toEqual(
      ["error", "info", "loading", "success", "warning"].sort(),
    );
  });
});

describe("the seasonal swap", () => {
  // BrandLoader follows lib/seasonal.ts (Halloween is 20 Oct – 2 Nov UTC,
  // `?season=` previews it or turns it off) and the visitor's "Hide
  // Halloween" choice, as the season's characters do.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const HALLOWEEN = new Date("2026-10-28T12:00:00Z");
  const NOVEMBER = new Date("2026-11-18T12:00:00Z");

  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
    window.history.replaceState(null, "", "/");
    window.sessionStorage.removeItem(SEASON_OVERRIDE_STORAGE_KEY);
    window.localStorage.removeItem(HALLOWEEN_HIDDEN_KEY);
  });

  /** Which loader BrandLoader shows on the client, on `date` at `url`. */
  async function shown(date: Date, url = "/") {
    vi.setSystemTime(date);
    window.history.replaceState(null, "", url);
    const root = createRoot(host);
    await act(async () => root.render(<BrandLoader label="Loading…" />));
    const pumpkin = host.querySelector('[class*="pumpkin"]') !== null;
    const status = host.querySelector('[role="status"]')?.textContent;
    act(() => root.unmount());
    expect(status).toBe("Loading…");
    return pumpkin ? "JackOScan" : "Scanframe";
  }

  it("shows Jack-o'-scan inside the Halloween window", async () => {
    expect(await shown(new Date("2026-10-20T00:00:00Z"))).toBe("JackOScan");
    expect(await shown(HALLOWEEN)).toBe("JackOScan");
    expect(await shown(new Date("2026-11-02T23:59:00Z"))).toBe("JackOScan");
  });

  it("shows Scanframe outside it", async () => {
    expect(await shown(new Date("2026-10-19T23:59:00Z"))).toBe("Scanframe");
    expect(await shown(new Date("2026-11-03T00:00:00Z"))).toBe("Scanframe");
    expect(await shown(NOVEMBER)).toBe("Scanframe");
    expect(await shown(new Date("2026-12-24T12:00:00Z"))).toBe("Scanframe");
  });

  it("follows ?season= previews", async () => {
    expect(await shown(HALLOWEEN, "/?season=off")).toBe("Scanframe");
    window.sessionStorage.removeItem(SEASON_OVERRIDE_STORAGE_KEY);
    expect(await shown(NOVEMBER, "/?season=halloween")).toBe("JackOScan");
    // The preview lasts for the tab, as the rest of the season layer's does.
    expect(await shown(NOVEMBER, "/")).toBe("JackOScan");
    window.sessionStorage.removeItem(SEASON_OVERRIDE_STORAGE_KEY);
    expect(await shown(HALLOWEEN, "/?season=christmas")).toBe("Scanframe");
  });

  it("stays Scanframe for a visitor who hid Halloween", async () => {
    window.localStorage.setItem(HALLOWEEN_HIDDEN_KEY, "1");
    expect(await shown(HALLOWEEN)).toBe("Scanframe");
  });

  it("renders Scanframe on the server and hydrates without a mismatch", async () => {
    vi.setSystemTime(HALLOWEEN);
    const html = renderToString(<BrandLoader />);
    expect(html).not.toContain("pumpkin");
    expect(html).toContain("qrdx-loader-pop");
    host.innerHTML = html;
    const errors: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(host, <BrandLoader />, {
        onRecoverableError: (error) => errors.push(error),
      }),
    );
    expect(errors).toEqual([]);
    // Then the client swaps it for the season's loader.
    expect(host.querySelector('[class*="pumpkin"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("is how the app shows Scanframe everywhere", () => {
    const skip = new Set(["node_modules", "tests", "e2e", ".next"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(entry.name) &&
          /\bScanframe\b/.test(readFileSync(full, "utf8"))
        ) {
          offenders.push(relative(APP, full));
        }
      }
    };
    walk(APP);
    expect(offenders).toEqual(["components/brand-loader.tsx"]);
  });
});
