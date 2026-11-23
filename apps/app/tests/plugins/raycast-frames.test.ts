// The Raycast extension offers qrdx's call-to-action frames instead of its
// templates (plugins/raycast/src/frames.ts). The frames come from qrdx: the
// AI instructions and the AI tool's docs name none, and the tool checks a
// name at run time against qrdx's list, answering with the valid ones.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  BUILT_IN_FRAMES,
  DEFAULT_FRAME_TEXT,
  FRAME_TEXT_MAX_LENGTH,
} from "qrdx";
import { describe, expect, it } from "vitest";
import {
  buildFrame,
  capFrameText,
  describeFrames,
  FRAME_CHOICES,
  frameName,
  frameTextLength,
  IMPLIED_FRAME,
  resolveFrame,
} from "../../../../plugins/raycast/src/frames";

const plugin = join(import.meta.dirname, "../../../../plugins/raycast");
const read = (path: string) => readFileSync(join(plugin, path), "utf8");
const pinned = createRequire(join(plugin, "package.json"))("qrdx") as {
  BUILT_IN_FRAMES: readonly { style: string }[];
  getTemplateIds: () => string[];
};

describe("Raycast frames", () => {
  it("offers no frame, then every built-in frame in qrdx's order", () => {
    expect(FRAME_CHOICES).toEqual([
      "",
      ...BUILT_IN_FRAMES.map((frame) => frame.style),
    ]);
    expect(IMPLIED_FRAME).toBe(BUILT_IN_FRAMES[0]?.style);
  });

  it("reads a frame by its style or its name, in any case", () => {
    for (const frame of BUILT_IN_FRAMES) {
      expect(resolveFrame(frame.style)).toBe(frame.style);
      expect(resolveFrame(` ${frame.name.toUpperCase()} `)).toBe(frame.style);
      expect(frameName(frame.style)).toBe(frame.name);
    }
    expect(resolveFrame(undefined)).toBe("");
    expect(resolveFrame("none")).toBe("");
    expect(resolveFrame("not-a-frame")).toBeNull();
    expect(frameName("")).toBe("None");
  });

  it("lists every frame for the AI tool's answer", () => {
    const list = describeFrames();
    for (const frame of BUILT_IN_FRAMES) {
      expect(list).toContain(`${frame.style} (${frame.name})`);
    }
  });

  it("draws the default label unless one is set, and caps labels", () => {
    const style = BUILT_IN_FRAMES[0]?.style ?? "";
    expect(buildFrame({ frame: "" })).toBeUndefined();
    expect(buildFrame({ frame: "not-a-frame" })).toBeUndefined();
    expect(buildFrame({ frame: style })).toEqual({
      style,
      text: DEFAULT_FRAME_TEXT,
    });
    expect(
      buildFrame({
        frame: style,
        frameText: "",
        frameColor: " #112233 ",
        frameTextColor: "",
      }),
    ).toEqual({ style, text: "", color: "#112233" });
    const long = "é".repeat(FRAME_TEXT_MAX_LENGTH + 5);
    expect(frameTextLength(capFrameText(long))).toBe(FRAME_TEXT_MAX_LENGTH);
  });

  it("names no template or frame in the AI instructions or tool docs", () => {
    // A pasted frame list would name the hyphenated styles; the one-word
    // ones (circle, tag, …) are also everyday words and pattern names.
    const listed = pinned.BUILT_IN_FRAMES.map((frame) => frame.style).filter(
      (style) => style.includes("-"),
    );
    const templates = pinned.getTemplateIds().filter((id) => id !== "default");
    expect(listed.length).toBeGreaterThan(0);
    for (const file of ["ai.yaml", "src/tools/generate-qr.ts"]) {
      const text = read(file);
      expect(listed.filter((style) => text.includes(style))).toEqual([]);
      expect(templates.filter((id) => text.includes(id))).toEqual([]);
      expect(text).not.toMatch(/templateId/);
    }
  });
});
