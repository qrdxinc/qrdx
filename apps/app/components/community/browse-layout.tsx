"use client";

// One layout for every community gallery: the sidebar on the left (a sheet
// behind "Filters" below lg), the toolbar, then the grid. It runs from rail
// to rail of the site's frame, with no extra side margin. Its frame's classes
// are shared with the skeleton that stands in while a gallery loads
// (./browse-geometry.ts).
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { Filter } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import {
  BROWSE_ASIDE,
  BROWSE_MAIN,
  BROWSE_NAV,
  BROWSE_ROOT,
  BROWSE_TOOLBAR,
} from "./browse-geometry";

export function BrowseLayout({
  sidebar,
  toolbar,
  aside,
  activeFilters = 0,
  sheetTitle,
  children,
}: {
  /** The sidebar's rows */
  sidebar: ReactNode;
  /** Left of the toolbar, after "Filters" (the sort menu) */
  toolbar?: ReactNode;
  /** Right of the toolbar ("How to publish") */
  aside?: ReactNode;
  /** Filters in use besides the default, for the badge on "Filters" */
  activeFilters?: number;
  sheetTitle: string;
  children: ReactNode;
}) {
  const t = useTranslations("community.browseLayout");
  const [open, setOpen] = useState(false);

  return (
    <div className={BROWSE_ROOT}>
      <aside className={BROWSE_ASIDE}>
        <nav aria-label={t("filters")} className={BROWSE_NAV}>
          {sidebar}
        </nav>
      </aside>

      <div className={BROWSE_MAIN}>
        <div className={BROWSE_TOOLBAR}>
          <div className="flex items-center gap-2">
            <Sheet onOpenChange={setOpen} open={open}>
              <SheetTrigger asChild>
                <Button
                  className={cn(
                    "gap-1.5 lg:hidden",
                    activeFilters > 0 && "border-foreground/30",
                  )}
                  size="sm"
                  variant="outline"
                >
                  <Filter aria-hidden className="size-3.5" />
                  {t("filters")}
                  {activeFilters > 0 && (
                    <span className="bg-foreground text-background flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
                      {activeFilters}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-72 p-0" side="left">
                <SheetHeader className="border-b px-6 py-4">
                  <SheetTitle>{sheetTitle}</SheetTitle>
                </SheetHeader>
                {/* Choosing a filter closes the sheet, so the results show. */}
                <nav
                  aria-label={t("filters")}
                  className="space-y-1 overflow-y-auto p-4"
                  onClickCapture={(event) => {
                    if ((event.target as Element).closest("a, button")) {
                      setOpen(false);
                    }
                  }}
                >
                  {sidebar}
                </nav>
              </SheetContent>
            </Sheet>
            {toolbar}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}
