// @vitest-environment jsdom
// Everything the Design tab edits, reached from the playground preview
// (components/editor/part-inline). INVENTORY lists the side panel's controls
// with the part of the code that edits them and its toolbar item; every row
// opens that part in the real overlay, opens the item (a menu on desktop, a
// row of the bottom sheet on phones) and finds the control. Then: the side
// panel and the preview stay in step both ways, each change is one undo
// step, and the scan rules are the side panel's (the halo's background,
// per-eye shapes that don't scan). What the preview leaves to the side panel
// (the Content tab's other forms, Art, Generate, the theme presets) is listed
// in the pull request with the reasons. Geometry is fixed (jsdom draws
// nothing): measureParts returns the boxes below. The real-browser pass is
// in the pull request's screenshots.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { isFrameActive, OFFICIAL_FRAMES } from "qrdx";
import { act, type ReactNode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  labelOfSlot,
  specIcons,
  specTokens,
} from "@/components/editor/control-sections/frame-specs";
import {
  type MeasuredParts,
  PART_LABEL_HEIGHT,
  partLabelPlace,
} from "@/components/editor/part-inline/part-targets";
import en from "@/messages/en.json";
import type { QRStyle } from "@/types/theme";

vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
vi.mock("@/actions/community", () => ({
  getSavedCommunityFrames: vi.fn(async () => []),
}));
vi.mock("@/lib/hooks/use-user-settings", () => ({
  useUserSettings: () => ({ settings: null }),
}));
const tabs = vi.hoisted(() => ({ handleSetTab: vi.fn() }));
vi.mock("@/lib/hooks/use-controls-tab-from-url", () => ({
  useControlsTabFromUrl: () => ({
    tab: "customisations",
    handleSetTab: tabs.handleSetTab,
    aiAvailable: false,
  }),
}));
// Where the parts are drawn (a 400px code, a frame around it when one is on)
vi.mock("@/components/editor/part-inline/part-boxes", async (original) => ({
  ...(await original<
    typeof import("@/components/editor/part-inline/part-boxes")
  >()),
  measureParts: () => measuredNow(),
}));

const { DesignControls } = await import(
  "@/components/editor/control-sections/design-controls"
);
const { dotSize } = await import(
  "@/components/editor/control-sections/dot-size-section"
);
const { eyeShapeBlocked } = await import(
  "@/components/editor/control-sections/eye-shapes"
);
const { EYE_FEATURED } = await import(
  "@/components/editor/control-sections/shape-catalog"
);
const { patterns: eyePatterns } = await import(
  "@/components/playground/corner-eye-pattern-selector"
);
const { PartOverlay } = await import(
  "@/components/editor/part-inline/part-overlay"
);
const { defaultThemeState } = await import("@/config/qr");
const { useQREditorStore } = await import("@/store/editor-store");

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
// Nothing scrolls into view here: the frame library mounts its first page
// only, as an unscrolled panel does (without an observer it mounts them all)
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  NoopIntersectionObserver as unknown as typeof IntersectionObserver;
// Radix and the paint picker reach for these
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const box = (left: number, top: number, width: number, height = width) => ({
  left,
  top,
  width,
  height,
});

function measuredNow(): MeasuredParts {
  const styles = useQREditorStore.getState().themeState.styles;
  const framed = isFrameActive(styles.frame);
  const symbol = box(100, 100, 400);
  return {
    eyes: [box(100, 100, 84), box(416, 100, 84), box(100, 416, 84)],
    symbol,
    dots: symbol,
    logo: styles.showLogo ? box(260, 260, 80) : null,
    background: box(90, 90, 420),
    artwork: framed ? box(60, 60, 480, 620) : box(90, 90, 420),
  };
}

const VALUE = "https://qrdx.dev/q/preview-edit";
const base: QRStyle = { ...defaultThemeState.styles };

let container: HTMLDivElement;
let root: Root;

function Preview({ panel }: { panel: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const styles = useQREditorStore((state) => state.themeState.styles);
  return (
    <>
      {panel && (
        <DesignControls
          onChange={(next) => {
            const state = useQREditorStore.getState().themeState;
            useQREditorStore.getState().setThemeState({
              ...state,
              styles: next,
            });
          }}
          styles={styles}
        />
      )}
      <div data-preview-root="" ref={rootRef}>
        <div data-preview-code="">
          <svg />
        </div>
        <PartOverlay frame={isFrameActive(styles.frame)} rootRef={rootRef} />
      </div>
    </>
  );
}

function render(node: ReactNode) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          {node}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
}

/** Lets effects, measuring and lazy chunks settle. */
async function settle(rounds = 6) {
  await act(async () => {
    for (let step = 0; step < rounds; step++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function setStyle(styles: QRStyle) {
  useQREditorStore.setState({
    themeState: { ...defaultThemeState, styles },
    history: [],
    future: [],
  });
}

async function mount({
  styles = base,
  phone = false,
  panel = false,
}: {
  styles?: QRStyle;
  phone?: boolean;
  panel?: boolean;
} = {}) {
  window.innerWidth = phone ? 390 : 1280;
  setStyle(styles);
  render(<Preview panel={panel} />);
  await settle();
}

const click = async (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle(3);
};

/** Chooses a part of the code, as a click on it does. */
async function openPart(part: string, eye = 0) {
  const buttons = document.querySelectorAll(`[data-part-button="${part}"]`);
  expect(buttons.length, `${part} has a button over it`).toBeGreaterThan(0);
  await click(buttons[eye] ?? buttons[0]);
}

/** The open part's items: toolbar buttons (desktop) or sheet rows (phone). */
function itemButtons(part: string): HTMLElement[] {
  const toolbar = document.querySelector(`[data-part-toolbar="${part}"]`);
  if (toolbar) {
    return [...toolbar.querySelectorAll<HTMLElement>("button[aria-haspopup]")];
  }
  const sheet = document.querySelector(`[data-part-sheet="${part}"]`);
  return sheet
    ? [...sheet.querySelectorAll<HTMLElement>("button[aria-controls]")]
    : [];
}

/** An item's own name, without its value, "won't scan here" or "new". */
const nameOf = (button: Element) =>
  (button.getAttribute("aria-label") ?? "")
    .replace(/, new$/, "")
    .replace(/: won't scan here$/, "")
    .replace(/ \([^)]*\)$/, "");

/**
 * Opens the item named `label` of the open part and returns where its
 * controls are: the menu (desktop) or the row's panel (phone).
 */
async function openItem(part: string, label: string): Promise<HTMLElement> {
  const button = itemButtons(part).find((item) => nameOf(item) === label);
  expect(
    button,
    `${part} has "${label}" (has: ${itemButtons(part).map(nameOf).join(", ")})`,
  ).toBeTruthy();
  if (!button) throw new Error("no item");
  const panelId = button.getAttribute("aria-controls");
  if (panelId && button.closest("[data-part-sheet]")) {
    // A sheet row: the first one starts open
    if (button.getAttribute("aria-expanded") !== "true") await click(button);
    const panel = document.getElementById(panelId);
    if (!panel) throw new Error("no panel");
    return panel;
  }
  await click(button);
  const menu = document.querySelector<HTMLElement>("[data-part-inline-menu]");
  if (!menu) throw new Error(`"${label}" opened no menu`);
  return menu;
}

/** An element's accessible name: aria-label, its <label>, a legend, or its text. */
function accessibleName(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  if (element.id) {
    const label = [...document.querySelectorAll("label")].find(
      (item) => item.htmlFor === element.id,
    );
    if (label) return label.textContent?.trim() ?? "";
  }
  if (element.tagName === "FIELDSET") {
    const legend = element.querySelector(":scope > legend");
    if (legend) return legend.textContent?.trim() ?? "";
  }
  return element.textContent?.trim() ?? "";
}

/** An element's role: its role attribute, or the one its tag implies. */
function roleOf(element: Element): string | null {
  const role = element.getAttribute("role");
  if (role) return role;
  switch (element.tagName) {
    case "BUTTON":
      return "button";
    case "TEXTAREA":
      return "textbox";
    case "FIELDSET":
      return "group";
    case "INPUT":
      return (element as HTMLInputElement).type === "range"
        ? "slider"
        : "textbox";
    default:
      return null;
  }
}

const matches = (text: string, name: string | RegExp) =>
  typeof name === "string" ? text === name : name.test(text);

/** The smallest element whose own text is `text` (notes, which have no role). */
function byText(scope: ParentNode, text: string | RegExp): Element | null {
  let found: Element | null = null;
  for (const element of scope.querySelectorAll("*")) {
    if (matches(element.textContent?.trim() ?? "", text)) found = element;
  }
  return found;
}

/**
 * A control the row names: by role and accessible name (a slider by the
 * name on its root, the role on its thumb), or a note by its text.
 */
type Find = { role: string; name: string | RegExp } | { text: string | RegExp };

function findControl(scope: HTMLElement, find: Find): Element | null {
  if ("text" in find) return byText(scope, find.text);
  for (const element of scope.querySelectorAll("*")) {
    if (!matches(accessibleName(element), find.name)) continue;
    if (roleOf(element) === find.role) return element;
    // A Radix slider's name is on its root, the role on its thumb
    const thumb =
      find.role === "slider" ? element.querySelector('[role="slider"]') : null;
    if (thumb) return thumb;
  }
  return null;
}

/**
 * The row's control, inside the menu or sheet row that opened (never the
 * side panel's twin), its id its own (a label points at it, not elsewhere).
 */
function expectControl(where: HTMLElement, row: Row) {
  const control = findControl(where, row.find);
  expect(control, `${row.control} in ${row.part} › ${row.item}`).toBeTruthy();
  expect(where.contains(control)).toBe(true);
  if (control?.id) {
    expect(
      document.getElementById(control.id),
      `#${control.id} is unique (${row.control})`,
    ).toBe(control);
  }
}

/** An official frame with a second line, an accent color and an icon. */
const officialWithIcon = OFFICIAL_FRAMES.find(
  (frame) =>
    labelOfSlot(frame.spec, "secondary") !== null &&
    specTokens(frame.spec).has("accent") &&
    specIcons(frame.spec).length > 0,
);

const withFrame: QRStyle = {
  ...base,
  frame: { style: "border", text: "Scan me" },
};

const gradient = {
  type: "linear" as const,
  angle: 0,
  stops: [
    { color: "#000000", offset: 0 },
    { color: "#1c2541", offset: 1 },
  ],
};

interface Row {
  /** The side panel's control */
  control: string;
  part: "eyes" | "dots" | "logo" | "background" | "frame";
  /** The toolbar item that holds it */
  item: string;
  find: Find;
  /** The design it's reached on (default: the default look) */
  styles?: QRStyle;
  /** The eyes' This eye */
  oneEye?: boolean;
}

/**
 * The Design tab's controls, section by section, and where the preview
 * edits each one. Every row here is reachable; the pull request lists the
 * rest (left to the side panel) with the reasons.
 */
const INVENTORY: Row[] = [
  // Colors
  {
    control: "Colors › Background",
    part: "background",
    item: "Background color",
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Colors › Foreground (the dots)",
    part: "dots",
    item: "Dot color",
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Colors › Eyes (the eyes' frames)",
    part: "eyes",
    item: "Eye color",
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Colors › Dots (the eyes' centers)",
    part: "eyes",
    item: "Center color",
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Colors › palettes",
    part: "background",
    item: "Background color",
    find: { role: "button", name: "Ink & paper" },
  },
  // Dots and eyes
  {
    control: "Dots › Dot shape",
    part: "dots",
    item: "Pattern",
    find: { role: "group", name: "Common dot shapes" },
  },
  {
    control: "Eyes › Eye style (pairs)",
    part: "eyes",
    item: "Eye shape",
    find: { role: "group", name: "Common eye styles" },
  },
  {
    control: "Eyes › Outer eye shape",
    part: "eyes",
    item: "Eye shape",
    find: { role: "group", name: "Common outer shapes" },
  },
  {
    control: "Eyes › Inner eye shape",
    part: "eyes",
    item: "Eye shape",
    find: { role: "group", name: "Common center shapes" },
  },
  // Logo
  {
    control: "Logo › Logo in the center",
    part: "logo",
    item: "Logo",
    styles: { ...base, showLogo: true },
    find: { name: "Logo in the center", role: "switch" },
  },
  {
    control: "Logo › Logo in the center (no logo shown)",
    part: "background",
    item: "Logo",
    find: { name: "Logo in the center", role: "switch" },
  },
  {
    control: "Logo › Quick icons",
    part: "logo",
    item: "Logo",
    styles: { ...base, showLogo: true },
    find: { role: "group", name: "Quick logo icons" },
  },
  {
    control: "Logo › Brand logos",
    part: "logo",
    item: "Logo",
    styles: { ...base, showLogo: true },
    find: { role: "button", name: /^Brand logos: / },
  },
  {
    control: "Logo › Upload or replace your logo",
    part: "logo",
    item: "Logo",
    styles: { ...base, showLogo: true },
    find: { role: "button", name: "Upload your logo" },
  },
  {
    control: "Logo › Remove",
    part: "logo",
    item: "Logo",
    styles: {
      ...base,
      showLogo: true,
      customLogo: "data:image/png;base64,iVBORw0KGgo=",
    },
    find: { role: "button", name: "Remove" },
  },
  // Logo options
  {
    control: "Logo options › Shape and plate",
    part: "logo",
    item: "Logo shape and plate",
    styles: { ...base, showLogo: true },
    find: { role: "switch", name: "Plate behind the logo" },
  },
  {
    control: "Logo options › Size",
    part: "logo",
    item: "Logo size",
    styles: { ...base, showLogo: true },
    find: { name: "Logo size", role: "slider" },
  },
  {
    control: "Logo options › Clear space",
    part: "logo",
    item: "Clear space",
    styles: { ...base, showLogo: true },
    find: { name: "Clear space around the logo", role: "slider" },
  },
  {
    control: "Logo options › Position",
    part: "logo",
    item: "Logo position",
    styles: { ...base, showLogo: true },
    find: { name: "Logo position, left to right", role: "slider" },
  },
  {
    control: "Logo options › Raise error correction for big logos",
    part: "logo",
    item: "Logo size",
    styles: { ...base, showLogo: true },
    find: { name: "Raise error correction for big logos", role: "switch" },
  },
  // Eye colors
  {
    control: "Eye colors › an eye's frame",
    part: "eyes",
    item: "This eye's color",
    oneEye: true,
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Eye colors › an eye's center",
    part: "eyes",
    item: "This eye's center color",
    oneEye: true,
    find: { role: "radio", name: "Solid" },
  },
  {
    control: "Eye colors › Use the same colors for all eyes",
    part: "eyes",
    item: "Eye color",
    styles: { ...base, eyeColors: { topRight: { outer: "#9b2c2c" } } },
    find: { role: "button", name: "Use the same colors for all eyes" },
  },
  {
    control: "Eye colors › Eyes continue the code's gradient",
    part: "eyes",
    item: "Eye color",
    styles: { ...base, eyeColor: gradient },
    find: { name: /^Eyes continue the code's gradient/, role: "switch" },
  },
  // Eye shapes
  {
    control: "Eye shapes › an eye's frame",
    part: "eyes",
    item: "This eye's shape",
    oneEye: true,
    find: { role: "group", name: "Common frame shapes" },
  },
  {
    control: "Eye shapes › an eye's center",
    part: "eyes",
    item: "This eye's shape",
    oneEye: true,
    find: { role: "group", name: "Common center shapes" },
  },
  {
    control: "Eye shapes › Use the same shapes for all eyes",
    part: "eyes",
    item: "Eye shape",
    styles: { ...base, eyeShapes: { topRight: { outer: "square" } } },
    find: { role: "button", name: "Use the same shapes for all eyes" },
  },
  // Dot size, corners, halo, shadow
  {
    control: "Dot size",
    part: "dots",
    item: "Dot size",
    find: { name: "Dot size", role: "slider" },
  },
  {
    control: "Rounded corners › Corner radius",
    part: "background",
    item: "Padding and corners",
    find: { name: "Corner radius", role: "slider" },
  },
  {
    control: "Rounded corners › Color around it",
    part: "background",
    item: "Padding and corners",
    styles: { ...base, margin: 4, bgRadius: 0.2 },
    find: { name: "Color around it", role: "switch" },
  },
  {
    control: "Rounded corners › the note in a frame",
    part: "background",
    item: "Padding and corners",
    styles: { ...withFrame, margin: 4, bgRadius: 0.2 },
    find: { text: /^In a frame, the frame fills the space around the code/ },
  },
  {
    control: "Halo › Show a halo (and why it can't be drawn)",
    part: "dots",
    item: "Halo",
    find: { name: "Show a halo", role: "switch" },
  },
  {
    control: "Halo › Width",
    part: "dots",
    item: "Halo",
    styles: { ...base, halo: {} },
    find: { name: "Width", role: "slider" },
  },
  {
    control: "Halo › Color",
    part: "dots",
    item: "Halo",
    styles: { ...base, halo: {} },
    find: { role: "button", name: /^Color: / },
  },
  {
    control: "Shadow › Show a shadow",
    part: "dots",
    item: "Shadow",
    find: { name: "Show a shadow", role: "switch" },
  },
  {
    control: "Shadow › Across",
    part: "dots",
    item: "Shadow",
    styles: { ...base, shadow: {} },
    find: { name: "Across", role: "slider" },
  },
  {
    control: "Shadow › Down",
    part: "dots",
    item: "Shadow",
    styles: { ...base, shadow: {} },
    find: { name: "Down", role: "slider" },
  },
  {
    control: "Shadow › Opacity",
    part: "dots",
    item: "Shadow",
    styles: { ...base, shadow: {} },
    find: { name: "Opacity", role: "slider" },
  },
  {
    control: "Shadow › Color",
    part: "dots",
    item: "Shadow",
    styles: { ...base, shadow: {} },
    find: { role: "button", name: /^Color: / },
  },
  // Frame
  {
    control: "Frame › the frame picker (no frame on)",
    part: "background",
    item: "Frame",
    find: { role: "textbox", name: "Search frames" },
  },
  {
    control: "Frame › label ideas (no frame on)",
    part: "background",
    item: "Frame",
    find: { role: "button", name: "Scan me" },
  },
  {
    control: "Frame › the frame picker",
    part: "frame",
    item: "Frame style",
    styles: withFrame,
    find: { role: "textbox", name: "Search frames" },
  },
  {
    control: "Frame › Label",
    part: "frame",
    item: "Frame text and colors",
    styles: withFrame,
    find: { role: "textbox", name: "Label" },
  },
  {
    control: "Frame › Frame color",
    part: "frame",
    item: "Frame text and colors",
    styles: withFrame,
    find: { role: "button", name: /^Frame color: / },
  },
  {
    control: "Frame › Text color",
    part: "frame",
    item: "Frame text and colors",
    styles: withFrame,
    find: { role: "button", name: /^Text color: / },
  },
  {
    control: "Frame › Text size",
    part: "frame",
    item: "Frame text and colors",
    styles: withFrame,
    find: { role: "slider", name: "Text size" },
  },
  ...(officialWithIcon
    ? ([
        {
          control: "Frame › Second line (a custom frame)",
          part: "frame",
          item: "Frame text and colors",
          styles: {
            ...base,
            frame: { style: "custom", spec: officialWithIcon.spec },
          },
          find: { role: "textbox", name: "Second line" },
        },
        {
          control: "Frame › Accent color (a custom frame)",
          part: "frame",
          item: "Frame text and colors",
          styles: {
            ...base,
            frame: { style: "custom", spec: officialWithIcon.spec },
          },
          find: { role: "button", name: /^Accent color: / },
        },
        {
          control: "Frame › Icon (a custom frame)",
          part: "frame",
          item: "Frame text and colors",
          styles: {
            ...base,
            frame: { style: "custom", spec: officialWithIcon.spec },
          },
          find: { role: "group", name: "Icon" },
        },
        {
          control: "Frame › Publish frame (a custom frame)",
          part: "frame",
          item: "Frame text and colors",
          styles: {
            ...base,
            frame: { style: "custom", spec: officialWithIcon.spec },
          },
          find: { role: "button", name: "Publish frame" },
        },
      ] satisfies Row[])
    : []),
  {
    control: "Frame › shaped codes (circle, heart, your own shape)",
    part: "background",
    item: "Code shape",
    find: { role: "button", name: "Silhouette" },
  },
  // Padding and error correction
  {
    control: "Padding",
    part: "background",
    item: "Padding and corners",
    find: { name: "Padding", role: "slider" },
  },
  {
    control: "Error correction",
    part: "background",
    item: "Error correction",
    find: { role: "group", name: "Error correction" },
  },
  // The Content tab's link
  {
    control: "Content › the link",
    part: "background",
    item: "Content",
    find: { role: "textbox", name: "Link" },
  },
];

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useQREditorStore.getState().setValue(VALUE);
  useQREditorStore.getState().setContentType("url");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("every Design control is reachable from the preview", () => {
  it("has a custom frame with a second line and an icon to test with", () => {
    expect(officialWithIcon).toBeDefined();
  });

  for (const layout of ["desktop", "phone"] as const) {
    describe(layout === "desktop" ? "toolbar menus" : "phone sheet", () => {
      it.each(INVENTORY)("$control: $part › $item", async (row) => {
        // The side panel mounted too, so a control's id that clashes with
        // its twin there shows
        await mount({
          styles: row.styles,
          phone: layout === "phone",
          panel: true,
        });
        await openPart(row.part);
        // Phones get the bottom sheet, wider screens the toolbar
        expect(
          document.querySelector(
            layout === "phone"
              ? `[data-part-sheet="${row.part}"]`
              : `[data-part-toolbar="${row.part}"]`,
          ),
        ).toBeTruthy();
        if (row.oneEye) {
          await click(
            [...document.querySelectorAll("button[aria-pressed]")].find(
              (button) => button.textContent === "This eye",
            ),
          );
        }
        const where = await openItem(row.part, row.item);
        expectControl(where, row);
      });
    });
  }
});

describe("the preview and the side panel stay in step", () => {
  it("a halo turned on in the preview shows in the Halo section", async () => {
    await mount({ panel: true });
    const section = () =>
      document.querySelector('section[data-section="halo"] h3')?.textContent;
    expect(section()).toContain("Off");
    await openPart("dots");
    const menu = await openItem("dots", "Halo");
    await click(findControl(menu, { name: "Show a halo", role: "switch" }));
    expect(useQREditorStore.getState().themeState.styles.halo).toEqual({});
    expect(section()).toMatch(/\d+%/);
  });

  it("a dot size set in the side panel shows on the open toolbar", async () => {
    // Square dots go down to their floor; 80% is above it
    const square: QRStyle = { ...base, bodyPattern: "square" };
    expect(dotSize({ ...square, moduleScale: 0.8 }).value).toBe(80);
    await mount({ panel: true, styles: square });
    await openPart("dots");
    const sizeButton = () =>
      itemButtons("dots").find((button) => nameOf(button) === "Dot size");
    expect(sizeButton()?.textContent).toContain("100%");
    act(() => {
      const state = useQREditorStore.getState().themeState;
      useQREditorStore.getState().setThemeState({
        ...state,
        styles: { ...state.styles, moduleScale: 0.8 },
      });
    });
    await settle(2);
    expect(sizeButton()?.textContent).toContain("80%");
    expect(
      document.querySelector('section[data-section="dot-size"] h3')
        ?.textContent,
    ).toContain("80%");
  });

  it("More options opens the Design section of the menu used last", async () => {
    await mount();
    tabs.handleSetTab.mockClear();
    await openPart("dots");
    await openItem("dots", "Shadow");
    const more = document.querySelector<HTMLElement>(
      '[data-part-toolbar="dots"] button[aria-label="More dot options"]',
    );
    await click(more);
    expect(tabs.handleSetTab).toHaveBeenCalledWith("customisations");
    const { usePlaygroundFocusStore } = await import(
      "@/store/playground-focus-store"
    );
    expect(usePlaygroundFocusStore.getState().section).toBe("shadow");
  });
});

describe("one undo step per change", () => {
  it("each change is a step, kept when the toolbar closes", async () => {
    await mount();
    await openPart("background");
    const menu = await openItem("background", "Background color");
    await click(byText(menu, "Ink & paper")?.closest("button"));
    expect(useQREditorStore.getState().history).toHaveLength(1);
    expect(useQREditorStore.getState().themeState.styles.bgColor).toBe(
      "#f6f1e7",
    );
    // Escape on the toolbar closes it; the change stays
    const toolbar = document.querySelector("[data-part-toolbar]");
    await act(async () => {
      toolbar?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settle(2);
    expect(document.querySelector("[data-part-toolbar]")).toBeNull();
    expect(useQREditorStore.getState().themeState.styles.bgColor).toBe(
      "#f6f1e7",
    );
    useQREditorStore.getState().undo();
    expect(useQREditorStore.getState().themeState.styles.bgColor).toBe(
      "#ffffff",
    );
  });

  it("a random look is its own step", async () => {
    await mount();
    await openPart("dots");
    await click(
      document.querySelector(
        '[data-part-toolbar="dots"] [aria-label="Random dots"]',
      ),
    );
    expect(useQREditorStore.getState().history).toHaveLength(1);
  });
});

describe("the scan rules are the side panel's", () => {
  it("while a halo is on, the background takes no picture or see-through fill", async () => {
    await mount({ styles: base });
    await openPart("background");
    let menu = await openItem("background", "Background color");
    expect(byText(menu, "Image")).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    await mount({ styles: { ...base, halo: {} } });
    await openPart("background");
    menu = await openItem("background", "Background color");
    expect(byText(menu, "Image")).toBeNull();
    expect(byText(menu, "Solid")).toBeTruthy();
  });

  it("an eye's shape that doesn't scan with the dots can't be picked on This eye", async () => {
    // A dot shape with a featured eye frame the decode tests refuse
    // (eyeShapeBlocked: the Eye shapes section's own rule)
    const { BODY_PATTERN } = await import("qrdx/types");
    const pair = BODY_PATTERN.flatMap((bodyPattern) =>
      EYE_FEATURED.filter((outer) =>
        eyeShapeBlocked({ ...base, bodyPattern }, "topLeft", "outer", outer),
      ).map((outer) => ({ bodyPattern, outer })),
    )[0];
    expect(pair, "a featured eye frame some dot shape refuses").toBeDefined();
    if (!pair) return;
    const style: QRStyle = { ...base, bodyPattern: pair.bodyPattern };
    await mount({ styles: style });
    await openPart("eyes");
    await click(
      [...document.querySelectorAll("button[aria-pressed]")].find(
        (button) => button.textContent === "This eye",
      ),
    );
    const menu = await openItem("eyes", "This eye's shape");
    const frames = findControl(menu, {
      role: "group",
      name: "Common frame shapes",
    });
    for (const outer of EYE_FEATURED) {
      const name = eyePatterns.find((item) => item.id === outer)?.name ?? outer;
      const tile = [...(frames?.querySelectorAll("button") ?? [])].find(
        (button) =>
          (button.getAttribute("aria-label") ?? "").split(",")[0] === name,
      ) as HTMLButtonElement | undefined;
      if (!tile) continue;
      const selected = tile.getAttribute("aria-pressed") === "true";
      expect(tile.disabled, `${name} on ${pair.bodyPattern} dots`).toBe(
        !selected && eyeShapeBlocked(style, "topLeft", "outer", outer),
      );
    }
    const refused = [...(frames?.querySelectorAll("button") ?? [])].find(
      (button) =>
        (button.getAttribute("aria-label") ?? "").startsWith(
          `${eyePatterns.find((item) => item.id === pair.outer)?.name},`,
        ),
    ) as HTMLButtonElement | undefined;
    expect(refused?.disabled).toBe(true);
  });
});

describe("each part is named where it's pointed at", () => {
  const bounds = { width: 600, height: 700 };

  it("just above the part, lined up with its left edge", () => {
    const place = partLabelPlace(box(100, 100, 84), 3, bounds);
    expect(place.left).toBe(97);
    expect(place.top + PART_LABEL_HEIGHT).toBeLessThanOrEqual(97);
  });

  it("inside the part's top when there's no room above it", () => {
    const place = partLabelPlace(box(10, 6, 580, 680), 3, bounds);
    expect(place.top).toBeGreaterThanOrEqual(6);
    expect(place.top).toBeLessThan(6 + 680 / 2);
  });

  it("always in the part's top half, so never over the scan score badge", () => {
    for (const part of [
      box(100, 416, 84),
      box(90, 90, 420),
      box(0, 0, 600, 700),
    ]) {
      const place = partLabelPlace(part, 3, bounds);
      expect(place.top).toBeLessThan(part.top + part.height / 2);
      expect(place.left).toBeGreaterThanOrEqual(0);
      expect(place.left).toBeLessThan(bounds.width);
    }
  });

  it("shows the part's name while its button is hovered or focused", async () => {
    await mount();
    const eyes = document.querySelector('[data-part-button="eyes"]');
    await act(async () => {
      eyes?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      eyes?.dispatchEvent(new PointerEvent("pointerenter"));
    });
    await settle(2);
    expect(document.querySelector("[data-part-label]")?.textContent).toBe(
      "Eyes",
    );
    // Hidden while the part is edited (its toolbar is there instead)
    await openPart("eyes");
    expect(document.querySelector('[data-part-label="eyes"]')).toBeNull();
  });
});

describe("New tags and the scan dot on the toolbar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a new look carries the New tag; one that won't draw here, the amber dot, in the other corner", async () => {
    // While the looks batch is still new (lib/whats-new/looks.ts)
    vi.useFakeTimers({
      now: new Date("2026-12-01T12:00:00Z"),
      toFake: ["Date"],
    });
    // A halo on a dark background can't be drawn (halo-rules.ts)
    await mount({ styles: { ...base, bgColor: "#111111", halo: {} } });
    await openPart("dots");
    const halo = itemButtons("dots").find(
      (button) =>
        nameOf(button) === "Halo" &&
        (button.getAttribute("aria-label") ?? "").includes(": won't scan here"),
    );
    expect(halo, "the halo's item says it won't scan here").toBeTruthy();
    const risk = halo?.querySelector('[data-part-mark="risk"]');
    const tag = [...(halo?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === "New",
    );
    expect(risk).toBeTruthy();
    expect(tag).toBeTruthy();
    // Opposite corners: the dot bottom left, the tag top right
    expect(risk?.className).toMatch(/bottom-0\.5/);
    expect(risk?.className).toMatch(/left-0\.5/);
    expect(tag?.className).toMatch(/-top-2\.5/);
    expect(tag?.className).toMatch(/-right-2\b/);
    // Shadow is new too, and draws here: no dot
    const shadow = itemButtons("dots").find((button) =>
      nameOf(button).startsWith("Shadow"),
    );
    expect(shadow?.querySelector('[data-part-mark="risk"]')).toBeNull();
  });

  it("no New tag once the batch is old", async () => {
    vi.useFakeTimers({
      now: new Date("2027-02-01T12:00:00Z"),
      toFake: ["Date"],
    });
    await mount();
    await openPart("dots");
    const shadow = itemButtons("dots").find((button) =>
      nameOf(button).startsWith("Shadow"),
    );
    expect(shadow?.getAttribute("aria-label")).toBe("Shadow");
    expect(
      [...(shadow?.querySelectorAll("span") ?? [])].some(
        (span) => span.textContent === "New",
      ),
    ).toBe(false);
  });
});

describe("Escape puts the content back", () => {
  it("the link typed in the toolbar goes back on Escape, stays on Enter", async () => {
    await mount();
    for (const key of ["Escape", "Enter"]) {
      const typed = `https://qrdx.dev/changed-${key.toLowerCase()}`;
      await openPart("background");
      const menu = await openItem("background", "Content");
      const field = findControl(menu, {
        role: "textbox",
        name: "Link",
      }) as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(field, typed);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await settle(2);
      expect(useQREditorStore.getState().value).toBe(typed);
      // The key on the toolbar (the menu closed first)
      await act(async () => {
        document
          .querySelector("[data-part-toolbar]")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
      await settle(2);
      expect(document.querySelector("[data-part-toolbar]")).toBeNull();
      expect(useQREditorStore.getState().value).toBe(
        key === "Escape" ? VALUE : typed,
      );
    }
  });
});

describe("the background's Logo and Frame menus stay while they're used", () => {
  it("picking a logo there keeps the menu (and its focus) open", async () => {
    await mount({ panel: true });
    await openPart("background");
    const menu = await openItem("background", "Logo");
    const tile = menu.querySelector<HTMLElement>(
      'fieldset[aria-label="Quick logo icons"] button[aria-pressed="false"]',
    );
    await click(tile);
    expect(useQREditorStore.getState().themeState.styles.showLogo).toBe(true);
    // Still offered, still open
    expect(
      itemButtons("background").some((button) => nameOf(button) === "Logo"),
    ).toBe(true);
    expect(document.querySelector("[data-part-inline-menu]")).toBeTruthy();
  });
});

describe("a toolbar button that shows a value says it", () => {
  it("names the value with the item", async () => {
    await mount();
    await openPart("dots");
    const labels = itemButtons("dots").map(
      (button) => button.getAttribute("aria-label") ?? "",
    );
    expect(labels).toContain("Dot size (100%)");
    await openPart("background");
    const background = itemButtons("background").map(
      (button) => button.getAttribute("aria-label") ?? "",
    );
    expect(background).toContain("Error correction (Q)");
    expect(
      background.some((label) =>
        label.startsWith("Padding and corners (0 modules)"),
      ),
    ).toBe(true);
  });
});
