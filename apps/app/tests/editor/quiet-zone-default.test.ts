// New designs start with a 2-module quiet zone (owner, 23 Nov 2026). QRdx's
// scan study (scripts/scan-study) found that codes with no light margin
// printed onto a dark surface or a busy pattern were read in 0–70% of
// captures, and one module of margin brought every decoder to 98% or more;
// the editor's default had none. What changes and what doesn't:
// - a new design (the editor's first state, Reset to the default look, a
//   built-in preset, a community or AI theme, a `style` link without a
//   margin) gets NEW_DESIGN_MARGIN;
// - a design that already exists (a saved code or theme, a link that sets
//   margin 0, the design in the editor) keeps the margin it has, and the
//   controls show it as drawn;
// - the engine's own default stays 0.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { DEFAULT_SIZE, QUIET_ZONE_MIN, toSVGString } from "qrdx";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The editor persists to window.localStorage, which Node doesn't have; the
// sign-in dialog reads the page's path for analytics.
vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    location: {
      origin: "https://qrdx.dev",
      href: "https://qrdx.dev/playground",
      pathname: "/playground",
    },
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});

// Server actions: mocked, so nothing reaches a database.
vi.mock("@/actions/qr-themes", () => ({
  getThemes: vi.fn(),
  getTheme: vi.fn(),
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
}));
vi.mock("@/actions/community", () => ({ toggleCommunityLike: vi.fn() }));
vi.mock("@/actions/community-themes", () => ({
  getCommunityThemes: vi.fn(),
  getCommunityTagCounts: vi.fn(),
  getMyPublishedThemeIds: vi.fn(),
  publishTheme: vi.fn(),
  toggleLikeTheme: vi.fn(),
  unpublishTheme: vi.fn(),
  updateCommunityThemeTags: vi.fn(),
}));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
vi.mock("@repo/analytics", () => ({ track: vi.fn() }));

const { defaultThemeState, NEW_DESIGN_MARGIN, storedStyleDefaults } =
  await import("@/config/qr");
const { useQREditorStore } = await import("@/store/editor-store");
const { useThemePresetStore } = await import("@/store/theme-preset-store");
const { getPresetThemeStyles } = await import("@/utils/qr-presets-helper");
const { mergeThemeStylesWithDefaults } = await import("@/utils/theme-styles");
const { communityLook } = await import("@/components/editor/community-sheet");
const { themeChoices, themeLook } = await import(
  "@/components/code-builder/builder-style"
);
const { heroLook, HERO_FRAMES, HERO_STYLES } = await import(
  "@/components/sections/home/hero-looks"
);
const { applyPlaygroundParams } = await import("@/lib/playground-apply");
const { parsePlaygroundParams } = await import("@/lib/playground-links");
const { decodeStyleParam, encodeStyleParam } = await import(
  "@/lib/playground-style"
);
const { scoreDesign } = await import("@/lib/qr-design/score");

import type { SavedTheme } from "@/app/(app)/dashboard/themes/_lib/theme";
import type { ApplyContext } from "@/lib/playground-apply";
import en from "@/messages/en.json";
import type { QRStyle } from "@/types/theme";

afterAll(() => {
  vi.unstubAllGlobals();
});

const editor = () => useQREditorStore.getState();

/** A built-in preset's look with no margin of its own. */
const NO_MARGIN_PRESET = "testNoMargin";
const NO_MARGIN_LOOK: QRStyle = {
  bgColor: "#fef3c7",
  fgColor: "#451a03",
  eyeColor: "#451a03",
  dotColor: "#451a03",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "square",
  level: "Q",
};

const context = (): ApplyContext => ({
  themePath: false,
  signedIn: false,
  aiAvailable: true,
  isBuiltInPreset: (id) => id === "classic" || id === NO_MARGIN_PRESET,
  presetLabel: (id) => id,
  dynamicLink: { get: () => null, unlink: () => {}, link: () => {} },
});

const openLink = (style: QRStyle) => {
  const encoded = encodeStyleParam(style);
  if (!encoded) throw new Error("nothing to encode");
  const url = new URL(
    `/playground?style=${encodeURIComponent(encoded.value)}`,
    "https://qrdx.dev",
  );
  return applyPlaygroundParams(
    parsePlaygroundParams(url.search, url.hash),
    context(),
  );
};

/** A design from before new designs had a margin: the old default look. */
const { margin: _margin, ...OLD_DEFAULT } = defaultThemeState.styles;

beforeEach(() => {
  useQREditorStore.setState({
    themeState: defaultThemeState,
    themeCheckpoint: null,
    history: [],
    future: [],
    contentType: "url",
    value: "",
    contentConfigs: {},
  });
  useThemePresetStore.getState().registerPreset(NO_MARGIN_PRESET, {
    label: "No margin",
    styles: NO_MARGIN_LOOK,
  });
});

describe("a new design", () => {
  it("starts with a 2-module margin, the scan score's minimum", () => {
    expect(NEW_DESIGN_MARGIN).toBe(2);
    expect(NEW_DESIGN_MARGIN).toBeGreaterThanOrEqual(QUIET_ZONE_MIN);
    expect(defaultThemeState.styles.margin).toBe(NEW_DESIGN_MARGIN);
    expect(useQREditorStore.getInitialState().themeState.styles.margin).toBe(
      NEW_DESIGN_MARGIN,
    );
  });

  it("gets it back from Reset to the default look", () => {
    useQREditorStore.setState({
      themeState: {
        preset: "default",
        styles: { ...defaultThemeState.styles, margin: 0 },
      },
    });
    expect(editor().hasUnsavedChanges()).toBe(true);
    editor().resetToCurrentPreset();
    expect(editor().themeState.styles.margin).toBe(NEW_DESIGN_MARGIN);
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it("is what the editor's server snapshot image shows", () => {
    // public/images/editor/sample-qr.svg: the default look encoding
    // https://qrdx.dev, drawn by the engine (no-op rotations left out).
    const drawn = toSVGString({
      ...defaultThemeState.styles,
      value: "https://qrdx.dev",
      size: 512,
    }).replace(/ transform="rotate\(0,[\d.]+,[\d.]+\)"/g, "");
    const file = readFileSync(
      path.join(__dirname, "../../public/images/editor/sample-qr.svg"),
      "utf8",
    );
    expect(file).toBe(drawn);
  });

  it("starts there on the home page's editor too, in every look", () => {
    for (const style of Object.keys(HERO_STYLES)) {
      for (const frame of Object.keys(HERO_FRAMES)) {
        expect(
          heroLook(
            style as keyof typeof HERO_STYLES,
            frame as keyof typeof HERO_FRAMES,
          ).margin,
        ).toBe(NEW_DESIGN_MARGIN);
      }
    }
  });

  it("keeps the engine's own default at 0, for laid-out components", () => {
    // DEFAULT_MARGIN isn't exported; an SVG drawn without `margin` puts the
    // first module at the very edge.
    const svg = toSVGString({
      value: "https://qrdx.dev",
      size: DEFAULT_SIZE,
      bodyPattern: "square",
    });
    const withTwo = toSVGString({
      value: "https://qrdx.dev",
      size: DEFAULT_SIZE,
      bodyPattern: "square",
      margin: 2,
    });
    expect(svg).not.toBe(withTwo);
    expect(svg).toBe(
      toSVGString({
        value: "https://qrdx.dev",
        size: DEFAULT_SIZE,
        bodyPattern: "square",
        margin: 0,
      }),
    );
  });
});

describe("applying a look that sets no margin", () => {
  it("a built-in preset gets the new-design margin, not 0", () => {
    expect(NO_MARGIN_LOOK.margin).toBeUndefined();
    useQREditorStore.setState({
      themeState: { styles: { ...defaultThemeState.styles, margin: 0 } },
    });
    editor().applyThemePreset(NO_MARGIN_PRESET);
    expect(editor().themeState.styles.margin).toBe(NEW_DESIGN_MARGIN);
    expect(editor().themeState.styles.bgColor).toBe(NO_MARGIN_LOOK.bgColor);
    // Reset and the unsaved-changes check agree with what was applied
    expect(editor().hasUnsavedChanges()).toBe(false);
  });

  it("a preset with its own margin keeps it", () => {
    const classic = getPresetThemeStyles("classic");
    expect(classic.margin).toBe(4);
    editor().applyThemePreset("classic");
    expect(editor().themeState.styles.margin).toBe(4);
  });

  it("a saved theme keeps its own margin, none when it has none", () => {
    useThemePresetStore.getState().registerPreset("saved-1", {
      label: "Mine",
      styles: NO_MARGIN_LOOK,
      source: "SAVED",
    });
    expect(getPresetThemeStyles("saved-1").margin).toBeUndefined();
    useThemePresetStore.getState().unregisterPreset("saved-1");
  });

  it("a community theme or an AI theme gets it too; their own 0 stays", () => {
    const look = communityLook(editor().themeState, NO_MARGIN_LOOK);
    expect(look.styles.margin).toBe(NEW_DESIGN_MARGIN);
    expect(
      communityLook(editor().themeState, { ...NO_MARGIN_LOOK, margin: 0 })
        .styles.margin,
    ).toBe(0);
    expect(mergeThemeStylesWithDefaults(NO_MARGIN_LOOK).margin).toBe(
      NEW_DESIGN_MARGIN,
    );
  });
});

describe("a shared `style` link", () => {
  it("keeps an explicit margin of 0", () => {
    const style = { ...defaultThemeState.styles, margin: 0 };
    expect(
      decodeStyleParam(encodeStyleParam(style)?.value)?.styles.margin,
    ).toBe(0);
    openLink(style);
    expect(editor().themeState.styles.margin).toBe(0);
  });

  it("without a margin gets the default, as every field it leaves out does", () => {
    const { bodyPattern: _body, ...linked } = OLD_DEFAULT;
    useQREditorStore.setState({
      themeState: { styles: { ...defaultThemeState.styles, margin: 4 } },
    });
    openLink({ ...linked, fgColor: "#123456" });
    expect(editor().themeState.styles.margin).toBe(NEW_DESIGN_MARGIN);
    expect(editor().themeState.styles.bodyPattern).toBe(
      defaultThemeState.styles.bodyPattern,
    );
  });

  it("over the old default look doesn't count as replacing a design", () => {
    useQREditorStore.setState({ themeState: { styles: OLD_DEFAULT } });
    const outcome = openLink({
      ...defaultThemeState.styles,
      fgColor: "#123456",
    });
    expect(outcome.replaced).toBe(false);
  });
});

describe("a design that already exists", () => {
  it("fills in missing fields without adding a margin", () => {
    expect(storedStyleDefaults).not.toHaveProperty("margin");
    expect({ ...storedStyleDefaults, margin: NEW_DESIGN_MARGIN }).toEqual(
      defaultThemeState.styles,
    );
  });

  it("keeps its margin in the code builder; built-in choices carry the default", () => {
    expect(themeLook(NO_MARGIN_LOOK).margin).toBeUndefined();
    expect(themeLook({ ...NO_MARGIN_LOOK, margin: 0 }).margin).toBe(0);
    const saved = {
      id: "t1",
      name: "Mine",
      style: NO_MARGIN_LOOK,
      isActiveDefault: false,
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
    } as unknown as SavedTheme;
    const choices = themeChoices([saved]);
    expect(choices.find((c) => c.id === "t1")?.style.margin).toBeUndefined();
    for (const choice of choices.filter((c) => c.id.startsWith("built-in:"))) {
      expect(choice.style.margin, choice.id).toBeGreaterThanOrEqual(
        NEW_DESIGN_MARGIN,
      );
    }
  });
});

describe("the print size FAQ's quiet zone answer", () => {
  const translate = () => {
    const errors: string[] = [];
    const t = createTranslator({
      locale: "en",
      messages: en as never,
      namespace: "tools.printSize.faq" as never,
      onError: (error) => errors.push(error.message),
    }) as unknown as (key: string, values?: Record<string, number>) => string;
    return { t, errors };
  };

  // The site's copy of the page (qrdxinc/cloud apps/site) formats
  // quietAnswer with `quiet` only until its next core pin bump; a missing
  // argument would throw there (its icu() is intl-messageformat).
  it("still formats the old way, with `quiet` only, and says nothing false", () => {
    const { t, errors } = translate();
    const answer = t("quietAnswer", { quiet: 4 });
    expect(errors).toEqual([]);
    expect(answer).not.toMatch(/[{}]/);
    expect(answer).toContain("A QRdx download has the margin its design sets");
    expect(answer).not.toMatch(/no margin unless/);
  });

  it("says where new designs start, from code", () => {
    const { t, errors } = translate();
    const answer = t("quietAnswerNewDesigns", {
      quiet: 4,
      start: NEW_DESIGN_MARGIN,
    });
    expect(errors).toEqual([]);
    expect(answer).toContain(
      `new designs in the editor start with ${NEW_DESIGN_MARGIN} modules`,
    );
  });
});

describe("the scan score of the default look", () => {
  const VALUE = "https://qrdx.dev";

  it("warns at margin 0 and 1 and keeps the grade; not at 2", async () => {
    const [none, one, two] = await Promise.all(
      [0, 1, 2].map((margin) =>
        scoreDesign(VALUE, { ...defaultThemeState.styles, margin }),
      ),
    );
    const quietZone = (result: typeof none) =>
      result.checks.find((check) => check.id === "quiet-zone");
    for (const result of [none, one]) {
      expect(quietZone(result)?.passed).toBe(false);
      expect(quietZone(result)?.severity).toBe("warning");
      expect(result.grade).toBe(two.grade);
    }
    expect(quietZone(two)?.passed).toBe(true);
    expect(quietZone(two)?.severity).toBeUndefined();
    expect(two.grade).toBe("great");
  });
});
