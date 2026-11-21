// @vitest-environment jsdom
// One undo step per input gesture (lib/editor-gestures.ts, the editor
// store's setThemeState): a slider or color drag is one step however long
// it runs, two picks are two steps however quick, typing in one field is one
// step until it pauses, and a change outside any gesture is its own step.
// The same store path serves the Design tab and the preview's toolbars.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TYPING_PAUSE_MS } from "@/lib/editor-gestures";

const { useQREditorStore } = await import("@/store/editor-store");
const { defaultThemeState } = await import("@/config/qr");

const store = () => useQREditorStore.getState();
let level = 0;
/** A change to the design, as any control makes it. */
const change = () => {
  level += 1;
  store().setThemeState({
    ...store().themeState,
    styles: { ...store().themeState.styles, margin: level },
  });
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let slider: HTMLElement;
let input: HTMLInputElement;

beforeEach(() => {
  useQREditorStore.setState({
    themeState: defaultThemeState,
    history: [],
    future: [],
  });
  slider = document.createElement("span");
  input = document.createElement("input");
  document.body.append(slider, input);
});

afterEach(() => {
  slider.remove();
  input.remove();
});

const press = (target: Element) =>
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
const release = (target: Element) =>
  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
const key = (target: Element, name: string, repeat = false) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, repeat }),
  );

describe("one undo step per gesture", () => {
  it("a drag is one step, however many changes it makes", async () => {
    press(slider);
    for (let step = 0; step < 12; step++) change();
    release(slider);
    await tick();
    expect(store().history).toHaveLength(1);
    store().undo();
    expect(store().themeState.styles.margin).toBeUndefined();
  });

  it("the click after a press belongs to it (a tile picked)", async () => {
    press(slider);
    release(slider);
    // The click handler runs before the gesture ends
    change();
    change();
    await tick();
    expect(store().history).toHaveLength(1);
  });

  it("two quick picks are two steps", async () => {
    press(slider);
    change();
    release(slider);
    press(slider);
    change();
    release(slider);
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("typing in one field is one step; another field starts another", async () => {
    for (const letter of "Scan") {
      key(input, letter);
      change();
    }
    await tick();
    expect(store().history).toHaveLength(1);
    const other = document.createElement("textarea");
    document.body.append(other);
    key(other, "x");
    change();
    other.remove();
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("a pause in typing starts a new step", async () => {
    key(input, "a");
    change();
    const realNow = Date.now;
    Date.now = () => realNow() + TYPING_PAUSE_MS + 50;
    try {
      key(input, "b");
      change();
    } finally {
      Date.now = realNow;
    }
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("separate key presses on a control are separate steps; a held key is one", async () => {
    key(slider, "ArrowRight");
    change();
    await tick();
    key(slider, "ArrowRight");
    change();
    await tick();
    expect(store().history).toHaveLength(2);
    key(slider, "ArrowRight");
    change();
    key(slider, "ArrowRight", true);
    change();
    key(slider, "ArrowRight", true);
    change();
    await tick();
    expect(store().history).toHaveLength(3);
  });

  it("a change outside any gesture (a file read, a drop) is its own step", async () => {
    await tick();
    change();
    change();
    expect(store().history).toHaveLength(2);
  });
});
