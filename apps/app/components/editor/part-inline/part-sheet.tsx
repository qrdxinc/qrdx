"use client";

import { useHideFeaturebaseLauncher } from "@repo/analytics/featurebase-launcher";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, Setting4, Shuffle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useLayoutEffect, useState } from "react";
import type { DesignSection } from "@/lib/playground-links";
import { insideInlineEditor } from "../frame-inline/inline-toolbar";
import type { PartItem, PartMenuItem } from "./part-controls";
import { ItemMarks, useItemLabel } from "./part-marks";
import type { PartId } from "./part-targets";

/** A menu item's row: its trigger, name and marks, and the chevron. */
function MenuRow({
  item,
  expanded,
  panelId,
  onToggle,
}: {
  item: PartMenuItem;
  expanded: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const label = useItemLabel(item);
  return (
    <button
      aria-controls={panelId}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(rowClass, "border-0")}
      onClick={onToggle}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        {item.trigger}
        <span className="truncate">{item.label}</span>
        <ItemMarks item={item} placement="inline" />
      </span>
      <ArrowDown2
        aria-hidden
        className={cn(
          "text-muted-foreground size-3.5 shrink-0 transition-transform duration-200",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}

/**
 * Phones: tapping a part of the code opens this sheet with its toolbar's
 * items stacked, one open at a time. It doesn't cover the preview (no
 * overlay), so every change shows above it. Every change is kept as it's
 * made (Undo takes design changes back); Done or a tap outside close the
 * sheet, and Escape also puts the content back as it was.
 */
/** The sheet's tallest share of the screen, and the least it shrinks to. */
const SHEET_MAX = 0.56;
const SHEET_MIN = 0.4;

/**
 * The sheet's height: up to SHEET_MAX of the screen, stopping short of the
 * scan score badge under the preview so the score stays readable while
 * the code changes (not below SHEET_MIN). Pure.
 */
export function sheetMaxHeight(
  viewportHeight: number,
  badgeBottom: number | null,
): number {
  const most = viewportHeight * SHEET_MAX;
  if (badgeBottom === null) return most;
  return Math.max(
    viewportHeight * SHEET_MIN,
    Math.min(most, viewportHeight - badgeBottom - 8),
  );
}

export function PartSheet({
  part,
  items,
  extra,
  onRandom,
  onClose,
  onCancel,
  onMoreOptions,
}: {
  part: PartId;
  items: PartItem[];
  /** Rendered with the sheet, outside its items (a file input) */
  extra?: ReactNode;
  onRandom: () => void;
  /** Done or a tap outside */
  onClose: () => void;
  /** Escape: also puts the content back as it was */
  onCancel: () => void;
  /** Opens the Design tab at `section` (the open row's), or the part's own */
  onMoreOptions: (section?: DesignSection) => void;
}) {
  const t = useTranslations("editor.partInline");
  // Featurebase's launcher would sit over Done
  useHideFeaturebaseLauncher();
  const baseId = useId();
  const first = items.find((item) => item.kind === "menu")?.id ?? null;
  const [open, setOpen] = useState<string | null>(first);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();
  useLayoutEffect(() => {
    const badge = document.querySelector("[data-scan-score-badge]");
    setMaxHeight(
      sheetMaxHeight(
        window.innerHeight,
        badge ? badge.getBoundingClientRect().bottom : null,
      ),
    );
  }, []);

  return (
    <Sheet
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <SheetContent
        // Stops short of the preview (the top third), so changes stay in view
        className="z-[120] max-h-[56svh] gap-0 rounded-t-xl p-0"
        data-part-inline=""
        data-part-sheet={part}
        style={maxHeight ? { maxHeight } : undefined}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onCancel();
        }}
        // The preview's handles (moving the logo, the padding) belong to
        // this edit: using them keeps the sheet open
        onInteractOutside={(event) => {
          if (insideInlineEditor(event.target as Element | null, "part")) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Keep the keyboard down; the sheet itself takes focus
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus({
            preventScroll: true,
          });
        }}
        side="bottom"
        tabIndex={-1}
      >
        <div className="px-4 pt-4 pr-12 pb-2">
          <SheetTitle className="text-sm">{t(`parts.${part}.edit`)}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("sheet.changesShowOnTheCode")}
          </SheetDescription>
        </div>

        <div className="@container min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-3">
          {items.map((item) => {
            if (item.kind === "segment") {
              return (
                // biome-ignore lint/a11y/useSemanticElements: a two-way switch of toggle buttons
                <div
                  aria-label={item.label}
                  className="bg-muted/60 grid grid-cols-2 gap-1 rounded-md p-1"
                  key={item.id}
                  role="group"
                >
                  {item.options.map((option) => (
                    <button
                      aria-pressed={item.value === option.id}
                      className="aria-pressed:bg-background aria-pressed:text-foreground text-muted-foreground focus-visible:ring-ring/50 h-8 rounded-[5px] text-xs font-medium outline-none focus-visible:ring-[3px] aria-pressed:shadow-xs"
                      key={option.id}
                      onClick={() => item.onChange(option.id)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              );
            }
            if (item.kind === "toggle") {
              return (
                <button
                  aria-pressed={item.pressed}
                  className={rowClass}
                  key={item.id}
                  onClick={item.onToggle}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {item.trigger}
                    {item.label}
                  </span>
                </button>
              );
            }
            const expanded = open === item.id;
            const panelId = `${baseId}-${item.id}`;
            return (
              <div className="rounded-md border" key={item.id}>
                <MenuRow
                  expanded={expanded}
                  item={item}
                  onToggle={() =>
                    setOpen((current) => (current === item.id ? null : item.id))
                  }
                  panelId={panelId}
                />
                {expanded && (
                  <div className="space-y-3 border-t p-3" id={panelId}>
                    {item.content}
                  </div>
                )}
              </div>
            );
          })}
          {extra}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              aria-label={t(`parts.${part}.random`)}
              onClick={onRandom}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Shuffle aria-hidden className="size-4" />
              {t("random")}
            </Button>
            <Button
              onClick={() =>
                onMoreOptions(
                  items.find(
                    (item): item is PartMenuItem =>
                      item.kind === "menu" && item.id === open,
                  )?.section,
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <Setting4 aria-hidden className="size-4" />
              {t("moreOptions")}
            </Button>
          </div>
          <Button onClick={onClose} size="sm" type="button">
            {t("sheet.done")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const rowClass =
  "bg-card hover:bg-accent/40 focus-visible:ring-ring/50 aria-pressed:bg-accent flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium transition-colors outline-none focus-visible:ring-[3px]";
