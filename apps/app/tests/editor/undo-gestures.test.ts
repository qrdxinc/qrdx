// @vitest-environment jsdom
// One undo step per input gesture (lib/editor-gestures.ts, the editor
// store's setThemeState): a slider or color drag is one step however long
// it runs, two picks are two steps however quick, typing in one field is one
// step until it pauses, and a change outside any gesture is its own step.
// The same store path serves the Design tab and the preview's toolbars.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // The window losing focus ends whatever a test left going
  window.dispatchEvent(new Event("blur"));
});

const press = (target: Element, pointerId = 1) =>
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerId }),
  );
const release = (target: Element, pointerId = 1) =>
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId }),
  );
const cancel = (target: Element, pointerId = 1) =>
  target.dispatchEvent(
    new PointerEvent("pointercancel", { bubbles: true, pointerId }),
  );
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
    // Back to the default look's margin
    expect(store().themeState.styles.margin).toBe(
      defaultThemeState.styles.margin,
    );
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

  it("a press that changes nothing ends at once (a right-click's lost release)", async () => {
    // No pointerup arrives after the native context menu
    press(slider);
    await tick();
    // Two later changes (a chat reply applied, a file read)
    change();
    await tick();
    change();
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("a shortcut after a lost release doesn't absorb a later change", async () => {
    press(slider);
    await tick();
    key(document.body, "h");
    change();
    await tick();
    change();
    expect(store().history).toHaveLength(2);
  });

  it("a pointer pressed again before its release arrived starts a new step", async () => {
    press(slider);
    change();
    await tick();
    press(slider);
    change();
    release(slider);
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("a context menu ends a press", async () => {
    press(slider);
    change();
    slider.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    change();
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("a drag stays one step while any pointer is down", async () => {
    // A resting finger, then one dragging a handle
    press(slider, 1);
    press(slider, 2);
    change();
    release(slider, 1);
    await tick();
    for (let step = 0; step < 6; step++) change();
    release(slider, 2);
    await tick();
    expect(store().history).toHaveLength(1);
  });

  it("a cancelled press (a touch scroll) ends its gesture", async () => {
    press(slider);
    change();
    cancel(slider);
    await tick();
    change();
    expect(store().history).toHaveLength(2);
  });

  it("Shift held mid-drag doesn't split it", async () => {
    press(slider);
    change();
    key(document.body, "Shift");
    change();
    release(slider);
    await tick();
    expect(store().history).toHaveLength(1);
  });

  it("a change in a press and one in the click after its release are two steps", async () => {
    press(slider);
    change();
    release(slider);
    // The click handler picks a tile
    change();
    await tick();
    expect(store().history).toHaveLength(2);
  });

  it("a blur save and the drag or click after it are separate steps", async () => {
    // A field that saves its value when it loses focus, as the gradient
    // angle does (React's handlers run before the document's)
    const save = () => change();
    document.body.addEventListener("focusout", save);
    try {
      input.focus();
      press(slider);
      input.blur();
      expect(store().history).toHaveLength(1);
      // The press goes on as a drag of its own
      change();
      change();
      release(slider);
      await tick();
      expect(store().history).toHaveLength(2);
      input.focus();
      press(slider);
      input.blur();
      release(slider);
      // The click after it picks a tile
      change();
      await tick();
      expect(store().history).toHaveLength(4);
    } finally {
      document.body.removeEventListener("focusout", save);
    }
  });
});

describe("redo after a change", () => {
  it("undo and redo of a drag restore its ends; a change after an undo clears redo", async () => {
    press(slider);
    for (let step = 0; step < 5; step++) change();
    release(slider);
    await tick();
    key(document.body, "z");
    store().undo();
    await tick();
    // Back to the default look's margin
    expect(store().themeState.styles.margin).toBe(
      defaultThemeState.styles.margin,
    );
    key(document.body, "z");
    store().redo();
    await tick();
    expect(store().themeState.styles.margin).toBe(level);
    // A change in the same task as the undo (an effect reacting to it)
    key(document.body, "y");
    store().undo();
    change();
    expect(store().future).toHaveLength(0);
  });

  it("a change that merges into its step still clears redo", async () => {
    press(slider);
    change();
    store().replaceThemeState({
      ...store().themeState,
      styles: { ...store().themeState.styles, margin: 99 },
    });
    store().undo();
    expect(store().canRedo()).toBe(true);
    // Merges into the press's first step
    change();
    release(slider);
    await tick();
    expect(store().history).toHaveLength(1);
    expect(store().canRedo()).toBe(false);
  });

  it("after a reload the first edit is a new step and redo is cleared", async () => {
    localStorage.clear();
    vi.resetModules();
    let reloaded = await import("@/store/editor-store");
    const page = () => reloaded.useQREditorStore.getState();
    const set = (margin: number) =>
      page().setThemeState({
        ...page().themeState,
        styles: { ...page().themeState.styles, margin },
      });
    // The first visit: two picks, then Undo
    press(slider);
    set(1);
    release(slider);
    await tick();
    press(slider);
    set(2);
    release(slider);
    await tick();
    press(slider);
    page().undo();
    release(slider);
    await tick();
    expect(page().history[0]?.gesture).toEqual(expect.any(String));
    const saved = JSON.parse(localStorage.getItem("editor-storage") ?? "{}");
    expect(saved.state.history).toHaveLength(1);
    expect(saved.state.history[0]).not.toHaveProperty("gesture");
    expect(saved.state.future).toHaveLength(1);

    // A reload: fresh modules, the store read back from storage
    vi.resetModules();
    reloaded = await import("@/store/editor-store");
    expect(page().history).toHaveLength(1);
    expect(page().canRedo()).toBe(true);
    press(slider);
    set(7);
    release(slider);
    await tick();
    expect(page().history).toHaveLength(2);
    expect(page().canRedo()).toBe(false);
    page().undo();
    expect(page().themeState.styles.margin).toBe(1);
  });
});
