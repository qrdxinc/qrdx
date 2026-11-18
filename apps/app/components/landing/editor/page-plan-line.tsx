"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { createContext, type ReactNode, useContext } from "react";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

// The page editor's plain Free/Pro line (lib/landing/plan-line.ts), shown
// next to file uploads and once the page is published. The editor's route
// provides it, already in the person's language; everywhere else the upload
// fields are used (no provider), nothing shows.

/** The line's words, from app.dashboard.pages.planLine. */
export interface PagePlanCopy {
  /** "Files up to 10 MB on Free, 100 MB on Pro." */
  upload: string;
  /** What Free includes for pages and what Pro changes */
  published: string;
  seePro: string;
}

const PagePlanLineContext = createContext<PagePlanCopy | null>(null);

export function PagePlanLineProvider({
  value,
  children,
}: {
  value: PagePlanCopy | null;
  children: ReactNode;
}) {
  return (
    <PagePlanLineContext.Provider value={value}>
      {children}
    </PagePlanLineContext.Provider>
  );
}

/**
 * "upload": the file sizes, under an upload button. "published": what Free
 * includes and what Pro changes, with "See Pro".
 */
export function PagePlanNote({ variant }: { variant: "upload" | "published" }) {
  const copy = useContext(PagePlanLineContext);
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  if (!copy) return null;
  if (variant === "upload") {
    // A row of its own under the upload buttons (they wrap in a flex row).
    return (
      <p className="text-muted-foreground w-full text-xs">{copy.upload}</p>
    );
  }
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span>{copy.published}</span>
      <Button
        className="h-auto px-0 text-xs"
        onClick={() => openUpgradeDialog("pro")}
        size="sm"
        type="button"
        variant="link"
      >
        {copy.seePro}
      </Button>
    </p>
  );
}
