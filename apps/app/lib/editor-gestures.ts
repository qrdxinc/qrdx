// Which input gesture a design change belongs to, so the editor's undo
// history keeps one step per gesture (store/editor-store.ts, setThemeState).
// A gesture is one press of the pointer, from pointerdown to the click that
// follows its release (a slider or color drag, a tile picked), or one key
// press (held keys repeat into it, and typing in one field continues it
// while the keys keep coming within TYPING_PAUSE_MS). Changes made in one
// gesture merge into one undo step; two picks are two gestures however fast
// they come. A change made outside any gesture (a file read, a timer, a
// drop) is a step of its own. Browser only: without a document nothing is
// ever live, so every change is its own step.

/** Typing in one field keeps one step until it pauses this long. */
export const TYPING_PAUSE_MS = 1000;

let sequence = 0;
let live: number | null = null;
let pointerDown = false;
let lastKey: {
  target: EventTarget | null;
  at: number;
  gesture: number;
} | null = null;

/** The gesture going on now, or null when no input is being handled. */
export function currentGesture(): number | null {
  return live;
}

const textField = (target: EventTarget | null) =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "range", "submit"].includes(
      target.type,
    )) ||
  (target instanceof HTMLElement && target.isContentEditable);

/** Ends `gesture` once the events it fires (the click after a release) are handled. */
function endSoon(gesture: number) {
  setTimeout(() => {
    if (live === gesture && !pointerDown) live = null;
  }, 0);
}

/**
 * Follows pointer and key input on `doc` (capture phase, so before any
 * handler sees it). Returns a function that stops.
 */
export function trackGestures(doc: Document): () => void {
  const onPointerDown = () => {
    sequence += 1;
    live = sequence;
    pointerDown = true;
    // A click ends a run of typing
    lastKey = null;
  };
  const onPointerUp = () => {
    pointerDown = false;
    if (live !== null) endSoon(live);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const now = Date.now();
    const typing =
      lastKey !== null &&
      textField(event.target) &&
      lastKey.target === event.target &&
      now - lastKey.at < TYPING_PAUSE_MS;
    if (!((event.repeat && lastKey) || typing)) sequence += 1;
    const gesture =
      (event.repeat || typing) && lastKey ? lastKey.gesture : sequence;
    live = gesture;
    lastKey = { target: event.target, at: now, gesture };
    endSoon(gesture);
  };
  const options = { capture: true };
  doc.addEventListener("pointerdown", onPointerDown, options);
  doc.addEventListener("pointerup", onPointerUp, options);
  doc.addEventListener("pointercancel", onPointerUp, options);
  doc.addEventListener("keydown", onKeyDown, options);
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, options);
    doc.removeEventListener("pointerup", onPointerUp, options);
    doc.removeEventListener("pointercancel", onPointerUp, options);
    doc.removeEventListener("keydown", onKeyDown, options);
    live = null;
    pointerDown = false;
    lastKey = null;
  };
}
