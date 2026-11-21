// The pickers judge every eye's effective shapes (per-eye shapes included),
// so a per-eye frame can't slip a blocked body-eye or dot-eye pair past
// them (review findings 1A and 1B).
import { describe, expect, it } from "vitest";
import {
  pairBlocked,
  pairRisk,
} from "@/components/editor/control-sections/pair-rules";
import type { QRStyle } from "@/types/theme";

describe("pair rules with per-eye shapes", () => {
  it("A: a square frame on one eye blocks the thin bodies that fail next to it", () => {
    const style: Partial<QRStyle> = {
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
      eyeShapes: { topRight: { outer: "square" } },
    };
    for (const bodyPattern of ["diamond", "small-square"] as const) {
      expect(pairBlocked(style, { bodyPattern }), bodyPattern).toBe(true);
    }
    // Diamond dots fail next to square eyes only: the per-eye frame is the reason
    expect(pairRisk(style, { bodyPattern: "diamond" })).toContain(
      "square eyes",
    );
    expect(pairBlocked(style, { bodyPattern: "rounded" })).toBe(false);
    // Without the override, rounded eyes take small-square dots badly too, but diamond is fine
    expect(
      pairBlocked(
        { ...style, eyeShapes: undefined },
        { bodyPattern: "diamond" },
      ),
    ).toBe(false);
  });

  it("B: a square frame on one eye blocks a diamond centre for all", () => {
    const style: Partial<QRStyle> = {
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      eyeShapes: { bottomLeft: { outer: "square" } },
    };
    expect(pairBlocked(style, { cornerEyeDotPattern: "diamond" })).toBe(true);
    expect(pairRisk(style, { cornerEyeDotPattern: "diamond" })).toContain(
      "diamond centres in square eyes",
    );
  });
});
