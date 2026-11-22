// The design repairs look at the effective per-eye shapes: a weak pair on
// one eye is repaired like a global one, and the repaired part's per-eye
// overrides are cleared so the check can't keep failing (review finding 1).
// Per-eye shapes are part of the design's style, so each attempt's are
// scored with it, and the classic fallback draws none (review finding 4).
import type { ScanScoreResult } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  type DesignLoopResult,
  normalizeDesign,
  repairDesign,
  runDesignLoop,
  type ScoreFn,
  withoutEyeOverrides,
} from "@/lib/qr-design/repair";
import { scoreDesign } from "@/lib/qr-design/score";
import {
  CLASSIC_STYLE,
  type DesignStyle,
  toThemeStyles,
} from "@/lib/qr-design/style";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

type Eyes = DesignStyle["eyeShapes"];

/** The editor's scan score. */
const score: ScoreFn = (value, style) => scoreDesign(value, style);

/** The result's style scored again. */
const rescore = (result: DesignLoopResult): Promise<ScanScoreResult> =>
  score(VALUE, toThemeStyles(result.style));

describe("repairs with per-eye shapes", () => {
  it("normalizeDesign repairs a dot-eye pair that only a per-eye centre makes", () => {
    // A retired diamond centre can only come from a saved per-eye override
    const { style, changes } = normalizeDesign(
      {
        ...CLASSIC_STYLE,
        cornerEyePattern: "gear",
        cornerEyeDotPattern: "circle",
        eyeShapes: {
          topLeft: { outer: "square", inner: "diamond" },
        } as unknown as Eyes,
      },
      { hasLogo: false },
    );
    expect(style.cornerEyeDotPattern).toBe("rounded");
    expect(changes[0]).toContain("eye centers");
    // The per-eye centre is cleared too, the frame stays
    expect(style.eyeShapes).toEqual({ topLeft: { outer: "square" } });
  });

  it("repairDesign on eye-shape clears the per-eye frames it repairs", () => {
    const { style } = repairDesign(
      {
        ...CLASSIC_STYLE,
        cornerEyePattern: "rounded",
        eyeShapes: { bottomLeft: { outer: "circle", inner: "dots" } },
      },
      [{ id: "eye-shape", message: "Circle eyes", fix: "" }],
    );
    expect(style.cornerEyePattern).toBe("rounded");
    expect(style.eyeShapes).toEqual({ bottomLeft: { inner: "dots" } });
  });

  it("repairDesign on style-pair repairs a body-eye pair made by one eye", () => {
    const { style, changes } = repairDesign(
      {
        ...CLASSIC_STYLE,
        bodyPattern: "diamond",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "rounded",
        eyeShapes: { topRight: { outer: "square" } },
      },
      [{ id: "style-pair", message: "diamond dots", fix: "" }],
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

describe("runDesignLoop with per-eye shapes, scored by the engine's rules", () => {
  it("clears a circle eye when the code's eyes are already rounded", async () => {
    const result = await runDesignLoop({
      value: VALUE,
      initial: {
        ...CLASSIC_STYLE,
        cornerEyePattern: "rounded",
        eyeShapes: { topRight: { outer: "circle", inner: "dots" } },
      },
      hasLogo: false,
      score,
    });
    const first = result.attempts[0];
    expect(first?.failed.map((check) => check.id)).toContain("eye-shape");
    expect(result.grade).toBe("great");
    expect(result.fellBack).toBe(false);
    // The circle frame is gone, the eye's own centre stays
    expect(result.style.eyeShapes).toEqual({ topRight: { inner: "dots" } });
    expect(result.changes.join("\n")).toContain(
      "Changed the eyes from circle to rounded",
    );
    // Style, score and per-eye shapes are one attempt's
    const again = await rescore(result);
    expect(again.score).toBe(result.score);
    expect(again.checks).toEqual(result.checks);
  });

  it("falls back to a classic code with no per-eye shapes", async () => {
    const result = await runDesignLoop({
      value: VALUE,
      initial: {
        ...CLASSIC_STYLE,
        cornerEyePattern: "rounded",
        eyeShapes: { bottomLeft: { outer: "circle" } },
      },
      hasLogo: false,
      score,
      maxRepairs: 0,
    });
    expect(result.fellBack).toBe(true);
    expect(result.grade).toBe("great");
    expect(result.style.eyeShapes).toBeUndefined();
    const again = await rescore(result);
    expect(again.score).toBe(result.score);
    expect(again.checks).toEqual(result.checks);
  });

  it("returns the best attempt's per-eye shapes with its style and score", async () => {
    // A scorer that rates the first attempt best: a later repair's cleared
    // shapes must not come back with the first attempt's style and score
    const seen: Eyes[] = [];
    const scripted: ScoreFn = async (value, style) => {
      seen.push(style.eyeShapes as Eyes);
      const real = await score(value, style);
      return seen.length === 1
        ? real
        : { ...real, score: Math.min(real.score, 10), grade: "fails" };
    };
    const initialEyes: Eyes = { topRight: { outer: "circle" } };
    const result = await runDesignLoop({
      value: VALUE,
      initial: {
        ...CLASSIC_STYLE,
        cornerEyePattern: "rounded",
        eyeShapes: initialEyes,
      },
      hasLogo: false,
      score: scripted,
      maxRepairs: 1,
    });
    // The repair cleared the circle eye and scored worse, and so did the
    // classic fallbacks: the result is the first attempt, shapes included
    expect(seen[1]).toBeUndefined();
    expect(result.fellBack).toBe(false);
    expect(result.score).toBe(result.attempts[0]?.score);
    expect(result.style).toEqual(result.attempts[0]?.style);
    expect(result.style.eyeShapes).toEqual(initialEyes);
  });
});
