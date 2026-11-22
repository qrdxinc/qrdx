// The looks in the design vocabulary the AI chat and the MCP design_qr tool
// share (lib/qr-design/style.ts): per-eye colors and shapes, the eye
// gradient's span, dot size, the circle and heart outlines, rounded
// corners and their backdrop, halo, shadow, the logo's layout and auto
// error correction. They round-trip through the editor's styles, a change
// keeps the ones it leaves out, repairs reach them, and official frames are
// named by id and drawn from the catalogue. No model, database or network.

import type { ScanScoreResult } from "qrdx";
import { getOfficialFrame } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  isOfficialFrame,
  OFFICIAL_FRAME_SOURCES,
  officialFrameId,
  searchOfficialFrames,
} from "@/lib/qr-design/official-frames";
import { repairDesign, runDesignLoop } from "@/lib/qr-design/repair";
import {
  CLASSIC_STYLE,
  type DesignStyle,
  designStyleSchema,
  fromThemeStyles,
  sanitizeDesignStyle,
  styleDiff,
  toThemeStyles,
} from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";

const CUP = getOfficialFrame("cafe-cup");
if (!CUP) throw new Error("The cafe-cup official frame is missing");

/** Every look, as the editor stores them. */
const LOOKS = {
  eyeColors: { topLeft: { outer: "#7C2D12", inner: "#9A3412" } },
  eyeShapes: { topRight: { outer: "squircle", inner: "rounded" } },
  eyeGradient: "code",
  moduleScale: 0.9,
  shape: "heart",
  bgRadius: 0.1,
  backdrop: "#F5F5F4",
  halo: { color: "#E5E7EB", width: 0.25 },
  shadow: { color: "#000000", opacity: 0.2, dx: 0.1, dy: -0.1 },
  logoOptions: { size: 0.2, padding: 1, shape: "circle", plate: "#FFFFFF" },
  autoLevel: true,
} satisfies Partial<ThemeStyles>;

const EDITOR: ThemeStyles = {
  bgColor: "#FFFFFF",
  fgColor: "#1C1917",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
  level: "H",
  margin: 4,
  ...LOOKS,
};

const answer = (extra: Record<string, unknown>) =>
  ({ ...CLASSIC_STYLE, ...extra }) as Parameters<typeof sanitizeDesignStyle>[0];

describe("the looks in the style vocabulary", () => {
  it("reads every look from editor styles and writes it back", () => {
    const design = fromThemeStyles(EDITOR);
    expect(designStyleSchema.safeParse(design).success).toBe(true);
    expect(design).toMatchObject(LOOKS);
    expect(toThemeStyles(design)).toMatchObject(LOOKS);
  });

  it("leaves out what it can't express, and never a silhouette", () => {
    const design = fromThemeStyles({
      ...EDITOR,
      eyeColors: {
        topLeft: {
          outer: {
            type: "linear",
            stops: [
              { color: "#000000", offset: 0 },
              { color: "#333333", offset: 100 },
            ],
          },
          inner: "#111111",
        },
      },
      eyeShapes: { topRight: { outer: "curly" } },
      moduleScale: 1,
      // A silhouette draws in place of the named outline: neither is kept
      shape: "circle",
      bgRadius: 0,
      silhouette: {
        type: "silhouette",
        width: 4,
        height: 4,
        cells: "1".repeat(16),
      },
    } as ThemeStyles);
    // A gradient on one eye is dropped, its solid centre kept
    expect(design.eyeColors).toEqual({ topLeft: { inner: "#111111" } });
    // A retired shape, full-size dots, the silhouette's outline, no
    // rounding: left out
    expect(design.eyeShapes).toBeUndefined();
    expect(design.moduleScale).toBeUndefined();
    expect(design.shape).toBeUndefined();
    expect(design.bgRadius).toBeUndefined();
    expect(design.backdrop).toBeUndefined();
    expect(JSON.stringify(design)).not.toContain("silhouette");
  });

  it("names an official frame by id and keeps the user's own as keep", () => {
    const official = fromThemeStyles(
      { ...EDITOR, frame: { style: "custom", spec: CUP.spec, text: "Hi" } },
      undefined,
      { officialFrameId, keepOwn: true },
    );
    expect(official.frame).toEqual({
      style: "official",
      id: "cafe-cup",
      text: "Hi",
    });
    const own = { ...CUP.spec, ratio: undefined, name: "Mine" };
    const kept = fromThemeStyles(
      {
        ...EDITOR,
        frame: { style: "custom", spec: own } as ThemeStyles["frame"],
      },
      undefined,
      { officialFrameId, keepOwn: true },
    );
    expect(kept.frame).toEqual({ style: "keep" });
    // Without keepOwn (the MCP tool), the user's own frame is no frame
    expect(
      fromThemeStyles(
        {
          ...EDITOR,
          frame: { style: "custom", spec: own } as ThemeStyles["frame"],
        },
        undefined,
        { officialFrameId },
      ).frame,
    ).toEqual({ style: "none" });
  });

  it("draws official and kept frames from their sources", () => {
    const design: DesignStyle = {
      ...CLASSIC_STYLE,
      frame: { style: "official", id: "cafe-cup", text: "Coffee time" },
    };
    expect(toThemeStyles(design, OFFICIAL_FRAME_SOURCES).frame).toEqual({
      style: "custom",
      spec: CUP.spec,
      text: "Coffee time",
    });
    // Without the catalogue (the browser), no frame rather than a wrong one
    expect(toThemeStyles(design).frame).toBeUndefined();
    const ownFrame = { style: "custom" as const, spec: CUP.spec, text: "Old" };
    expect(
      toThemeStyles(
        { ...CLASSIC_STYLE, frame: { style: "keep", color: "#1E3A8A" } },
        { ownFrame },
      ).frame,
    ).toEqual({ ...ownFrame, color: "#1E3A8A" });
  });

  it("keeps a look a change leaves out, and turns off a null one", () => {
    const current = fromThemeStyles(EDITOR);
    const changed = sanitizeDesignStyle(
      answer({ fgColor: "#1E3A8A", shadow: null, halo: undefined }),
      current,
      { inherit: current },
    );
    expect(changed.halo).toEqual(LOOKS.halo);
    expect(changed.eyeShapes).toEqual(LOOKS.eyeShapes);
    expect(changed.shadow).toBeUndefined();
    // A new design starts without the looks it doesn't set
    const fresh = sanitizeDesignStyle(answer({}), current);
    expect(fresh.halo).toBeUndefined();
    expect(fresh.bgRadius).toBeUndefined();
  });

  it("makes a designer's looks valid instead of failing on them", () => {
    // The designer writes look numbers as whole percents
    const style = sanitizeDesignStyle(
      answer({
        // Per-eye looks come in flat fields
        eyeColorTopLeft: "brown #7C2D12",
        eyeColorTopRight: "red",
        eyeShapeBottomLeft: "triangle",
        eyeCenterShapeBottomLeft: "dots",
        moduleScale: 20,
        shape: "star",
        bgRadius: 90,
        backdrop: "#ABC",
        halo: { width: 300 },
        shadow: { opacity: 90, dx: -200 },
        logoOptions: { size: 50, x: 200, shape: "hexagon", plate: "white" },
        logo: "Spotify",
      }),
      CLASSIC_STYLE,
    );
    expect(designStyleSchema.safeParse(style).success).toBe(true);
    expect(style).toMatchObject({
      eyeColors: { topLeft: { outer: "#7C2D12" } },
      eyeShapes: { bottomLeft: { inner: "dots" } },
      moduleScale: 0.5,
      bgRadius: 0.5,
      backdrop: "#AABBCC",
      halo: { width: 0.5 },
      shadow: { opacity: 0.4, dx: -0.3 },
      logoOptions: { size: 0.3, x: 1 },
      // A brand slug, lower-cased (whether it exists is checked on the server)
      logo: "spotify",
    });
    expect(style.shape).toBeUndefined();
  });

  it("shows the designer look numbers in percents and reads its answer back", async () => {
    const { toDesignerView } = await import("@/lib/qr-design/style");
    const current = fromThemeStyles(EDITOR);
    const view = toDesignerView(current);
    expect(view).toMatchObject({
      moduleScale: 90,
      bgRadius: 10,
      halo: { color: "#E5E7EB", width: 25 },
      shadow: { opacity: 20, dx: 10, dy: -10 },
      logoOptions: { size: 20, padding: 100 },
    });
    // An answer that repeats the view is the same style
    const back = sanitizeDesignStyle(
      view as Parameters<typeof sanitizeDesignStyle>[0],
      current,
    );
    expect(back).toEqual(current);
  });

  it("keeps only official frames that exist, and keep only with a frame to keep", () => {
    const fallback: DesignStyle = {
      ...CLASSIC_STYLE,
      frame: { style: "banner-bottom", text: "Scan me" },
    };
    const unknown = sanitizeDesignStyle(
      answer({ frame: { style: "official", id: "nope" } }),
      fallback,
      { isOfficialFrame },
    );
    expect(unknown.frame).toEqual({ style: "none" });
    const known = sanitizeDesignStyle(
      answer({ frame: { style: "official", id: "Cafe-Cup", text: "Hi" } }),
      fallback,
      { isOfficialFrame },
    );
    expect(known.frame).toEqual({
      style: "official",
      id: "cafe-cup",
      text: "Hi",
    });
    expect(
      sanitizeDesignStyle(answer({ frame: { style: "keep" } }), fallback).frame,
    ).toEqual({ style: "none" });
    expect(
      sanitizeDesignStyle(answer({ frame: { style: "keep" } }), fallback, {
        hasOwnFrame: true,
      }).frame,
    ).toEqual({ style: "keep" });
  });

  it("keeps a frame's accent and label size across a change of the same frame", () => {
    const current = fromThemeStyles(
      {
        ...EDITOR,
        frame: {
          style: "custom",
          spec: CUP.spec,
          text: "Hi",
          secondaryColor: "#FF0000",
          fontScale: 1.3,
        },
      },
      undefined,
      { officialFrameId, keepOwn: true },
    );
    expect(current.frame).toMatchObject({
      style: "official",
      id: "cafe-cup",
      secondaryColor: "#FF0000",
      fontScale: 1.3,
    });
    const changed = sanitizeDesignStyle(
      answer({ frame: { style: "official", id: "cafe-cup", text: "Hello" } }),
      current,
      { inherit: current, isOfficialFrame },
    );
    expect(changed.frame).toEqual({
      style: "official",
      id: "cafe-cup",
      text: "Hello",
      secondaryColor: "#FF0000",
      fontScale: 1.3,
    });
    expect(toThemeStyles(changed, OFFICIAL_FRAME_SOURCES).frame).toMatchObject({
      secondaryColor: "#FF0000",
      fontScale: 1.3,
    });
    // Another frame doesn't take them
    const other = sanitizeDesignStyle(
      answer({ frame: { style: "banner-bottom", text: "Scan me" } }),
      current,
      { inherit: current, isOfficialFrame },
    );
    expect(other.frame).toEqual({ style: "banner-bottom", text: "Scan me" });
  });

  it("reads the designer's percents back without float noise", () => {
    const style = sanitizeDesignStyle(
      answer({ moduleScale: 57, shadow: { opacity: 29, dx: 7 } }),
      CLASSIC_STYLE,
    );
    expect(style.moduleScale).toBe(0.57);
    expect(style.shadow).toEqual({ opacity: 0.29, dx: 0.07 });
  });

  it("lists changed looks in plain words", () => {
    const lines = styleDiff(
      { ...CLASSIC_STYLE, shadow: { opacity: 0.2 } },
      {
        ...CLASSIC_STYLE,
        halo: { width: 0.3 },
        frame: { style: "official", id: "cafe-cup" },
      },
    ).map(({ label, from, to }) =>
      from ? `${label}: ${from} → ${to}` : `${label}: ${to}`,
    );
    expect(lines).toEqual([
      "frame: none → official cafe-cup",
      "halo: width 0.3",
      "shadow: opacity 0.2 → none",
    ]);
  });
});

describe("repairs reach the looks", () => {
  it("fixes a single eye's colors for contrast", () => {
    const { style, changes } = repairDesign(
      { ...CLASSIC_STYLE, eyeColors: { topLeft: { outer: "#FDE68A" } } },
      [{ id: "contrast", message: "Low contrast" }],
    );
    expect(style.eyeColors?.topLeft?.outer).not.toBe("#FDE68A");
    expect(changes.join("\n")).toMatch(/colors of single eyes/);
  });

  it("leaves a single eye's gradient alone instead of failing on it", () => {
    // Community themes (the MCP tool's base) can carry gradients per eye
    const gradient = {
      type: "linear",
      stops: [
        { color: "#FDE68A", offset: 0 },
        { color: "#FEF3C7", offset: 100 },
      ],
    };
    const { style } = repairDesign(
      {
        ...CLASSIC_STYLE,
        eyeColors: {
          topLeft: { outer: gradient, inner: "#FDE68A" },
        } as unknown as DesignStyle["eyeColors"],
      },
      [{ id: "contrast", message: "Low contrast" }],
    );
    expect(style.eyeColors?.topLeft?.outer).toEqual(gradient);
    expect(style.eyeColors?.topLeft?.inner).not.toBe("#FDE68A");
  });

  it("squares every eye on the last decode repair, single eyes too", () => {
    const { style } = repairDesign(
      {
        ...CLASSIC_STYLE,
        cornerEyePattern: "squircle",
        eyeShapes: { topLeft: { outer: "squircle", inner: "dots" } },
      },
      [{ id: "decode-96", message: "Doesn't decode at 96 px" }],
      { final: true },
    );
    expect(style.cornerEyePattern).toBe("square");
    expect(style.eyeShapes).toBeUndefined();
  });

  it("makes the dots full size, then drops the shadow, when the code won't decode small", () => {
    const failed = [{ id: "decode-96", message: "Doesn't decode at 96 px" }];
    const start = {
      ...CLASSIC_STYLE,
      moduleScale: 0.7,
      shadow: { opacity: 0.3 },
    };
    const first = repairDesign(start, failed);
    expect(first.style.moduleScale).toBeUndefined();
    expect(first.style.shadow).toEqual({ opacity: 0.3 });
    expect(first.changes.join("\n")).toMatch(/dots full size \(from 70%\)/);
    const last = repairDesign(start, failed, { final: true });
    expect(last.style.shadow).toBeUndefined();
  });

  it("scores an official frame drawn from its sources", async () => {
    const seen: ThemeStyles[] = [];
    const score = async (_value: string, style: ThemeStyles) => {
      seen.push(style);
      return {
        score: 95,
        grade: "great",
        checks: [],
      } as unknown as ScanScoreResult;
    };
    const result = await runDesignLoop({
      value: "https://qrdx.dev",
      initial: {
        ...CLASSIC_STYLE,
        frame: { style: "official", id: "cafe-cup" },
        halo: { width: 0.2 },
      },
      hasLogo: false,
      score,
      sources: OFFICIAL_FRAME_SOURCES,
    });
    expect(result.grade).toBe("great");
    expect(seen[0]?.frame).toMatchObject({ style: "custom", spec: CUP.spec });
    expect(seen[0]?.halo).toEqual({ width: 0.2 });
  });
});

describe("official frame search", () => {
  it("finds frames by what they're for, best first", () => {
    const coffee = searchOfficialFrames("coffee cup");
    expect(coffee.length).toBeGreaterThan(0);
    expect(coffee.length).toBeLessThanOrEqual(8);
    expect(coffee.map((frame) => frame.id)).toContain("cafe-cup");
    expect(coffee[0]?.labels.primary).toBeTruthy();
    const diwali = searchOfficialFrames("Diwali");
    expect(diwali.every((frame) => frame.id.startsWith("diwali-"))).toBe(true);
    expect(diwali[0]?.collection).toBeTruthy();
  });

  it("offers call-to-action frames when nothing matches", () => {
    const none = searchOfficialFrames("zzqx");
    expect(none.length).toBeGreaterThan(0);
    for (const frame of none) {
      expect(getOfficialFrame(frame.id)?.collection).toBe("call-to-action");
    }
  });

  it("returns only ids the catalogue has", () => {
    for (const frame of searchOfficialFrames("wifi guest network")) {
      expect(isOfficialFrame(frame.id)).toBe(true);
    }
  });
});

describe("the editor context the chat starts from", () => {
  it("carries the looks, drops a value it can't read and says when there's a silhouette", async () => {
    const { describeEditorForModel, editorBase, editorContextSchema } =
      await import("@/lib/ai/agent/editor-context");
    const parsed = editorContextSchema.parse({
      contentType: "url",
      value: "https://qrdx.dev",
      style: {
        ...EDITOR,
        // Not a number: dropped, the request still goes through
        moduleScale: "small",
        frame: { style: "custom", spec: CUP.spec },
        silhouette: {
          type: "silhouette",
          width: 4,
          height: 4,
          cells: "1".repeat(16),
        },
      },
      hasSilhouette: true,
    });
    expect(parsed.style.moduleScale).toBeUndefined();
    expect(parsed.style.halo).toEqual(LOOKS.halo);
    expect(JSON.stringify(parsed)).not.toContain("1111111111111111");
    const base = editorBase(parsed);
    expect(base.style.frame).toEqual({ style: "official", id: "cafe-cup" });
    expect(base.sources.ownFrame).toBeUndefined();
    const told = describeEditorForModel(base);
    expect(told).toContain("traced from a picture");
    expect(told).toContain('"halo"');
  });
});
