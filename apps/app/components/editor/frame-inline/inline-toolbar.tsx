"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import {
  MENU_EDGE,
  MENU_OFFSET,
  type MenuAvoid,
  type MenuPlacement,
  placeToolbarMenu,
} from "./menu-placement";

// The pill toolbar the preview's inline editors share (frame text here,
// the code's parts in ../part-inline): its buttons, dividers, swatches and
// menus. Each editor marks what belongs to it (data-frame-inline or
// data-part-inline), so a click there doesn't end its edit.

/** Which inline editor a menu belongs to (its data-<kind>-inline marker). */
export type InlineKind = "frame" | "part";

/** The marker an editor's own elements carry, as a selector. */
export const inlineSelector = (kind: InlineKind) => `[data-${kind}-inline]`;

/** The marker on an editor's menus (Radix handles Escape inside them). */
export const inlineMenuSelector = (kind: InlineKind) =>
  `[data-${kind}-inline-menu]`;

// Floating content a menu opens on its own (a select's list, a color
// model menu, a dialog): portaled out of the menu, but still part of it.
const NESTED_FLOATING =
  "[data-radix-popper-content-wrapper], [role='listbox'], [role='dialog'], [role='menu']";

/**
 * Whether a click on `target` stays inside the `kind` editor: on it, its
 * menus, or anything floating that one of them opened.
 */
export function insideInlineEditor(
  target: Element | null,
  kind: InlineKind,
): boolean {
  if (!target?.closest) return false;
  return Boolean(
    target.closest(inlineSelector(kind)) || target.closest(NESTED_FLOATING),
  );
}

/**
 * Whether a key pressed in the `kind` editor belongs to something open over
 * it, so the editor leaves it alone: one of its menus (Radix closes it on
 * Escape), a layer a menu opened (a select's list, a color model menu:
 * portaled out of the menu, its keys still reach the editor through React),
 * or a key from anything else portaled that already handled it (Radix marks
 * the Escape that closes a layer). A layer the editor itself sits in (a
 * dialog around the preview) doesn't count.
 */
export function keyForNestedLayer(
  event: KeyboardEvent<HTMLElement>,
  kind: InlineKind,
): boolean {
  const target = event.target as Element | null;
  if (!target?.closest) return event.defaultPrevented;
  if (target.closest(inlineMenuSelector(kind))) return true;
  const layer = target.closest(NESTED_FLOATING);
  if (layer && !layer.contains(event.currentTarget)) return true;
  // Not on the editor's own buttons and field: a tooltip shown there marks
  // the Escape that hides it handled too, and that Escape still cancels
  return event.defaultPrevented && !event.currentTarget.contains(target);
}

/** Left and right arrows move between the menu's buttons (a toolbar). */
export function moveAlongToolbar(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 1 : -1;
  buttons[(index + step + buttons.length) % buttons.length]?.focus();
}

export const menuButton =
  "hover:bg-accent focus-visible:ring-ring/50 aria-expanded:bg-accent aria-pressed:bg-accent relative inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50";

// w-max: an absolute box near the container's edge would otherwise shrink
// to fit, and placing it by its width would then move it again
export const toolbarClass =
  "bg-popover text-popover-foreground pointer-events-auto absolute flex w-max items-center gap-0.5 rounded-full border p-1 shadow-md";

export function Divider() {
  return <span aria-hidden className="bg-border mx-0.5 h-4 w-px" />;
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-3 rounded-full border shadow-xs"
      style={{ background: color }}
    />
  );
}

/** A plain toolbar button with a tooltip (no menu). */
export function ToolbarButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  /** A toggle's state (aria-pressed) */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipWrapper label={label} side="top">
      <button
        aria-label={label}
        aria-pressed={pressed}
        className={menuButton}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </TooltipWrapper>
  );
}

/** Measures the open menu and tells it where to go (placeToolbarMenu). */
function PlaceMenu({
  far,
  triggerRef,
  avoid,
  onPlace,
}: {
  far: "top" | "bottom";
  triggerRef: RefObject<HTMLButtonElement | null>;
  avoid?: () => MenuAvoid | null;
  onPlace: (placement: MenuPlacement) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Once per opening, before it shows: the menu then keeps its place while
  // it's used (a menu that grows scrolls where it is)
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once when it opens
  useLayoutEffect(() => {
    const content = ref.current?.parentElement;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!(content && trigger)) return;
    onPlace(
      placeToolbarMenu({
        menu: { width: content.offsetWidth, height: content.scrollHeight },
        trigger,
        avoid: avoid?.() ?? null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        far,
      }),
    );
  }, []);
  return <span hidden ref={ref} />;
}

/**
 * A toolbar button that opens a menu (a popover) beside the toolbar. The
 * menu opens on the toolbar's far side (`side`, away from the code) when it
 * fits there, else beside the whole artwork (`avoid` says where it and the
 * code are), on the side with more room, else it scrolls on the far side:
 * it never flips over the code while there's another place
 * (menu-placement.ts, placeToolbarMenu).
 */
export function MenuPopover<M extends string>({
  kind,
  label,
  menu,
  open,
  onOpenChange,
  trigger,
  side,
  avoid,
  className,
  children,
}: {
  kind: InlineKind;
  label: string;
  menu: M;
  open: boolean;
  onOpenChange: (menu: M | null) => void;
  trigger: ReactNode;
  side: "top" | "bottom";
  /** Where the code and the artwork are in the viewport, to keep the menu off them */
  avoid?: () => MenuAvoid | null;
  className?: string;
  children: ReactNode;
}) {
  const marker = {
    [`data-${kind}-inline`]: "",
    [`data-${kind}-inline-menu`]: "",
  };
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  return (
    <Popover
      onOpenChange={(next) => {
        if (!next) setPlacement(null);
        onOpenChange(next ? menu : null);
      }}
      open={open}
    >
      <TooltipWrapper label={label} side="top">
        <PopoverTrigger asChild>
          <button
            aria-label={label}
            className={menuButton}
            ref={triggerRef}
            type="button"
          >
            {trigger}
          </button>
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent
        align={placement?.align ?? "center"}
        alignOffset={placement?.alignOffset ?? 0}
        aria-label={label}
        className={cn("z-[120] w-64 space-y-3 overflow-y-auto p-3", className)}
        collisionPadding={MENU_EDGE}
        side={placement?.side ?? side}
        sideOffset={placement?.offset ?? MENU_OFFSET}
        // The room where it was placed, else (before that, or when it fits
        // itself) the room Radix measures
        style={{
          maxHeight:
            placement?.maxHeight ??
            "var(--radix-popover-content-available-height)",
        }}
        {...marker}
      >
        {open && (
          <PlaceMenu
            avoid={avoid}
            far={side}
            onPlace={setPlacement}
            triggerRef={triggerRef}
          />
        )}
        {children}
      </PopoverContent>
    </Popover>
  );
}
