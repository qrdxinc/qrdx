// What a theme or frame is made of, as its card and page show it: a
// theme's colors once each with every part they paint, its patterns by the
// editor's names, the code its swatch draws, and a frame's lines, colors
// and what the editor lets you change.

import { getOfficialFrame } from "qrdx";
import { describe, expect, it } from "vitest";
import { officialFrameValue } from "@/lib/community/catalog";
import {
  frameParts,
  swatchStyle,
  themeColors,
  themeParts,
} from "@/lib/community/design-parts";

describe("themeColors", () => {
  it("lists each color once, with every part it paints", () => {
    expect(
      themeColors({
        fgColor: "#1D4ED8",
        eyeColor: "#1d4ed8",
        dotColor: "#0F172A",
        bgColor: "#ffffff",
      }),
    ).toEqual([
      { hex: "#1d4ed8", roles: ["dots", "eyes"] },
      { hex: "#0f172a", roles: ["eyeDots"] },
      { hex: "#ffffff", roles: ["background"] },
    ]);
  });

  it("uses the engine's defaults for colors a theme leaves out", () => {
    expect(themeColors({})).toEqual([
      { hex: "#000000", roles: ["dots", "eyes", "eyeDots"] },
      { hex: "#ffffff", roles: ["background"] },
    ]);
    // Eyes left out take the dots' color
    expect(themeColors({ fgColor: "#123456", bgColor: "#fafafa" })).toEqual([
      { hex: "#123456", roles: ["dots", "eyes", "eyeDots"] },
      { hex: "#fafafa", roles: ["background"] },
    ]);
  });

  it("counts every gradient stop and per-eye color", () => {
    const colors = themeColors({
      fgColor: {
        type: "linear",
        angle: 0,
        stops: [
          { color: "#ff0000", offset: 0 },
          { color: "#0000ff", offset: 100 },
        ],
      },
      eyeColor: "#ff0000",
      dotColor: "#ff0000",
      eyeColors: { topLeft: { outer: "#00ff00", inner: "#0000ff" } },
      bgColor: "#ffffff",
    });
    expect(colors).toEqual([
      { hex: "#ff0000", roles: ["dots", "eyes", "eyeDots"] },
      { hex: "#0000ff", roles: ["dots", "eyeDots"] },
      { hex: "#00ff00", roles: ["eyes"] },
      { hex: "#ffffff", roles: ["background"] },
    ]);
  });
});

describe("swatchStyle", () => {
  it("keeps the code's look and drops what goes around it", () => {
    const look = swatchStyle({
      fgColor: "#111111",
      bodyPattern: "classy-rounded",
      cornerEyePattern: "rounded",
      frame: { style: "banner-bottom", text: "Scan me" },
      shape: "circle",
      showLogo: true,
      customLogo: "data:image/png;base64,AAAA",
      logoOptions: { size: 0.2 },
      moduleScale: 0.8,
    });
    expect(look).toEqual({
      fgColor: "#111111",
      bodyPattern: "classy-rounded",
      cornerEyePattern: "rounded",
      moduleScale: 0.8,
      showLogo: false,
    });
  });
});

describe("themeParts", () => {
  it("names the patterns as the editor does, with its defaults", () => {
    expect(
      themeParts({
        bodyPattern: "classy-rounded",
        cornerEyePattern: "extra-rounded",
        cornerEyeDotPattern: "cross-rounded",
      }),
    ).toEqual({
      dots: "Classy Rounded",
      eyes: "Extra Rounded",
      eyeDots: "Rounded Cross",
    });
    expect(themeParts({})).toEqual({
      dots: "Circle",
      eyes: "Gear",
      eyeDots: "Circle",
    });
  });

  it("has no name for a pattern the editor no longer offers", () => {
    expect(themeParts({ cornerEyePattern: "curly" }).eyes).toBeNull();
  });
});

describe("frameParts", () => {
  it("reads an official frame's lines, colors and what can change", () => {
    const frame = getOfficialFrame("table-tent");
    if (!frame) throw new Error("table-tent is missing");
    expect(frameParts(officialFrameValue(frame))).toEqual({
      label: "Scan for our menu",
      // It has a second line, empty until you write one
      secondLine: null,
      lines: { label: true, secondLine: true },
      colors: [
        { name: "Frame", hex: "#111111" },
        { name: "Text", hex: "#ffffff" },
      ],
      icons: 1,
      textSize: true,
    });
  });

  it("shows the frame's own text and colors over its spec's", () => {
    const frame = getOfficialFrame("table-tent");
    if (!frame) throw new Error("table-tent is missing");
    const parts = frameParts({
      ...officialFrameValue(frame),
      text: "Order here",
      secondaryText: "Table service",
      color: "#7c2d12",
    });
    expect(parts?.label).toBe("Order here");
    expect(parts?.secondLine).toBe("Table service");
    expect(parts?.colors[0]).toEqual({ name: "Frame", hex: "#7c2d12" });
  });

  it("is null for no frame", () => {
    expect(frameParts({ style: "none" })).toBeNull();
  });
});
