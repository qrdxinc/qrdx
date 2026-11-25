// How a downloaded code looks (lib/analytics/download-look.ts), for
// qr_downloaded: the most distinctive part as `look` (shape > art > frame >
// logo > styled > plain), yes/no flags for every part, and ids from the
// engine's fixed lists. Never a color, the frame's text, a logo or content.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QRArt, QRSilhouette } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { defaultThemeState } from "@/config/qr";
import { downloadLookProps } from "@/lib/analytics/download-look";
import { sanitizeProps } from "@/lib/analytics/privacy";
import type { ThemeStyles } from "@/types/theme";

const root = join(import.meta.dirname, "../..");
const DEFAULT = defaultThemeState.styles;

/** A well-formed 1 × 1 art sample (4 RGBA bytes). */
const ART_IMAGE = { width: 1, height: 1, data: "AAAAAA==" };
const LOGO_ART: QRArt = { mode: "logo", image: ART_IMAGE };
const IMAGE_ART: QRArt = { mode: "halftone", image: ART_IMAGE };
const SILHOUETTE: QRSilhouette = {
  type: "silhouette",
  width: 8,
  height: 8,
  cells: "1".repeat(64),
};

const look = (style: Partial<ThemeStyles>) =>
  downloadLookProps({ ...DEFAULT, ...style });

const PLAIN = {
  look: "plain",
  has_frame: false,
  has_logo: false,
  has_art: false,
  has_shape: false,
  custom_colors: false,
  body_pattern: "circle",
};

describe("downloadLookProps: plain", () => {
  it("calls the playground's default look plain", () => {
    expect(downloadLookProps(DEFAULT)).toEqual(PLAIN);
  });

  it("reads unset parts as the default the engine draws", () => {
    expect(downloadLookProps({})).toEqual(PLAIN);
  });

  it("ignores how black and white are written", () => {
    expect(
      look({
        fgColor: "#000",
        bgColor: { type: "solid", color: "#FFFFFF" },
        eyeColor: "black",
        dotColor: "#000000ff",
      }),
    ).toEqual(PLAIN);
  });

  it("is still plain at another margin, level or size", () => {
    expect(look({ margin: 0, level: "H", size: 512 })).toEqual(PLAIN);
  });

  it("counts a withdrawn body pattern as the one it draws", () => {
    // "flower" was withdrawn and draws "circle"
    expect(
      look({ bodyPattern: "flower" as ThemeStyles["bodyPattern"] }),
    ).toEqual(PLAIN);
  });

  it("names an unknown body pattern other", () => {
    expect(
      look({ bodyPattern: "made-up" as ThemeStyles["bodyPattern"] }),
    ).toMatchObject({ look: "styled", body_pattern: "other" });
  });
});

describe("downloadLookProps: styled", () => {
  it("counts a solid color other than black on white", () => {
    expect(look({ fgColor: "#1d4ed8" })).toEqual({
      ...PLAIN,
      look: "styled",
      custom_colors: true,
    });
    expect(look({ bgColor: "#f5f5f5" })).toMatchObject({
      look: "styled",
      custom_colors: true,
    });
  });

  it("counts a gradient, a picture fill and per-eye colors", () => {
    // Even a gradient from black to black is a gradient someone chose
    const gradient: ThemeStyles["fgColor"] = {
      type: "linear",
      angle: 45,
      stops: [
        { color: "#000000", offset: 0 },
        { color: "#000000", offset: 100 },
      ],
    };
    expect(look({ fgColor: gradient }).custom_colors).toBe(true);
    expect(
      look({
        bgColor: {
          type: "image",
          src: "data:image/png;base64,AAAA",
          fit: "cover",
          scale: 1,
          position: "center",
          opacity: 1,
        },
      }).custom_colors,
    ).toBe(true);
    expect(
      look({ eyeColors: { topLeft: { outer: "#ef4444" } } }).custom_colors,
    ).toBe(true);
    expect(
      look({ eyeColors: { topLeft: { outer: "#000000" } } }).custom_colors,
    ).toBe(false);
  });

  it("counts other patterns and eyes, with the pattern's id", () => {
    expect(look({ bodyPattern: "square" })).toEqual({
      ...PLAIN,
      look: "styled",
      body_pattern: "square",
    });
    expect(look({ cornerEyePattern: "square" }).look).toBe("styled");
    expect(look({ cornerEyeDotPattern: "square" }).look).toBe("styled");
    expect(look({ eyeShapes: { topLeft: { outer: "square" } } }).look).toBe(
      "styled",
    );
  });

  it("counts the looks around the shapes, only when they draw something", () => {
    expect(look({ moduleScale: 0.8 }).look).toBe("styled");
    expect(look({ bgRadius: 0.1 }).look).toBe("styled");
    expect(look({ halo: { width: 0.2 } }).look).toBe("styled");
    expect(look({ shadow: { dx: 0.1, dy: 0.1 } }).look).toBe("styled");
    // Full-size modules, a square background and a shadow with no offset
    // draw the default
    expect(
      look({ moduleScale: 1, bgRadius: 0, shadow: { dx: 0, dy: 0 } }),
    ).toEqual(PLAIN);
  });
});

describe("downloadLookProps: features", () => {
  it("reports a frame and its style id, never its text", () => {
    const props = look({
      frame: {
        style: "banner-bottom",
        text: "Menu at Ada's",
        color: "#ff0000",
      },
    });
    expect(props).toEqual({
      ...PLAIN,
      look: "frame",
      has_frame: true,
      frame_style: "banner-bottom",
    });
    expect(JSON.stringify(props)).not.toMatch(/Ada|ff0000/);
  });

  it("doesn't count the none frame", () => {
    expect(look({ frame: { style: "none" } })).toEqual(PLAIN);
  });

  it("names a frame drawn from a spec custom", () => {
    const frame = {
      style: "custom",
      spec: {},
    } as unknown as ThemeStyles["frame"];
    expect(look({ frame })).toMatchObject({
      look: "frame",
      frame_style: "custom",
    });
  });

  it("reports a logo only when it is shown, never which one", () => {
    const customLogo = "https://example.com/brand/logo.png";
    const props = look({ showLogo: true, customLogo });
    expect(props).toEqual({ ...PLAIN, look: "logo", has_logo: true });
    expect(JSON.stringify(props)).not.toMatch(/example|logo\.png/);
    // QRdx's own logo when none was uploaded
    expect(look({ showLogo: true }).has_logo).toBe(true);
    expect(look({ showLogo: false, customLogo })).toEqual(PLAIN);
  });

  it("reports Logo QR and Image QR art by mode", () => {
    expect(look({ art: LOGO_ART })).toEqual({
      ...PLAIN,
      look: "art",
      has_art: true,
      art_mode: "logo",
    });
    expect(look({ art: IMAGE_ART })).toMatchObject({
      look: "art",
      art_mode: "halftone",
    });
  });

  it("doesn't count art whose image the engine can't draw", () => {
    const broken = {
      mode: "logo",
      image: { width: 2, height: 2, data: "AA==" },
    };
    expect(look({ art: broken as QRArt })).toEqual(PLAIN);
  });

  it("reports circle, heart and silhouette shapes", () => {
    expect(look({ shape: "circle" })).toEqual({
      ...PLAIN,
      look: "shape",
      has_shape: true,
      shape: "circle",
    });
    expect(look({ shape: "heart" }).shape).toBe("heart");
    expect(look({ silhouette: SILHOUETTE })).toMatchObject({
      look: "shape",
      shape: "silhouette",
    });
    // A silhouette wins over a named shape, as in the engine
    expect(look({ shape: "heart", silhouette: SILHOUETTE }).shape).toBe(
      "silhouette",
    );
    expect(look({ shape: "square" })).toEqual(PLAIN);
  });
});

describe("downloadLookProps: precedence", () => {
  const everything: Partial<ThemeStyles> = {
    shape: "circle",
    art: LOGO_ART,
    frame: { style: "polaroid" },
    showLogo: true,
    fgColor: "#1d4ed8",
    bodyPattern: "square",
  };

  it("names the most distinctive part: shape > art > frame > logo > styled", () => {
    expect(look(everything).look).toBe("shape");
    expect(look({ ...everything, shape: undefined }).look).toBe("art");
    expect(look({ ...everything, shape: undefined, art: undefined }).look).toBe(
      "frame",
    );
    expect(
      look({
        ...everything,
        shape: undefined,
        art: undefined,
        frame: undefined,
      }).look,
    ).toBe("logo");
    expect(
      look({
        ...everything,
        shape: undefined,
        art: undefined,
        frame: undefined,
        showLogo: false,
      }).look,
    ).toBe("styled");
  });

  it("keeps every part in the flags, whatever the look", () => {
    expect(look(everything)).toEqual({
      look: "shape",
      has_frame: true,
      has_logo: true,
      has_art: true,
      has_shape: true,
      custom_colors: true,
      body_pattern: "square",
      frame_style: "polaroid",
      art_mode: "logo",
      shape: "circle",
    });
  });
});

describe("downloadLookProps: privacy", () => {
  it("sends only flags and short ids, which all survive sanitizing", () => {
    const props = look({
      shape: "heart",
      art: IMAGE_ART,
      frame: { style: "banner-top-bottom", text: "Scan me" },
      showLogo: true,
      customLogo: "data:image/png;base64,AAAA",
      fgColor: "#123456",
    });
    for (const value of Object.values(props)) {
      expect(["boolean", "string"]).toContain(typeof value);
    }
    // Nothing dropped silently: every key and value gets through, with the
    // playground's signed_in beside them
    expect(sanitizeProps(props)).toEqual(props);
    expect(sanitizeProps({ signed_in: false })).toEqual({ signed_in: false });
    expect(JSON.stringify(props)).not.toMatch(/#|data:|Scan me|AAAA/);
  });

  it("is sent with every playground, type tool and saved code download", () => {
    for (const [file, calls] of [
      ["components/editor/action-bar/download-dialog.tsx", 1],
      ["components/sections/tools/type-generator.tsx", 1],
      ["app/(app)/dashboard/codes/_components/code-qr.tsx", 1],
    ] as const) {
      const source = readFileSync(join(root, file), "utf8");
      expect(
        source.match(/downloadLookProps\(/g)?.length,
        `${file} sends downloadLookProps`,
      ).toBe(calls);
    }
    // Both of the playground dialog's downloads (image file and print)
    const dialog = readFileSync(
      join(root, "components/editor/action-bar/download-dialog.tsx"),
      "utf8",
    );
    expect(dialog.match(/\.\.\.downloadedProps\(\)/g)).toHaveLength(2);
  });
});
