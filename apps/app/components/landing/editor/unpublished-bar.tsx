"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { SELECTION_BAR_ATTR } from "@/app/(app)/dashboard/_components/selection-bar";

/**
 * The page editor's "not live yet" bar: while the page has changes scans
 * don't show, it stays at the bottom of the screen, wherever the editor is
 * scrolled, with Publish next to it. The header's status line is hidden on
 * phones and easy to miss: in November 2026 most new PDF pages had their
 * PDF uploaded and were never published, so scans kept opening the
 * template.
 *
 * It sits in the same floating layer as the lists' selection bar
 * (dashboard/_components/selection-bar.tsx) and marks it the same way, so
 * the app frame makes room below the page and "Get set up" moves above it.
 */
export function UnpublishedBar({
  open,
  detail,
  publishing,
  onPublish,
}: {
  open: boolean;
  /** What scans open until the page is published */
  detail: string;
  publishing: boolean;
  onPublish: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]",
        "md:left-(--app-sidebar-width,0px) md:px-8 md:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
        "transition-[left] duration-200 ease-out motion-reduce:transition-none",
      )}
      {...{ [SELECTION_BAR_ATTR]: open ? "open" : "closed" }}
    >
      <div className="mx-auto flex w-full max-w-6xl justify-center">
        <section
          aria-label="Unpublished changes"
          className={cn(
            "bg-popover/95 text-popover-foreground supports-backdrop-filter:bg-popover/80 flex w-full max-w-full items-center gap-3 rounded-xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-md sm:w-auto dark:shadow-black/40",
            "transition-[translate,opacity,visibility] duration-200 ease-out motion-reduce:transition-none",
            open
              ? "pointer-events-auto visible translate-y-0 opacity-100"
              : "invisible translate-y-[calc(100%+2rem)] opacity-0",
          )}
          data-selection-bar-panel=""
          inert={!open}
        >
          <p className="min-w-0 flex-1 text-sm" role="status">
            <span className="font-medium">Not live yet.</span>{" "}
            <span className="text-muted-foreground">{detail}</span>
          </p>
          <Button
            className="shrink-0"
            disabled={publishing}
            onClick={onPublish}
            size="sm"
          >
            {publishing && <ModuleOrbit aria-hidden />}
            {publishing ? "Publishing..." : "Publish"}
          </Button>
        </section>
      </div>
    </div>
  );
}
