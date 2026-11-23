// @vitest-environment jsdom
// The Eye colors section (control-sections/eye-colors-section.tsx) shows one
// eye at a time, like Eye shapes: both pick the eye with the same tabs
// (control-sections/eye-tabs.tsx). An eye without its own color shows the
// colors it is drawn in, a pick writes only the selected eye's part, the
// reset clears every eye, and a tab carries a dot only for an eye with a
// setting of its own (the owner, 23 Nov 2026: six color rows at once "feel
// too much").
import { NextIntlClientProvider } from "next-intl";
import type { EyePosition } from "qrdx/types";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { QRStyle } from "@/types/theme";

vi.mock("@/lib/hooks/use-user-settings", () => ({
  useUserSettings: () => ({ settings: null }),
}));
// The color control's focus store reads the panel's tab from the URL
vi.mock("@/lib/hooks/use-controls-tab-from-url", () => ({
  useControlsTabFromUrl: () => ({
    tab: "customisations",
    handleSetTab: () => undefined,
    aiAvailable: false,
  }),
}));

const { EyeColorsSection } = await import(
  "@/components/editor/control-sections/eye-colors-section"
);
const { EyeShapesSection } = await import(
  "@/components/editor/control-sections/eye-shapes-section"
);
const { eyeTabMove } = await import(
  "@/components/editor/control-sections/eye-tabs"
);
const { withStyleChange } = await import(
  "@/components/editor/control-sections/customization-sections"
);
const { defaultThemeState } = await import("@/config/qr");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
// Radix and the paint picker reach for these
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const base: QRStyle = {
  ...defaultThemeState.styles,
  fgColor: "#111111",
  eyeColor: "#222222",
  dotColor: "#333333",
};

let container: HTMLDivElement;
let root: Root;
/** Every style the section stored, oldest first. */
let stored: QRStyle[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  stored = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function Harness({
  initial,
  shapes,
}: {
  initial: Partial<QRStyle>;
  shapes?: boolean;
}) {
  const [style, setStyle] = useState<QRStyle>({ ...base, ...initial });
  const update = (change: Partial<QRStyle>) => {
    const next = withStyleChange(style, change);
    stored.push(next);
    setStyle(next);
  };
  return shapes ? (
    <EyeShapesSection
      expanded
      onChange={(eyeShapes) => update({ eyeShapes })}
      style={style}
    />
  ) : (
    <EyeColorsSection
      expanded
      onChange={(eyeColors) => update({ eyeColors })}
      onEyeGradientChange={(eyeGradient) => update({ eyeGradient })}
      style={style}
    />
  );
}

async function mount(initial: Partial<QRStyle> = {}, shapes = false) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness initial={initial} shapes={shapes} />
      </NextIntlClientProvider>,
    );
  });
}

const click = async (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  await act(async () => {
    (element as HTMLElement).click();
  });
};

const LABELS: Record<EyePosition, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomLeft: "Bottom left",
};

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tab = (eye: EyePosition) =>
  tabs().find((button) => button.textContent?.startsWith(LABELS[eye]));
const selected = () =>
  tabs()
    .filter((button) => button.getAttribute("aria-selected") === "true")
    .map((button) => button.textContent?.replace("•", ""));
const dotted = () =>
  tabs()
    .filter((button) => button.textContent?.includes("•"))
    .map((button) => button.textContent?.replace("•", ""));
/** The color pickers' triggers in the open panel, by their names. */
const pickers = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[role="tabpanel"] button[aria-label]',
    ),
  ].map((button) => button.getAttribute("aria-label"));

describe("Eye colors, one eye at a time", () => {
  it("opens beside the panel and shows the selected eye's two pickers only", async () => {
    await mount();
    const header = document.querySelector('[data-section="eye-colors"] button');
    expect(header?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(header?.textContent).toContain("Same for all");
    expect(tabs()).toHaveLength(3);
    expect(selected()).toEqual(["Top left"]);
    // An eye without its own colors shows the Eyes and Dots colors
    expect(pickers()).toEqual(["Frame: #222222", "Center: #333333"]);
    expect(document.body.textContent).toContain(
      "Eyes you leave alone keep the Eyes and Dots colors.",
    );
  });

  it("switches to another eye's pickers with its tab", async () => {
    await mount({ eyeColors: { topRight: { outer: "#9b2c2c" } } });
    await click(tab("topRight"));
    expect(selected()).toEqual(["Top right"]);
    expect(pickers()).toEqual(["Frame: #9B2C2C", "Center: #333333"]);
    await click(tab("bottomLeft"));
    expect(selected()).toEqual(["Bottom left"]);
    expect(pickers()).toEqual(["Frame: #222222", "Center: #333333"]);
  });

  it("writes a pick on Top right's frame to that eye's frame only", async () => {
    await mount();
    await click(tab("topRight"));
    await click(
      document.querySelector('[role="tabpanel"] button[aria-label^="Frame"]'),
    );
    const hex = document.querySelector<HTMLInputElement>(
      'input[aria-label="Hex or any CSS color"]',
    );
    if (!hex) throw new Error("no hex field");
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(hex, "#123456");
      hex.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const last = stored.at(-1);
    expect(last?.eyeColors).toEqual({
      topRight: { outer: { type: "solid", color: "#123456" } },
    });
    // The Eyes and Dots colors stay as they were
    expect(last?.eyeColor).toBe("#222222");
    expect(last?.dotColor).toBe("#333333");
  });

  it("puts every eye back on the Eyes and Dots colors with the reset", async () => {
    await mount({
      eyeColors: {
        topRight: { outer: "#9b2c2c" },
        bottomLeft: { inner: "#2c7a7b" },
      },
    });
    const header = document.querySelector('[data-section="eye-colors"] button');
    expect(header?.textContent).not.toContain("Same for all");
    const reset = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Use the same colors for all eyes",
    );
    await click(reset);
    expect(stored.at(-1)?.eyeColors).toBeUndefined();
    expect("eyeColors" in (stored.at(-1) ?? {})).toBe(false);
    expect(dotted()).toEqual([]);
    expect(header?.textContent).toContain("Same for all");
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Use the same colors for all eyes",
      ),
    ).toBe(false);
  });

  it("marks only the eyes with a color of their own", async () => {
    await mount({ eyeColors: { bottomLeft: { inner: "#2c7a7b" } } });
    expect(dotted()).toEqual(["Bottom left"]);
  });

  it("shows the gradient switch once an eye is painted with a gradient", async () => {
    await mount();
    expect(document.body.textContent).not.toContain(
      "Eyes continue the code's gradient",
    );
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount({
      eyeColors: {
        topLeft: {
          outer: {
            type: "linear",
            angle: 0,
            stops: [
              { color: "#000000", offset: 0 },
              { color: "#9b2c2c", offset: 1 },
            ],
          },
        },
      },
    });
    expect(document.body.textContent).toContain(
      "Eyes continue the code's gradient",
    );
  });
});

describe("the eye tabs", () => {
  it("move with the arrow keys, wrapping, and jump with Home and End", async () => {
    expect(eyeTabMove("ArrowRight", 0)).toBe(1);
    expect(eyeTabMove("ArrowRight", 2)).toBe(0);
    expect(eyeTabMove("ArrowLeft", 0)).toBe(2);
    expect(eyeTabMove("Home", 2)).toBe(0);
    expect(eyeTabMove("End", 0)).toBe(2);
    expect(eyeTabMove("Enter", 1)).toBeNull();

    await mount();
    // Only the selected tab is in the Tab order
    expect(tabs().map((button) => button.tabIndex)).toEqual([0, -1, -1]);
    await act(async () => {
      tab("topLeft")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(selected()).toEqual(["Bottom left"]);
    expect(document.activeElement).toBe(tab("bottomLeft"));
    expect(pickers()).toEqual(["Frame: #222222", "Center: #333333"]);
  });

  it("are the same in Eye shapes, with a dot for an eye with its own shape", async () => {
    await mount({ eyeShapes: { topRight: { outer: "square" } } }, true);
    expect(
      document.querySelector('[role="tablist"]')?.getAttribute("aria-label"),
    ).toBe("Which eye");
    expect(selected()).toEqual(["Top left"]);
    expect(dotted()).toEqual(["Top right"]);
    await click(tab("topRight"));
    expect(selected()).toEqual(["Top right"]);
  });
});
