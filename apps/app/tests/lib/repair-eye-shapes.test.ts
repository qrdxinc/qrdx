// The design repairs look at the effective per-eye shapes: a weak pair on
// one eye is repaired like a global one, and the repaired part's per-eye
// overrides are cleared so the check can't keep failing (review finding 1).
import { describe, expect, it } from "vitest";
import {
  normalizeDesign,
  repairDesign,
  withoutEyeOverrides,
} from "@/lib/qr-design/repair";
import { CLASSIC_STYLE } from "@/lib/qr-design/style";

describe("repairs with per-eye shapes", () => {
  it("normalizeDesign repairs a dot-eye pair that only a per-eye centre makes", () => {
    // A retired diamond centre can only come from a saved per-eye override
    const { style, changes, eyeShapes } = normalizeDesign(
      {
        ...CLASSIC_STYLE,
        cornerEyePattern: "gear",
        cornerEyeDotPattern: "circle",
      },
      {
        hasLogo: false,
        eyeShapes: { topLeft: { outer: "square", inner: "diamond" } },
      },
    );
    expect(style.cornerEyeDotPattern).toBe("rounded");
    expect(changes[0]).toContain("eye centers");
    // The per-eye centre is cleared too, the frame stays
    expect(eyeShapes).toEqual({ topLeft: { outer: "square" } });
  });

  it("repairDesign on eye-shape clears the per-eye frames it repairs", () => {
    const { style, eyeShapes } = repairDesign(
      { ...CLASSIC_STYLE, cornerEyePattern: "rounded" },
      [{ id: "eye-shape", message: "Circle eyes", fix: "" }],
      { eyeShapes: { bottomLeft: { outer: "circle", inner: "dots" } } },
    );
    expect(style.cornerEyePattern).toBe("rounded");
    expect(eyeShapes).toEqual({ bottomLeft: { inner: "dots" } });
  });

  it("repairDesign on style-pair repairs a body-eye pair made by one eye", () => {
    const { style, changes } = repairDesign(
      {
        ...CLASSIC_STYLE,
        bodyPattern: "diamond",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "rounded",
      },
      [{ id: "style-pair", message: "diamond dots", fix: "" }],
      { eyeShapes: { topRight: { outer: "square" } } },
    );
    expect(style.bodyPattern).toBe("rounded");
    expect(changes[0]).toContain("dots");
  });

  it("withoutEyeOverrides drops one part and empty eyes", () => {
    expect(
      withoutEyeOverrides(
        {
          topLeft: { outer: "leaf" },
          topRight: { outer: "leaf", inner: "leaf" },
        },
        "outer",
      ),
    ).toEqual({ topRight: { inner: "leaf" } });
    expect(
      withoutEyeOverrides({ topLeft: { outer: "leaf" } }, "outer"),
    ).toBeUndefined();
  });
});
