"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { createContext, useContext } from "react";
import { NewTag } from "@/components/new-tag";
import { useIsNewLook } from "../control-sections/new-look-tag";
import type { PartMenuItem } from "./part-controls";

// The marks a toolbar item carries, as the Design tab's sections do: the
// "New" pill on a recently added look (NEW_LOOKS), and the amber dot of
// "Won't scan here" (what it holds can't be drawn on this design). On a
// toolbar button they sit in opposite corners, the New pill top right and
// the dot bottom left, so they never cover each other; in the phone sheet
// they follow the item's name.

/** The item's name for its tooltip and screen readers, with its marks. */
export function useItemLabel(item: PartMenuItem): string {
  const common = useTranslations("common");
  const t = useTranslations("editor.partInline");
  const isNew = useIsNewLook(item.isNew);
  const label = item.risk
    ? t("labelWontScanHere", { label: item.label })
    : item.label;
  return isNew ? common("nameIsNew", { name: label }) : label;
}

export function ItemMarks({
  item,
  placement,
}: {
  item: PartMenuItem;
  /** "corner" on a toolbar button, "inline" after the name in the sheet */
  placement: "corner" | "inline";
}) {
  const isNew = useIsNewLook(item.isNew);
  const corner = placement === "corner";
  return (
    <>
      {item.risk && (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-amber-500",
            corner && "ring-popover absolute bottom-0.5 left-0.5 ring-2",
          )}
          data-part-mark="risk"
        />
      )}
      {isNew && (
        <NewTag
          className={cn(
            "pointer-events-none",
            corner && "absolute -top-1.5 -right-1.5 px-1 text-[8px]",
          )}
        />
      )}
    </>
  );
}

/**
 * Closes the toolbar's open menu, for a control in it that hands over to a
 * dialog of its own (the brand logo gallery): the menu would sit over it.
 * The phone sheet keeps its rows open (the dialog covers the sheet).
 */
const CloseMenu = createContext<() => void>(() => {});

export const CloseMenuProvider = CloseMenu.Provider;

export function useCloseMenu(): () => void {
  return useContext(CloseMenu);
}
