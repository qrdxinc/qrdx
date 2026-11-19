// A theme's swatch: the whole code is drawn, and a transform crops it to a
// close-up (one whole eye, short of the next) that fills its box; hovered,
// one transition carries it back to the whole code, centred on its own
// background.

import { QRCode } from "qrdx";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SWATCH_CODE,
  SWATCH_UNITS,
  SwatchCrop,
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
    const { x } = parse(swatchTransforms(4 / 3)["--swatch-rest" as never]);
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
          templateId: "default",
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

  it("pulls back to the whole code, centred and inside its box", () => {
    for (const aspect of [4 / 3, 1]) {
      const vars = swatchTransforms(aspect);
      const rest = parse(vars["--swatch-rest" as never]);
      const full = parse(vars["--swatch-full" as never]);
      expect(rest.scale).toBe(1);
      // The element is SWATCH_CODE.size / SWATCH_UNITS box widths across
      const side = SWATCH_CODE.size / SWATCH_UNITS;
      const width = side * full.scale;
      const left = (full.x / 100) * side;
      const top = (full.y / 100) * side;
      const height = 1 / aspect;
      // Centred both ways, with room on every side
      expect(left + width / 2).toBeCloseTo(0.5, 2);
      expect(top + width / 2).toBeCloseTo(height / 2, 2);
      expect(left).toBeGreaterThan(0);
      expect(top).toBeGreaterThan(0);
      expect(top + width).toBeLessThan(height);
    }
  });
});
