// Where the inline editors' toolbars float beside a frame label or a part
// of the code, and where their menus open. Pure.
import type { Box } from "./preview-labels";

// Room kept between the menu and the text, and around the preview's edge
const GAP = 10;
const EDGE = 8;
// The scan score badge sits along the preview's bottom edge
const BOTTOM_RESERVE = 64;

/**
 * Where the menu goes: just outside the frame on the edge nearer the text,
 * so it covers no artwork; else right beside the text on that side, then
 * on the other side, then outside the far edge. Horizontally it follows
 * the text, inside the preview.
 */
export function placeMenu(
  menu: { width: number; height: number },
  anchor: Box,
  artwork: Box | null,
  bounds: { width: number; height: number },
): { left: number; top: number; above: boolean } {
  const aboveOf = (box: Box) => ({
    top: box.top - GAP - menu.height,
    above: true,
  });
  const belowOf = (box: Box) => ({
    top: box.top + box.height + GAP,
    above: false,
  });
  const art = artwork ?? anchor;
  const nearerTop = anchor.top + anchor.height / 2 <= art.top + art.height / 2;
  const candidates = nearerTop
    ? [aboveOf(art), aboveOf(anchor), belowOf(anchor), belowOf(art)]
    : [belowOf(art), belowOf(anchor), aboveOf(anchor), aboveOf(art)];
  const fits = ({ top }: { top: number }) =>
    top >= EDGE && top + menu.height <= bounds.height - BOTTOM_RESERVE;
  const chosen = candidates.find(fits) ?? {
    top: Math.max(EDGE, anchor.top - GAP - menu.height),
    above: true,
  };
  const left = Math.min(
    Math.max(EDGE, anchor.left + anchor.width / 2 - menu.width / 2),
    Math.max(EDGE, bounds.width - menu.width - EDGE),
  );
  return { left, top: chosen.top, above: chosen.above };
}

/** A box in the viewport (CSS px), as getBoundingClientRect gives it. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far a toolbar's menu opens from what it's placed against. */
export const MENU_OFFSET = 8;
/** How close a menu comes to the viewport's edge. */
export const MENU_EDGE = 12;
/** The least height worth scrolling in; below it a menu may cover the code. */
export const MENU_MIN_HEIGHT = 120;

export interface MenuPlacement {
  /** Where the menu opens */
  side: "top" | "bottom" | "left" | "right";
  /** What it opens against: the toolbar button, or the code itself */
  against: "trigger" | "code";
  /** Its height is capped (it scrolls), or null to let it fit itself */
  maxHeight: number | null;
}

/**
 * Where a toolbar menu opens so the code stays in view while it's used:
 * on the toolbar's far side (`far`, away from the code) when the whole menu
 * fits there; else beside the code, right then left, when the gap there
 * takes its width (the whole viewport's height to grow into); else on the
 * far side again, capped to the room there so it scrolls instead of
 * flipping over the code. Only when the far side has less than
 * MENU_MIN_HEIGHT and the code has no room beside it may the menu cover
 * the code (it then finds its own place). Pure.
 */
export function placeToolbarMenu({
  menu,
  trigger,
  code,
  viewport,
  far,
}: {
  /** The menu's whole size, content unscrolled */
  menu: { width: number; height: number };
  trigger: Rect;
  /** The code to keep clear of, if it's on screen */
  code: Rect | null;
  viewport: { width: number; height: number };
  far: "top" | "bottom";
}): MenuPlacement {
  const farRoom =
    far === "top"
      ? trigger.top - MENU_OFFSET - MENU_EDGE
      : viewport.height - trigger.bottom - MENU_OFFSET - MENU_EDGE;
  if (menu.height <= farRoom) {
    return { side: far, against: "trigger", maxHeight: farRoom };
  }
  if (code) {
    const fullHeight = viewport.height - 2 * MENU_EDGE;
    if (menu.width <= viewport.width - code.right - MENU_OFFSET - MENU_EDGE) {
      return { side: "right", against: "code", maxHeight: fullHeight };
    }
    if (menu.width <= code.left - MENU_OFFSET - MENU_EDGE) {
      return { side: "left", against: "code", maxHeight: fullHeight };
    }
  }
  return farRoom >= MENU_MIN_HEIGHT
    ? { side: far, against: "trigger", maxHeight: farRoom }
    : { side: far, against: "trigger", maxHeight: null };
}
