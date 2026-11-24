// A theme's swatch: the whole code is drawn, and a transform crops it to a
// close-up (one whole eye, short of the next) that fills its box; hovered,
// one transition carries it back to the whole code, between the type's
// label and the chips, on its own background.

import { QRCode } from "qrdx";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SWATCH_CODE,
  SWATCH_ROOM,
  SWATCH_UNITS,
  SwatchCrop,
  swatchPulledBack,
  swatchTransforms,
} from "@/components/community/type-previews";

/** A transform's translate (percent of the element) and scale. */
const parse = (transform: unknown) => {
  const match = String(transform).match(
    /^translate\(([-\d.]+)%, ([-\d.]+)%\) scale\(([\d.]+)\)$/,
  );
  if (!match) throw new Error(`not a swatch transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
};

describe("SwatchCrop", () => {
  it("is cut from a 25-module code: one whole eye, short of the next", () => {
    const html = renderToStaticMarkup(
      <QRCode
        cornerEyePattern="square"
        hideLogo
        level={SWATCH_CODE.level}
        margin={SWATCH_CODE.margin}
        partMarkers
        size={SWATCH_CODE.size}
        value={SWATCH_CODE.value}
      />,
    );
    const eyeStart = (eye: string) =>
      html.match(
        new RegExp(`data-qrdx-eye="${eye}"><path d="M ([\\d.]+) ([\\d.]+)`),
      );
    // 10 units a module: the eye spans 10–80, the next eye starts at 190
    expect(eyeStart("top-left")?.slice(1)).toEqual(["10", "10"]);
    expect(eyeStart("top-right")?.slice(1)).toEqual(["190", "10"]);
    // At rest a box shows SWATCH_UNITS across, from a little before the
    // corner: the whole first eye, and not the next one.
    const { x } = parse(swatchTransforms()["--swatch-rest" as never]);
    const side = SWATCH_CODE.size / SWATCH_UNITS;
    const start = -(x / 100) * side * SWATCH_UNITS;
    expect(start).toBeLessThan(10);
    expect(start + SWATCH_UNITS).toBeGreaterThan(80);
    expect(start + SWATCH_UNITS).toBeLessThan(190);
  });

  it("draws the whole code in the theme's colors, without its frame", () => {
    const html = renderToStaticMarkup(
      <SwatchCrop
        style={{
          fgColor: "#1d4ed8",
          bgColor: "#eff6ff",
          frame: { style: "banner-bottom", text: "Scan me" },
        }}
      />,
    );
    const root = html.match(/<div[^>]*>/)?.[0] ?? "";
    expect(root).toContain("width:150%");
    expect(root).toContain("--swatch-rest");
    const svg = html.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(svg).toContain(
      `viewBox="0 0 ${SWATCH_CODE.size} ${SWATCH_CODE.size}"`,
    );
    expect(html).toContain("#1d4ed8");
    expect(html).toContain("#eff6ff");
    expect(html).not.toContain("data-qrdx-frame");
    expect(html).not.toContain("svgQrWrapper");
  });

  it("pulls back to the whole code between the label and the chips", () => {
    // Each box size a swatch has: cards in rows and grids, from the
    // narrowest phone to a wide ranked row, then kits' tiles and
    // collections' pieces.
    const boxes = [
      { width: 205, height: 154, compact: false },
      { width: 252, height: 189, compact: false },
      { width: 298, height: 224, compact: false },
      { width: 105, height: 105, compact: true },
      { width: 95, height: 95, compact: true },
    ];
    for (const { width, height, compact } of boxes) {
      const { x, y, scale } = swatchPulledBack(compact);
      const element = (SWATCH_CODE.size / SWATCH_UNITS) * width;
      const side = element * cssValue(scale, width, height);
      // The modules, inside the code's one-module margin
      const margin = side / 27;
      const left = cssValue(x, width, height) + margin;
      const top = cssValue(y, width, height) + margin;
      const modules = side - 2 * margin;
      const room = SWATCH_ROOM[compact ? "compact" : "card"];
      expect(top).toBeCloseTo(room.top, 5);
      expect(top + modules).toBeCloseTo(height - room.bottom, 5);
      expect(left + modules / 2).toBeCloseTo(width / 2, 5);
      expect(left).toBeGreaterThan(0);
    }
    // In the transform the card's hover plays, after the close-up
    const vars = swatchTransforms(true);
    expect(vars["--swatch-full" as never]).toBe(
      `translate(${swatchPulledBack(true).x}, ${swatchPulledBack(true).y}) scale(${swatchPulledBack(true).scale})`,
    );
  });
});

/**
 * A CSS length or number expression's value in px for a size container of
 * `width` × `height`: calc() as parentheses, container units and px as
 * numbers, tan(atan2()) as itself.
 */
function cssValue(expression: string, width: number, height: number) {
  const js = expression
    .replaceAll("calc(", "(")
    .replace(/([\d.]+)cqw/g, `($1 * ${width} / 100)`)
    .replace(/([\d.]+)cqh/g, `($1 * ${height} / 100)`)
    .replace(/([\d.]+)px/g, "$1");
  return new Function("tan", "atan2", `return ${js};`)(
    Math.tan,
    Math.atan2,
  ) as number;
}
