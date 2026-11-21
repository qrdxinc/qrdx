// Which input gesture a design change belongs to, so the editor's undo
// history keeps one step per gesture (store/editor-store.ts, setThemeState).
//
// A press runs from the first pointer down until every pointer lifts (a
// slider or color drag, a pinch). A press that changes nothing ends at once,
// so a press whose release never arrives (the native context menu) leaves
// nothing live; the next move of a pointer that is still down picks it up
// again. The click after the release belongs to the press when the press
// changed nothing (a tile picked is one step) and starts a fresh step when it
// did (a drag, then a click elsewhere, are two). A context menu, the window
// losing focus or the page being hidden ends the press.
//
// A key press is a gesture of its own, even while a pointer is down: held keys
// repeat into it, and typing in one field continues it while the keys keep
// coming within TYPING_PAUSE_MS. Modifier keys alone start and end nothing.
// A change made while a field loses focus (a value saved on blur) is a step
// of its own. A change outside any gesture (a file read, a timer, a drop) is
// a step of its own too.
//
// Gesture ids are unique to the page load, so a step kept from an earlier
// visit never matches one. Browser only: without a document nothing is ever
// live, so every change is its own step.

/** Typing in one field keeps one step until it pauses this long. */
export const TYPING_PAUSE_MS = 1000;

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "AltGraph",
]);

const loadId = Math.random().toString(36).slice(2, 10);
let sequence = 0;
const nextGesture = () => {
  sequence += 1;
  return `${loadId}:${sequence}`;
};

interface Press {
  id: string;
  /** Whether a change was recorded in this press */
  changed: boolean;
}

let live: string | null = null;
/** Pointers down now, by pointerId */
const pointers = new Set<number>();
/** The press going on now, or the last one */
let press: Press | null = null;
/** The press whose last pointer just lifted, until the click after it is handled */
let released: Press | null = null;
let lastKey: {
  target: EventTarget | null;
  at: number;
  gesture: string;
} | null = null;
let endCheck: ReturnType<typeof setTimeout> | null = null;

/** The gesture going on now, or null when no input is being handled. */
export function currentGesture(): string | null {
  return live;
}

/** Records that the live gesture changed the design. */
export function noteChange() {
  if (press && live === press.id) press.changed = true;
}

const textField = (target: EventTarget | null) =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "range", "submit"].includes(
      target.type,
    )) ||
  (target instanceof HTMLElement && target.isContentEditable);

/**
 * Once the events in hand are handled (the click after a release, a key's
 * input), goes back to the press if a pointer is still down and the press
 * changed something, and to no gesture otherwise.
 */
function checkSoon() {
  if (endCheck !== null) return;
  endCheck = setTimeout(() => {
    endCheck = null;
    released = null;
    live = pointers.size > 0 && press?.changed ? press.id : null;
  }, 0);
}

/** Ends whatever is going on: no pointer is down, nothing is live. */
function endAll() {
  pointers.clear();
  press = null;
  released = null;
  live = null;
}

/**
 * Follows pointer, key and focus input on `doc` (capture phase, so before
 * any handler sees it). Returns a function that stops.
 */
export function trackGestures(doc: Document): () => void {
  const view = doc.defaultView;

  const onPointerDown = (event: PointerEvent) => {
    // The same pointer down again: its release was lost
    if (pointers.has(event.pointerId)) pointers.clear();
    if (pointers.size === 0 || press === null) {
      press = { id: nextGesture(), changed: false };
    }
    pointers.add(event.pointerId);
    released = null;
    live = press.id;
    // A click ends a run of typing
    lastKey = null;
    checkSoon();
  };
  const onPointerMove = () => {
    if (pointers.size > 0 && press) {
      live = press.id;
      checkSoon();
    }
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0 && press) {
      // A control committing in its own pointerup handler stays in the press
      live = press.id;
      released = press;
    }
    checkSoon();
  };
  // Bubble phase, after the handlers: the click after a release that ends a
  // press which changed something starts a fresh gesture
  const onReleased = () => {
    if (released?.changed && live === released.id) live = nextGesture();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (MODIFIER_KEYS.has(event.key)) return;
    const now = Date.now();
    const typing =
      lastKey !== null &&
      textField(event.target) &&
      lastKey.target === event.target &&
      now - lastKey.at < TYPING_PAUSE_MS;
    const gesture =
      (event.repeat || typing) && lastKey ? lastKey.gesture : nextGesture();
    live = gesture;
    lastKey = { target: event.target, at: now, gesture };
    checkSoon();
  };
  // A field saving its value on blur makes a step of its own: fresh while
  // the focusout is handled, back to what was live after it (React's
  // handlers run on the root, before the document's bubble listener)
  let beforeBlur: { gesture: string; restore: string | null } | null = null;
  const onFocusOut = () => {
    beforeBlur = { gesture: nextGesture(), restore: live };
    live = beforeBlur.gesture;
    checkSoon();
  };
  const onFocusOutDone = () => {
    if (beforeBlur && live === beforeBlur.gesture) live = beforeBlur.restore;
    beforeBlur = null;
  };
  const onWindowBlur = (event: Event) => {
    if (event.target === view) endAll();
  };
  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") endAll();
  };

  const capture = { capture: true };
  const listeners: [EventTarget, string, EventListener, boolean][] = [
    [doc, "pointerdown", onPointerDown as EventListener, true],
    [doc, "pointermove", onPointerMove, true],
    [doc, "pointerup", onPointerEnd as EventListener, true],
    [doc, "pointercancel", onPointerEnd as EventListener, true],
    [doc, "lostpointercapture", onPointerEnd as EventListener, true],
    [doc, "pointerup", onReleased, false],
    [doc, "click", onReleased, true],
    [doc, "contextmenu", endAll, true],
    [doc, "keydown", onKeyDown as EventListener, true],
    [doc, "focusout", onFocusOut, true],
    [doc, "focusout", onFocusOutDone, false],
    [doc, "visibilitychange", onVisibilityChange, false],
  ];
  if (view) listeners.push([view, "blur", onWindowBlur, false]);
  for (const [target, type, listener, useCapture] of listeners) {
    target.addEventListener(type, listener, useCapture ? capture : undefined);
  }
  return () => {
    for (const [target, type, listener, useCapture] of listeners) {
      target.removeEventListener(
        type,
        listener,
        useCapture ? capture : undefined,
      );
    }
    if (endCheck !== null) clearTimeout(endCheck);
    endCheck = null;
    endAll();
    lastKey = null;
  };
}
