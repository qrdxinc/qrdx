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

/** A pixel short of `px`, so rounding never makes a menu flip. */
const room = (px: number) => Math.floor(px) - 1;

/** What a toolbar's menu keeps clear of, in the viewport. */
export interface MenuAvoid {
  /** The code, its quiet zone included */
  code: Rect;
  /** Everything drawn: the code, its frame and plate */
  artwork: Rect;
}

export interface MenuPlacement {
  /** Which side of its toolbar button the menu opens on */
  side: "top" | "bottom" | "left" | "right";
  /**
   * How it lines up with its button: centered on the far side; beside the
   * artwork, from the button's top down ("start") or from its bottom up
   * ("end")
   */
  align: "start" | "center" | "end";
  /**
   * How far from its button: beside the artwork, left or right, it clears
   * the artwork's edge (the button sits over it)
   */
  offset: number;
  /** Starting from the button's top: how far down it starts (under the toolbar) */
  alignOffset: number;
  /** Its height is capped (it scrolls), or null to let it fit itself */
  maxHeight: number | null;
}

/**
 * Where a toolbar menu opens so the code stays in view while it's used:
 * on the toolbar's far side (`far`, away from the code) when the whole menu
 * fits there; else beside the whole artwork (frame and plate too), on the
 * side with more room, when that gap takes its width and leaves at least
 * MENU_MIN_HEIGHT to grow in (down from under the toolbar when the far side
 * is the top, up from the button's bottom when it's the bottom); else on
 * the far side again, capped to the room there so it scrolls instead of
 * flipping over the code. Only when the far side has less than
 * MENU_MIN_HEIGHT and the artwork has no room beside it may the menu cover
 * the code (it then finds its own place). Every room is a pixel short, so
 * rounding never makes it flip. Pure.
 */
export function placeToolbarMenu({
  menu,
  trigger,
  avoid,
  viewport,
  far,
}: {
  /** The menu's whole size, content unscrolled */
  menu: { width: number; height: number };
  trigger: Rect;
  /** The code and the artwork to keep clear of, if they're on screen */
  avoid: MenuAvoid | null;
  viewport: { width: number; height: number };
  far: "top" | "bottom";
}): MenuPlacement {
  const farRoom = room(
    far === "top"
      ? trigger.top - MENU_OFFSET - MENU_EDGE
      : viewport.height - trigger.bottom - MENU_OFFSET - MENU_EDGE,
  );
  const onFar = (maxHeight: number | null): MenuPlacement => ({
    side: far,
    align: "center",
    offset: MENU_OFFSET,
    alignOffset: 0,
    maxHeight,
  });
  if (menu.height <= farRoom) return onFar(farRoom);
  const beside = avoid && besideArtwork(menu, trigger, avoid, viewport, far);
  if (beside) return beside;
  return onFar(farRoom >= MENU_MIN_HEIGHT ? farRoom : null);
}

/** Beside the artwork on the side with more room, or null when neither takes the menu. */
function besideArtwork(
  menu: { width: number; height: number },
  trigger: Rect,
  { code, artwork }: MenuAvoid,
  viewport: { width: number; height: number },
  far: "top" | "bottom",
): MenuPlacement | null {
  // Down from the code's top (clear of the toolbar above it), or up from
  // the button's bottom when the toolbar is under the code
  const alignOffset =
    far === "top"
      ? Math.max(
          Math.round(code.top - trigger.top),
          Math.round(trigger.bottom - trigger.top) + MENU_OFFSET,
        )
      : 0;
  const maxHeight =
    far === "top"
      ? room(viewport.height - trigger.top - alignOffset - MENU_EDGE)
      : room(trigger.bottom - MENU_EDGE);
  if (maxHeight < MENU_MIN_HEIGHT) return null;
  // The menu's near edge, past both the artwork's edge and the button
  const rightStart = Math.max(artwork.right, trigger.right) + MENU_OFFSET;
  const leftStart = Math.min(artwork.left, trigger.left) - MENU_OFFSET;
  const rightRoom = room(viewport.width - MENU_EDGE - rightStart);
  const leftRoom = room(leftStart - MENU_EDGE);
  const best = rightRoom >= leftRoom ? "right" : "left";
  if (menu.width > Math.max(rightRoom, leftRoom)) return null;
  return {
    side: best,
    align: far === "top" ? "start" : "end",
    offset:
      best === "right" ? rightStart - trigger.right : trigger.left - leftStart,
    alignOffset,
    maxHeight,
  };
}
