// The Shadow and Rounded corners controls (review findings 2 and 4): the
// shadow's switch stays on through a shift of 0 and keeps the other values,
// and the corner slider's limit is the renderer's cap at the level the code
// is really drawn at.
import { getBgRadiusLimit } from "qrdx";
import { describe, expect, it } from "vitest";
import { bgRadiusLimitFor } from "@/components/editor/control-sections/corners-section";
import { shadowValues } from "@/components/editor/control-sections/shadow-section";
import { DEFAULT_QR_LOGO } from "@/lib/constants";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

describe("shadow controls", () => {
  it("keep their values through a shift of 0 and fill the defaults", () => {
    expect(
      shadowValues({ dx: 0, dy: 0, opacity: 0.35, color: "#1d4ed8" }),
    ).toEqual({
      dx: 0,
      dy: 0,
      opacity: 0.35,
      color: "#1d4ed8",
    });
    expect(shadowValues({})).toEqual({
      dx: 0.2,
      dy: 0.2,
      opacity: 0.3,
      color: "#000000",
    });
    expect(shadowValues({ dx: Number.NaN }).dx).toBe(0.2);
  });
});

describe("corner radius limit", () => {
  it("uses the level the code is drawn at (autoLevel with a logo raises it)", () => {
    const plain = { level: "L" as const, margin: 4 };
    expect(bgRadiusLimitFor(plain, VALUE)).toBeCloseTo(
      getBgRadiusLimit({ value: VALUE, level: "L", margin: 4 }),
    );
    const withLogo = {
      ...plain,
      showLogo: true,
      customLogo: DEFAULT_QR_LOGO,
      autoLevel: true,
      logoOptions: { size: 0.3 },
    };
    const raised = bgRadiusLimitFor(withLogo, VALUE);
    expect(raised).toBeLessThan(bgRadiusLimitFor(plain, VALUE));
    expect(raised).toBeCloseTo(
      getBgRadiusLimit({ value: VALUE, level: "H", margin: 4 }),
    );
  });
});
