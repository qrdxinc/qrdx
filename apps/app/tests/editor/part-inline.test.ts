// The code's parts edited in the playground preview (components/editor/
// part-inline): which buttons go over the code and how they stack, and the
// Random buttons, which never repeat the part's current look, never pick
// a shape pair that doesn't scan, keep the background's contrast, and give
// the same picks for the same seed.
import {
  type AnyQRFrame,
  FRAME_TEXT_MAX_LENGTH,
  getContrastRatio,
  getScanContrast,
  getStylePairRisk,
  OFFICIAL_FRAMES,
} from "qrdx";
import { BODY_PATTERN } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { EYE_PRESETS } from "@/components/editor/control-sections/shape-catalog";
import {
  MENU_EDGE,
  MENU_MIN_HEIGHT,
  MENU_OFFSET,
  placeMenu,
  placeToolbarMenu,
} from "@/components/editor/frame-inline/menu-placement";
import type { Box } from "@/components/editor/frame-inline/preview-labels";
import { sheetMaxHeight } from "@/components/editor/part-inline/part-sheet";
import {
  anchorOf,
  BACKGROUND_REACH,
  type MeasuredParts,
  NO_PARTS,
  PART_LAYER,
  partAt,
  partTargets,
  toolbarAnchor,
  unionBox,
} from "@/components/editor/part-inline/part-targets";
import {
  BACKGROUND_SWATCHES,
  backgroundPasses,
  pickOne,
  RANDOM_FRAME_STYLES,
  randomBackground,
  randomDots,
  randomEyes,
  randomFrame,
  randomLogoIcon,
} from "@/components/editor/part-inline/random-part";
import { previewEditors } from "@/components/editor/preview-editors";
import { defaultThemeState } from "@/config/qr";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import type { QRStyle } from "@/types/theme";

/** A small seeded generator (mulberry32), so picks repeat run to run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
const base: QRStyle = { ...defaultThemeState.styles };

const blocked = (style: Partial<QRStyle>) => {
  const kind = getStylePairRisk({
    bodyPattern: style.bodyPattern,
    cornerEyePattern: style.cornerEyePattern,
    cornerEyeDotPattern: style.cornerEyeDotPattern,
  })?.kind;
  return kind === "body-eye" || kind === "dot-eye";
};

describe("pickOne", () => {
  it("stays inside the list for any random number", () => {
    const items = ["a", "b", "c"];
    for (const value of [0, 0.2, 0.5, 0.99, 0.999_999_999, 1]) {
      expect(items).toContain(pickOne(items, () => value));
    }
    expect(pickOne([], Math.random)).toBeNull();
  });
});

describe("Random eyes", () => {
  it.each(BODY_PATTERN)(
    "with %s dots: another pair from the catalogue, one that scans",
    (bodyPattern) => {
      for (const preset of EYE_PRESETS) {
        const style: QRStyle = {
          ...base,
          bodyPattern,
          cornerEyePattern: preset.outer,
          cornerEyeDotPattern: preset.centre,
        };
        for (const seed of SEEDS.slice(0, 6)) {
          const next = randomEyes(style, seeded(seed));
          expect(next).not.toBeNull();
          if (!next) continue;
          expect(
            next.cornerEyePattern === style.cornerEyePattern &&
              next.cornerEyeDotPattern === style.cornerEyeDotPattern,
          ).toBe(false);
          expect(
            EYE_PRESETS.some(
              (item) =>
                item.outer === next.cornerEyePattern &&
                item.centre === next.cornerEyeDotPattern,
            ),
          ).toBe(true);
          expect(blocked({ ...style, ...next })).toBe(false);
        }
      }
    },
  );

  it("changes the shapes only", () => {
    const style: QRStyle = {
      ...base,
      eyeColor: "#9b2c2c",
      dotColor: "#0b3c5d",
    };
    expect(Object.keys(randomEyes(style, seeded(3)) ?? {}).sort()).toEqual([
      "cornerEyeDotPattern",
      "cornerEyePattern",
    ]);
  });

  it("is the same for the same seed, and varies across seeds", () => {
    const picks = SEEDS.map((seed) => randomEyes(base, seeded(seed)));
    expect(SEEDS.map((seed) => randomEyes(base, seeded(seed)))).toEqual(picks);
    expect(
      new Set(picks.map((pick) => JSON.stringify(pick))).size,
    ).toBeGreaterThan(3);
  });
});

describe("Random dots", () => {
  it.each(EYE_PRESETS.map((preset) => [preset.id, preset] as const))(
    "with %s eyes: another pattern, one that scans",
    (_id, preset) => {
      for (const bodyPattern of BODY_PATTERN) {
        const style: QRStyle = {
          ...base,
          bodyPattern,
          cornerEyePattern: preset.outer,
          cornerEyeDotPattern: preset.centre,
        };
        for (const seed of SEEDS.slice(0, 4)) {
          const next = randomDots(style, seeded(seed));
          expect(next).not.toBeNull();
          if (!next) continue;
          expect(next.bodyPattern).not.toBe(bodyPattern);
          expect(BODY_PATTERN).toContain(next.bodyPattern);
          expect(blocked({ ...style, ...next })).toBe(false);
        }
      }
    },
  );

  it("is the same for the same seed", () => {
    for (const seed of SEEDS) {
      expect(randomDots(base, seeded(seed))).toEqual(
        randomDots(base, seeded(seed)),
      );
    }
  });
});

describe("Random logo", () => {
  it("another quick icon, never the one shown", () => {
    for (const current of [null, ...LOGO_ICON_IDS]) {
      for (const seed of SEEDS) {
        const next = randomLogoIcon(current, seeded(seed));
        expect(LOGO_ICON_IDS).toContain(next);
        expect(next).not.toBe(current);
      }
    }
  });

  it("is the same for the same seed", () => {
    expect(SEEDS.map((seed) => randomLogoIcon("wifi", seeded(seed)))).toEqual(
      SEEDS.map((seed) => randomLogoIcon("wifi", seeded(seed))),
    );
  });
});

describe("Random background", () => {
  const designs: [string, QRStyle][] = [
    ["black on white", base],
    [
      "colored code",
      {
        ...base,
        fgColor: "#0b3c5d",
        eyeColor: "#0a5c8a",
        dotColor: "#9b2c2c",
        bgColor: "#f1f8fc",
      },
    ],
    [
      "gradient dots",
      {
        ...base,
        fgColor: {
          type: "linear",
          angle: 45,
          stops: [
            { color: "#1c2541", offset: 0 },
            { color: "#5c1a3c", offset: 100 },
          ],
        },
      },
    ],
    [
      "per-eye colors",
      {
        ...base,
        eyeColors: { topRight: { outer: "#2d6a4f", inner: "#7a2e0e" } },
      },
    ],
    [
      "light code on dark",
      {
        ...base,
        fgColor: "#f5f5f4",
        eyeColor: "#f5f5f4",
        dotColor: "#f5f5f4",
        bgColor: "#0c0c0d",
      },
    ],
  ];

  it.each(designs)(
    "%s: another color the contrast checks pass",
    (_n, style) => {
      for (const seed of SEEDS) {
        const next = randomBackground(style, seeded(seed));
        expect(next).not.toBeNull();
        if (!next) continue;
        const color = next.bgColor as string;
        expect(BACKGROUND_SWATCHES).toContain(color);
        expect(color).not.toBe(style.bgColor);
        // The contrast checker: 4.5:1 against every color the code uses
        for (const code of [
          style.fgColor,
          style.eyeColor,
          style.dotColor,
          style.eyeColors?.topRight?.outer,
          style.eyeColors?.topRight?.inner,
        ]) {
          if (typeof code !== "string") continue;
          expect(getContrastRatio(code, color)).toBeGreaterThanOrEqual(4.5);
        }
        // The scan score's check, and no flip between dark-on-light and back
        const scan = getScanContrast({
          value: "qrdx.dev",
          ...style,
          bgColor: color,
        });
        expect(scan.ratio).toBeGreaterThanOrEqual(scan.required);
        const before = getScanContrast({ value: "qrdx.dev", ...style });
        expect(scan.inverted).toBe(before.inverted);
      }
    },
  );

  it("a light code on dark gets another dark background", () => {
    const [, style] = designs[designs.length - 1] as [string, QRStyle];
    for (const seed of SEEDS) {
      const color = randomBackground(style, seeded(seed))?.bgColor as string;
      expect(getContrastRatio(color, "#000000")).toBeLessThan(
        getContrastRatio(color, "#ffffff"),
      );
    }
  });

  it("nothing when no swatch can pass (a mid gray code)", () => {
    const gray: QRStyle = {
      ...base,
      fgColor: "#808080",
      eyeColor: "#808080",
      dotColor: "#808080",
    };
    expect(BACKGROUND_SWATCHES.some((c) => backgroundPasses(gray, c))).toBe(
      false,
    );
    expect(randomBackground(gray, seeded(1))).toBeNull();
  });

  it("is the same for the same seed", () => {
    expect(SEEDS.map((seed) => randomBackground(base, seeded(seed)))).toEqual(
      SEEDS.map((seed) => randomBackground(base, seeded(seed))),
    );
  });
});

describe("Random frame", () => {
  const banner: AnyQRFrame = {
    style: "banner-bottom",
    text: "Menu inside",
    color: "#1c2541",
    fontScale: 1.1,
  };

  it("another built-in style that keeps the text, colors and size", () => {
    for (const seed of SEEDS) {
      const next = randomFrame(banner, seeded(seed));
      if (next.style === "custom") continue;
      expect(next.style).not.toBe("banner-bottom");
      expect(RANDOM_FRAME_STYLES).toContain(next.style);
      expect(next.text).toBe("Menu inside");
      expect(next.color).toBe("#1c2541");
      expect(next.fontScale).toBe(1.1);
    }
  });

  it("a ready-made frame's main label carries over", () => {
    const official = OFFICIAL_FRAMES.find((frame) =>
      frame.spec.labels.some((label) => label.slot === "primary"),
    );
    expect(official).toBeDefined();
    if (!official) return;
    const primary = official.spec.labels.find(
      (label) => label.slot === "primary",
    );
    const next = randomFrame(
      { style: "custom", spec: official.spec },
      seeded(7),
    );
    expect(next.style).not.toBe("custom");
    expect(next.text).toBe(primary?.text);
    expect((next.text ?? "").length).toBeLessThanOrEqual(FRAME_TEXT_MAX_LENGTH);
  });

  it("brings a frame back when None was picked, with its text", () => {
    for (const seed of SEEDS) {
      const next = randomFrame(
        { style: "none", text: "Scan for the menu" },
        seeded(seed),
      );
      expect(RANDOM_FRAME_STYLES).toContain(next.style);
      expect(next.text).toBe("Scan for the menu");
      expect(RANDOM_FRAME_STYLES).toContain(
        randomFrame(undefined, seeded(seed)).style,
      );
    }
  });

  it("is the same for the same seed", () => {
    expect(SEEDS.map((seed) => randomFrame(banner, seeded(seed)))).toEqual(
      SEEDS.map((seed) => randomFrame(banner, seeded(seed))),
    );
  });
});

// ── Buttons over the code ───────────────────────────────────────────────────

const box = (left: number, top: number, size: number): Box => ({
  left,
  top,
  width: size,
  height: size,
});

/** A 300px code at (100, 100) inside a framed artwork. */
const MEASURED: MeasuredParts = {
  eyes: [box(100, 100, 60), box(340, 100, 60), box(100, 340, 60)],
  symbol: box(100, 100, 300),
  dots: box(100, 100, 300),
  logo: box(220, 220, 60),
  background: box(100, 100, 300),
  artwork: { left: 80, top: 80, width: 340, height: 420 },
};

describe("the preview's inline editors", () => {
  it("none on the blurred sample, frame text or not", () => {
    for (const frameActive of [false, true]) {
      expect(previewEditors({ hasContent: false, frameActive })).toEqual({
        parts: false,
        frameText: false,
      });
    }
  });

  it("with content: the parts always, frame text when a frame is on", () => {
    expect(previewEditors({ hasContent: true, frameActive: false })).toEqual({
      parts: true,
      frameText: false,
    });
    expect(previewEditors({ hasContent: true, frameActive: true })).toEqual({
      parts: true,
      frameText: true,
    });
  });
});

describe("part buttons", () => {
  it("come in Tab order: eyes, dots, logo, background, frame", () => {
    expect(
      partTargets(MEASURED, { frame: true }).map((target) => target.part),
    ).toEqual(["eyes", "dots", "logo", "background", "frame"]);
  });

  it("stack the frame under the background, under the dots, under the logo and eyes", () => {
    expect(PART_LAYER.frame).toBeLessThan(PART_LAYER.background);
    expect(PART_LAYER.background).toBeLessThan(PART_LAYER.dots);
    expect(PART_LAYER.dots).toBeLessThan(PART_LAYER.logo);
    expect(PART_LAYER.dots).toBeLessThan(PART_LAYER.eyes);
  });

  it("only for what's drawn: no logo shown, no frame on", () => {
    const parts = partTargets(
      { ...MEASURED, logo: null },
      { frame: false },
    ).map((target) => target.part);
    expect(parts).toEqual(["eyes", "dots", "background"]);
    expect(partTargets(NO_PARTS, { frame: true })).toEqual([]);
  });

  it("three buttons for the eyes; the background reaches past the code", () => {
    const targets = partTargets(MEASURED, { frame: true });
    expect(targets.find((target) => target.part === "eyes")?.boxes).toEqual(
      MEASURED.eyes,
    );
    const background = targets.find((target) => target.part === "background");
    expect(background?.boxes[0]).toEqual({
      left: 100 - BACKGROUND_REACH,
      top: 100 - BACKGROUND_REACH,
      width: 300 + 2 * BACKGROUND_REACH,
      height: 300 + 2 * BACKGROUND_REACH,
    });
  });

  it("a click lands on the part on top", () => {
    const targets = partTargets(MEASURED, { frame: true });
    expect(partAt(targets, 120, 120)).toBe("eyes");
    expect(partAt(targets, 370, 120)).toBe("eyes");
    expect(partAt(targets, 250, 250)).toBe("logo");
    expect(partAt(targets, 200, 300)).toBe("dots");
    // Just outside the code: the background's strip, then the frame
    expect(partAt(targets, 100 - BACKGROUND_REACH / 2, 250)).toBe("background");
    expect(partAt(targets, 250, 480)).toBe("frame");
    expect(partAt(targets, 10, 10)).toBeNull();
  });

  it("anchors the toolbar around the whole part", () => {
    expect(anchorOf("eyes", MEASURED)).toEqual(unionBox(MEASURED.eyes));
    expect(anchorOf("eyes", MEASURED)).toEqual(box(100, 100, 300));
    expect(anchorOf("logo", MEASURED)).toEqual(MEASURED.logo);
    expect(anchorOf("frame", MEASURED)).toEqual(MEASURED.artwork);
    expect(anchorOf("logo", { ...MEASURED, logo: null })).toBeNull();
  });

  it("puts the toolbar off the code, lined up with the part", () => {
    const menu = { width: 240, height: 40 };
    const bounds = { width: 1000, height: 700 };
    // The artwork leaves room above it
    const artwork = { left: 300, top: 120, width: 400, height: 400 };
    for (const part of [
      box(320, 140, 60), // top-left eye
      box(470, 290, 60), // logo, dead centre
      box(320, 440, 60), // bottom-left eye
    ]) {
      const placed = placeMenu(
        menu,
        toolbarAnchor(part, artwork),
        artwork,
        bounds,
      );
      expect(placed.top + menu.height).toBeLessThanOrEqual(artwork.top);
      expect(placed.above).toBe(true);
      // Centred on the part, inside the preview
      expect(placed.left).toBe(
        Math.max(8, part.left + part.width / 2 - menu.width / 2),
      );
    }
    expect(toolbarAnchor(box(1, 2, 3), null)).toEqual(box(1, 2, 3));
  });
});

describe("where a toolbar's menu opens (placeToolbarMenu)", () => {
  type R = { left: number; top: number; right: number; bottom: number };
  const viewport = { width: 1440, height: 1000 };
  // A toolbar button above a code in the middle of a wide preview
  const trigger = { left: 900, top: 330, right: 932, bottom: 358 };
  const code = { left: 600, top: 380, right: 1100, bottom: 880 };
  // The same code in a frame, drawn further to the right than to the left
  const framed = { left: 560, top: 300, right: 1160, bottom: 980 };
  const farRoom = Math.floor(trigger.top - MENU_OFFSET - MENU_EDGE) - 1;
  const alignOffset = code.top - trigger.top;
  const downward =
    Math.floor(viewport.height - trigger.top - alignOffset - MENU_EDGE) - 1;
  const place = (
    menu: { width: number; height: number },
    {
      over = code,
      artwork = over,
      button = trigger,
      far = "top",
      screen = viewport,
    }: {
      over?: R;
      artwork?: R;
      button?: R;
      far?: "top" | "bottom";
      screen?: { width: number; height: number };
    } = {},
  ) =>
    placeToolbarMenu({
      menu,
      trigger: button,
      avoid: { code: over, artwork },
      viewport: screen,
      far,
    });
  /** Where a placed menu lands across, from its button and offset */
  const across = (
    placed: ReturnType<typeof placeToolbarMenu>,
    button: R,
    width: number,
  ) =>
    placed.side === "right"
      ? {
          left: button.right + placed.offset,
          right: button.right + placed.offset + width,
        }
      : {
          left: button.left - placed.offset - width,
          right: button.left - placed.offset,
        };

  it("on the far side when the whole menu fits there", () => {
    expect(place({ width: 300, height: farRoom })).toEqual({
      side: "top",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: farRoom,
    });
  });

  it("beside the artwork, on the side with more room, when too tall for the far side", () => {
    // The frame leaves 552 px on the left and 272 px on the right
    const left = place({ width: 300, height: 600 }, { artwork: framed });
    expect(left).toEqual({
      side: "left",
      align: "start",
      offset: trigger.left - framed.left + MENU_OFFSET,
      alignOffset,
      maxHeight: downward,
    });
    expect(across(left, trigger, 300).right).toBeLessThan(framed.left);
    // Mirrored, the right has more room
    const mirrored = { ...framed, left: 280, right: 880 };
    const right = place({ width: 200, height: 600 }, { artwork: mirrored });
    expect(right.side).toBe("right");
    expect(right.align).toBe("start");
    expect(across(right, trigger, 200).left).toBeGreaterThan(mirrored.right);
    // The side the code alone would pick (the right) isn't used for a frame
    expect(place({ width: 250, height: 600 }).side).toBe("left");
  });

  it("never covers the artwork while a gap beside it takes the menu", () => {
    const width = 300;
    for (let left = 20; left <= 1100; left += 40) {
      for (const size of [300, 500, 700]) {
        const artwork = {
          left,
          top: 300,
          right: left + size,
          bottom: 300 + size,
        };
        const button = {
          left: left + size / 2 - 16,
          top: 330,
          right: left + size / 2 + 16,
          bottom: 358,
        };
        const placed = place(
          { width, height: 600 },
          { over: code, artwork, button },
        );
        const gap = Math.max(
          viewport.width - MENU_EDGE - MENU_OFFSET - artwork.right,
          artwork.left - MENU_OFFSET - MENU_EDGE,
        );
        if (gap - 1 > width) {
          expect(["left", "right"]).toContain(placed.side);
        }
        if (placed.side === "left" || placed.side === "right") {
          const menu = across(placed, button, width);
          expect(menu.right <= artwork.left || menu.left >= artwork.right).toBe(
            true,
          );
          expect(menu.left).toBeGreaterThanOrEqual(MENU_EDGE);
          expect(menu.right).toBeLessThanOrEqual(viewport.width - MENU_EDGE);
          expect(placed.maxHeight).toBeGreaterThanOrEqual(MENU_MIN_HEIGHT);
        }
      }
    }
  });

  it("grows upward from the button's bottom when the toolbar is under the code", () => {
    const below = { left: 900, top: 900, right: 932, bottom: 928 };
    expect(
      place({ width: 300, height: 600 }, { button: below, far: "bottom" }),
    ).toEqual({
      side: "left",
      align: "end",
      offset: below.left - code.left + MENU_OFFSET,
      alignOffset: 0,
      maxHeight: Math.floor(below.bottom - MENU_EDGE) - 1,
    });
  });

  it("isn't put beside the artwork with less than MENU_MIN_HEIGHT to grow in", () => {
    // Under the toolbar, the code starts just above the fold
    const screen = { width: 1024, height: 600 };
    const low = { left: 620, top: 520, right: 648, bottom: 548 };
    const lowCode = { left: 456, top: 560, right: 756, bottom: 860 };
    const lowFar = Math.floor(low.top - MENU_OFFSET - MENU_EDGE) - 1;
    expect(
      place(
        { width: 300, height: 550 },
        { over: lowCode, button: low, screen },
      ),
    ).toEqual({
      side: "top",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: lowFar,
    });
    // Over the toolbar, the button is near the viewport's top
    const high = { left: 900, top: 40, right: 932, bottom: 68 };
    const highFar =
      Math.floor(viewport.height - high.bottom - MENU_OFFSET - MENU_EDGE) - 1;
    expect(
      place({ width: 300, height: 950 }, { button: high, far: "bottom" }),
    ).toEqual({
      side: "bottom",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: highFar,
    });
  });

  it("scrolls on the far side when neither side of the artwork has room", () => {
    const wide = { left: 100, top: 380, right: 1340, bottom: 880 };
    expect(place({ width: 300, height: 600 }, { over: wide })).toEqual({
      side: "top",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: farRoom,
    });
    // A frame around a code that alone would leave room
    expect(place({ width: 300, height: 600 }, { artwork: wide }).side).toBe(
      "top",
    );
    // Below the toolbar the same way
    const below = { left: 900, top: 572, right: 932, bottom: 600 };
    const room =
      Math.floor(viewport.height - below.bottom - MENU_OFFSET - MENU_EDGE) - 1;
    expect(room).toBeGreaterThanOrEqual(MENU_MIN_HEIGHT);
    expect(
      place(
        { width: 300, height: 600 },
        { over: wide, button: below, far: "bottom" },
      ),
    ).toEqual({
      side: "bottom",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: room,
    });
  });

  it("finds its own place only when the far side is too short to scroll in", () => {
    const wide = { left: 100, top: 120, right: 1340, bottom: 620 };
    const high = { left: 900, top: 70, right: 932, bottom: 98 };
    expect(
      place({ width: 300, height: 600 }, { over: wide, button: high }),
    ).toEqual({
      side: "top",
      align: "center",
      offset: MENU_OFFSET,
      alignOffset: 0,
      maxHeight: null,
    });
  });

  it("gives a sensible place in the review's cases", () => {
    const r = (left: number, top: number, w: number, h: number) => ({
      left,
      top,
      right: left + w,
      bottom: top + h,
    });
    const cases = [
      // 1024x768: the toolbar under the code, near the viewport's bottom
      {
        menu: { width: 311, height: 339 },
        button: r(620, 690, 28, 28),
        over: r(456, 330, 300, 340),
        screen: { width: 1024, height: 768 },
        far: "bottom" as const,
      },
      // 1024x600: the code mostly below the fold
      {
        menu: { width: 311, height: 339 },
        button: r(620, 520, 28, 28),
        over: r(456, 560, 300, 300),
        screen: { width: 1024, height: 600 },
        far: "top" as const,
      },
      // A menu taller than the viewport, no room beside the code
      {
        menu: { width: 346, height: 900 },
        button: r(300, 200, 28, 28),
        over: r(120, 240, 500, 500),
        screen: { width: 700, height: 800 },
        far: "top" as const,
      },
    ];
    const placed = cases.map(({ menu, ...rest }) => place(menu, rest));
    for (const result of placed) {
      if (result.maxHeight !== null) {
        expect(result.maxHeight).toBeGreaterThanOrEqual(MENU_MIN_HEIGHT);
      }
    }
    // Up beside the code's left, the room above the button's bottom
    expect(placed[0]).toEqual({
      side: "left",
      align: "end",
      offset: 620 - 456 + MENU_OFFSET,
      alignOffset: 0,
      maxHeight: Math.floor(718 - MENU_EDGE) - 1,
    });
    expect(across(placed[0], cases[0].button, 311).left).toBeGreaterThanOrEqual(
      MENU_EDGE,
    );
    // Fits above the toolbar
    expect(placed[1]).toMatchObject({ side: "top", maxHeight: 499 });
    // Scrolls above the toolbar
    expect(placed[2]).toMatchObject({ side: "top", maxHeight: 179 });
  });
});

describe("the phone sheet stops above the scan score (sheetMaxHeight)", () => {
  it("up to 56% of the screen, short of the badge, never under 40%", () => {
    expect(sheetMaxHeight(844, null)).toBeCloseTo(844 * 0.56);
    // The badge's bottom at 380: the sheet starts 8px below it
    expect(sheetMaxHeight(844, 380)).toBe(844 - 380 - 8);
    // A badge low on the screen: the sheet keeps 40%
    expect(sheetMaxHeight(844, 700)).toBeCloseTo(844 * 0.4);
    // A badge high up: the usual 56%
    expect(sheetMaxHeight(844, 200)).toBeCloseTo(844 * 0.56);
  });
});
