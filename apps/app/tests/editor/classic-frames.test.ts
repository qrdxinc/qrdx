// The Classic frames in the editor: no frame and the engine's built-in
// frames, the former templates among them (Arrow, Standard box, Square
// border, Striked box, Halloween, Dot ring), one choice with the shaped codes
// (components/editor/control-sections/classic-frames.ts).
import { BUILT_IN_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_FRAME_IDS,
  classicFrameOf,
  withClassicFrame,
} from "@/components/editor/control-sections/classic-frames";

describe("Classic frames", () => {
  it("lists no frame, then every built-in frame, the former templates too", () => {
    expect(CLASSIC_FRAME_IDS).toEqual([
      "none",
      ...BUILT_IN_FRAMES.map((frame) => frame.style),
    ]);
    for (const style of [
      "arrow",
      "standard-box",
      "square-border",
      "striked-box",
      "halloween",
      "dot-ring",
    ]) {
      expect(CLASSIC_FRAME_IDS).toContain(style);
    }
  });

  it("shows the Classic tile a design has", () => {
    expect(classicFrameOf({})).toBe("none");
    expect(classicFrameOf({ frame: { style: "halloween" } })).toBe("halloween");
    expect(classicFrameOf({ frame: { style: "ticket" } })).toBe("ticket");
    expect(classicFrameOf({ shape: "heart" })).toBeNull();
  });

  it("replaces the frame or shaped code with one Classic tile", () => {
    const framed = {
      frame: { style: "banner-bottom" as const, text: "Menu", color: "#111" },
      shape: "circle" as const,
    };
    // A built-in frame keeps the text and colors chosen so far
    expect(withClassicFrame(framed, "dot-ring")).toEqual({
      frame: { style: "dot-ring", text: "Menu", color: "#111" },
    });
    expect(withClassicFrame(framed, "ticket")).toEqual({
      frame: { style: "ticket", text: "Menu", color: "#111" },
    });
    expect(withClassicFrame(framed, "none")).toEqual({
      frame: { style: "none" },
    });
  });
});
