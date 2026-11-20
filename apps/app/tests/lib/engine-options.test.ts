// styleEngineOptions: the engine options a saved style carries, ready for
// getQRData and <QRCode>. Unset or default values stay out, so styles saved
// before these options existed render exactly as they did.
import { describe, expect, it } from "vitest";
import {
  styleEngineOptions,
  styleSvgOptions,
} from "@/lib/qr-design/engine-options";

describe("styleEngineOptions", () => {
  it("is empty for a style without engine options", () => {
    expect(
      styleEngineOptions({ bgColor: "#fff", bodyPattern: "square" }),
    ).toEqual({});
  });

  it("drops defaults and empty values", () => {
    expect(
      styleEngineOptions({
        moduleScale: 1,
        autoLevel: false,
        logoOptions: {},
        eyeColors: { topLeft: {} },
      }),
    ).toEqual({});
  });

  it("returns every set option", () => {
    const style = {
      moduleScale: 0.8,
      autoLevel: true,
      logoOptions: { size: 0.2, x: 0.3 },
      eyeColors: { topRight: { outer: "#b91c1c" } },
    };
    expect(styleEngineOptions(style)).toEqual(style);
  });

  it("carries the circle shape, and nothing for a square one", () => {
    expect(styleEngineOptions({ shape: "circle" })).toEqual({
      shape: "circle",
    });
    expect(styleEngineOptions({ shape: "square" })).toEqual({});
    expect(styleSvgOptions({ shape: "circle" })).toEqual({ shape: "circle" });
  });

  it("carries the looks around the shapes, each only when it draws", () => {
    const looks = {
      eyeShapes: { topLeft: { outer: "leaf" as const } },
      eyeGradient: "code" as const,
      bgRadius: 0.2,
      backdrop: "#0f172a",
      halo: { width: 0.3 },
      shadow: { dx: 0.1, dy: 0.1 },
    };
    expect(styleEngineOptions(looks)).toEqual(looks);
    expect(styleSvgOptions(looks)).toEqual(looks);
    expect(
      styleEngineOptions({
        eyeShapes: { topLeft: {} },
        eyeGradient: "corner",
        bgRadius: 0,
        backdrop: "#0f172a",
        shadow: { dx: 0, dy: 0 },
      }),
    ).toEqual({});
    // A backdrop only with a rounded corner to show outside
    expect(styleEngineOptions({ backdrop: "#0f172a" })).toEqual({});
  });

  it("gives <QRCodeSVG> only the props it takes", () => {
    expect(
      styleSvgOptions({
        moduleScale: 0.8,
        autoLevel: true,
        logoOptions: { size: 0.2 },
        eyeColors: { topRight: { outer: "#b91c1c" } },
      }),
    ).toEqual({
      moduleScale: 0.8,
      eyeColors: { topRight: { outer: "#b91c1c" } },
    });
  });
});
