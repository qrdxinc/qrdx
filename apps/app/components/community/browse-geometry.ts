// How a community gallery is laid out (./browse-layout.tsx), shared with its
// skeleton (./community-skeletons.tsx) so the placeholder that shows while a
// gallery loads has the gallery's exact frame. No imports and no
// "use client": the server draws the skeleton, the browser the gallery.

/** The gallery: the sidebar, then the toolbar and the grid. */
export const BROWSE_ROOT = "flex min-h-[60vh] w-full";

/** The sidebar, on wide screens (a sheet behind "Filters" below lg). */
export const BROWSE_ASIDE = "hidden w-60 shrink-0 border-r lg:block";

/** The sidebar's rows. */
export const BROWSE_NAV = "space-y-1 p-3";

/** The toolbar and the grid. */
export const BROWSE_MAIN = "min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6";

/**
 * The toolbar: "Filters" (below lg) and the sort menu on the left, the
 * "How to publish" note on the right. Always a button's height, so a
 * toolbar of text alone (Everything's heading) is as tall as one of buttons.
 */
export const BROWSE_TOOLBAR = "flex min-h-8 items-center justify-between gap-4";
