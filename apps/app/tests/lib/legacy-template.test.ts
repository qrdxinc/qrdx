// Designs saved before qrdx 0.0.64 can name one of the engine's templates.
// They're read as the built-in frame the template became, in one place
// (lib/qr-design/legacy-template.ts), wherever a stored design is read; the
// stored data itself is never rewritten. Requests that pass a template
// (the image API's `template=`, a style's `templateId`) are drawn without it.
import { getBuiltInFrame } from "qrdx";
import { describe, expect, it } from "vitest";
import { decodeStyleParam, encodeStyleParam } from "@/lib/playground-style";
import { parseApiStyle } from "@/lib/qr-api/style";
import {
  TEMPLATE_FRAMES,
  withTemplateAsFrame,
} from "@/lib/qr-design/legacy-template";
import { designQRProps, editorCodeProps } from "@/lib/qr-design/props";
import { fromThemeStyles } from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";

const legacy = (style: Record<string, unknown>) => style as ThemeStyles;

describe("a saved template reads as its frame", () => {
  it.each([
    ["Arrow", "arrow"],
    ["StandardBox", "standard-box"],
    ["SquareBorder", "square-border"],
    ["StrikedBox", "striked-box"],
    ["Halloween", "pumpkin"],
    ["DotRing", "dot-ring"],
    ["FlamQR", "dot-ring"],
  ])("%s → %s", (templateId, style) => {
    const read = withTemplateAsFrame(
      legacy({ templateId, bodyPattern: "rounded", margin: 4 }),
    );
    expect(read.frame?.style).toBe(style);
    expect(read).not.toHaveProperty("templateId");
    expect(read).toMatchObject({ bodyPattern: "rounded", margin: 4 });
    // The frame is one the engine draws
    expect(getBuiltInFrame(style)).toBeDefined();
  });

  it('"default" and unknown ids draw no frame, as before', () => {
    for (const templateId of ["default", "Nope", "constructor", 3]) {
      const read = withTemplateAsFrame(legacy({ templateId, level: "M" }));
      expect(read).toEqual({ level: "M" });
    }
  });

  it("keeps a design without a template as it is (the same object)", () => {
    const style = legacy({ fgColor: "#111111" });
    expect(withTemplateAsFrame(style)).toBe(style);
    expect(withTemplateAsFrame(null)).toBeNull();
    expect(withTemplateAsFrame(undefined)).toBeUndefined();
  });

  it("gives the frame the code's dark color where the template's artwork took it", () => {
    for (const [templateId, frame] of Object.entries(TEMPLATE_FRAMES)) {
      if (!frame) continue;
      const read = withTemplateAsFrame(
        legacy({ templateId, fgColor: "#1e3a8a" }),
      );
      expect(read.frame?.color, templateId).toBe(
        frame.takesCodeColor ? "#1e3a8a" : undefined,
      );
    }
    // A gradient's first color, as the template drew it
    const gradient = withTemplateAsFrame(
      legacy({
        templateId: "Arrow",
        fgColor: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#be123c", offset: 0 },
            { color: "#1e3a8a", offset: 100 },
          ],
        },
      }),
    );
    expect(gradient.frame?.color).toBe("#be123c");
  });

  it("knows which frames take the code's color from their specs", () => {
    for (const [templateId, frame] of Object.entries(TEMPLATE_FRAMES)) {
      if (!frame) continue;
      const spec = getBuiltInFrame(frame.style)?.spec;
      const paintsFrame = Boolean(
        spec?.shapes.some(
          (shape) =>
            shape.fill === "frame" ||
            ("stroke" in shape && shape.stroke?.color === "frame"),
        ),
      );
      expect(frame.takesCodeColor, templateId).toBe(paintsFrame);
    }
  });

  it("carries Dot Ring's text and colors", () => {
    const ring = (customProps: Record<string, unknown>) =>
      withTemplateAsFrame(legacy({ templateId: "DotRing", customProps })).frame;
    // Its text went over the top, once
    expect(
      ring({
        customText: "Visit qrdx.dev",
        outerCircleColor: "#0f172a",
        textColor: "#fde047",
      }),
    ).toEqual({
      style: "dot-ring",
      text: "Visit qrdx.dev",
      secondaryText: "",
      color: "#0f172a",
      textColor: "#fde047",
    });
    // Along the bottom
    expect(ring({ customText: "Menu", textPosition: "bottom" })).toMatchObject({
      text: "",
      secondaryText: "Menu",
    });
    // A repeated phrase is the phrase, all round the ring
    expect(
      ring({ customText: "Read the docs * Read the docs *" }),
    ).toMatchObject({ text: "Read the docs", secondaryText: "" });
    expect(
      ring({ customText: "Read the docs *", textFill: "repeat" }),
    ).toMatchObject({ text: "Read the docs", secondaryText: "Read the docs" });
    // No text, no labels
    expect(ring({ customText: "" })).toMatchObject({
      text: "",
      secondaryText: "",
    });
    // Longer than a label: cut after the last whole word
    expect(
      ring({ customText: "Point your camera at the code to open the menu" })
        ?.text,
    ).toBe("Point your camera at the");
    // No settings: the frame's own default labels
    expect(ring({})).toEqual({ style: "dot-ring" });
    expect(
      withTemplateAsFrame(legacy({ templateId: "DotRing" })),
    ).not.toHaveProperty("customProps");
  });

  it("keeps the design's own frame when it has both, as the editor showed it", () => {
    const read = withTemplateAsFrame(
      legacy({
        templateId: "Arrow",
        frame: { style: "ticket", text: "Menu" },
      }),
    );
    expect(read).toEqual({ frame: { style: "ticket", text: "Menu" } });
    // A frame set to none is no frame: the template's frame shows
    expect(
      withTemplateAsFrame(
        legacy({ templateId: "Halloween", frame: { style: "none" } }),
      ).frame,
    ).toEqual({ style: "pumpkin" });
  });
});

describe("where saved designs are read", () => {
  it("draws the frame in the editor's preview and server renders", () => {
    const style = legacy({ templateId: "SquareBorder", fgColor: "#111827" });
    expect(editorCodeProps(style, "https://qrdx.dev").frame).toEqual({
      style: "square-border",
      color: "#111827",
    });
    const props = designQRProps("https://qrdx.dev", style, undefined);
    expect(props.frame).toEqual({ style: "square-border", color: "#111827" });
    expect(props).not.toHaveProperty("templateId");
  });

  it("starts the designer from the frame", () => {
    expect(fromThemeStyles(legacy({ templateId: "DotRing" })).frame).toEqual({
      style: "dot-ring",
    });
  });

  it("opens a playground link that still names a template with its frame", () => {
    // A link made before 0.0.64: "t" held the template
    const json = JSON.stringify({ f: "#111827", t: "Arrow" });
    const value = `1.${Buffer.from(json).toString("base64url")}`;
    const decoded = decodeStyleParam(value);
    expect(decoded?.styles).toEqual({
      fgColor: "#111827",
      frame: { style: "arrow", color: "#111827" },
    });
    // New links never write it
    const encoded = encodeStyleParam({ frame: { style: "dot-ring" } });
    expect(encoded?.value).toBeDefined();
    const again = JSON.parse(
      Buffer.from((encoded?.value ?? "").slice(2), "base64url").toString(
        "utf8",
      ),
    );
    expect(again).not.toHaveProperty("t");
  });
});

describe("requests that pass a template", () => {
  it("draw a style's templateId as nothing, without refusing the style", () => {
    const parsed = parseApiStyle({
      fgColor: "#111827",
      templateId: "Arrow",
      customProps: { customText: "x" },
    });
    expect(parsed).toEqual({ ok: true, style: { fgColor: "#111827" } });
  });
});
