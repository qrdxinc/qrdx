// The community's views (the overview, "All" and one gallery per type), the
// tab row that switches between them, and the heading each one shows in the
// shared header (./community-shell.tsx). No "use client" and no hooks: the
// layout decides the tab set on the server, the shell and the tabs read the
// rest in the browser.

import { COPY } from "@/app/(app)/(home)/community/[type]/copy";
import { type CommunityItemType, typeFromSegment } from "@/lib/community/types";

export type CommunityTab =
  | "home"
  | "all"
  | "frames"
  | "themes"
  | "collections"
  | "templates"
  | "kits";

export interface TabSpec {
  id: CommunityTab;
  label: string;
  href: string;
}

/** Every tab, in order. */
export const TABS: readonly TabSpec[] = [
  { id: "home", label: "Overview", href: "/community" },
  { id: "all", label: "All", href: "/community/all" },
  { id: "frames", label: "Frames", href: "/community/frames" },
  { id: "themes", label: "Themes", href: "/community/themes" },
  { id: "collections", label: "Collections", href: "/community/collections" },
  { id: "templates", label: "Page templates", href: "/community/templates" },
  { id: "kits", label: "Kits", href: "/community/kits" },
];

/** The gallery tab of each item type. */
export const TAB_OF = {
  frame: "frames",
  theme: "themes",
  collection: "collections",
  "page-template": "templates",
  kit: "kits",
} as const satisfies Record<CommunityItemType, CommunityTab>;

/** What's published, which decides the tabs that come and go. */
export interface Published {
  collections: boolean;
  templates: boolean;
  kits: boolean;
}

/**
 * The tabs to show. Decided once, from what's published, so every view has
 * the same row: a tab never appears or disappears when switching.
 */
export function visibleTabs(published: Published): TabSpec[] {
  return TABS.filter(
    (tab) =>
      (published.collections || tab.id !== "collections") &&
      (published.templates || tab.id !== "templates") &&
      (published.kits || tab.id !== "kits"),
  );
}

/**
 * The view a route below /community shows, from its segments (route groups
 * left out), or null when it isn't one of the tabbed views: an item page, a
 * profile, "Made with QRdx", the new collection form, a type that doesn't
 * exist.
 */
export function viewOf(segments: readonly string[]): CommunityTab | null {
  const parts = segments.filter(
    (segment) => !(segment.startsWith("(") || segment.startsWith("__")),
  );
  if (parts.length === 0) return "home";
  if (parts.length > 1) return null;
  const [segment = ""] = parts;
  if (segment === "all") return "all";
  const type = typeFromSegment(segment);
  return type ? TAB_OF[type] : null;
}

/** The galleries' views, by tab. */
const GALLERY_TYPE = {
  frames: "frame",
  themes: "theme",
  collections: "collection",
  templates: "page-template",
  kits: "kit",
} as const satisfies Record<
  Exclude<CommunityTab, "home" | "all">,
  CommunityItemType
>;

/** The item type a gallery tab lists (null for the overview and "All"). */
export function typeOfTab(tab: CommunityTab): CommunityItemType | null {
  return tab === "home" || tab === "all" ? null : GALLERY_TYPE[tab];
}

/** What the header says on each view. */
export const HEADINGS: Record<CommunityTab, { title: string; lede: string }> = {
  home: {
    title: "Frames, themes and pages for your QR codes",
    lede: "Made by QRdx and the people who use it. Every one scans, and every one is free to use.",
  },
  all: {
    title: "Everything",
    lede: "Frames, themes, collections and page templates in one list. Rank them by saves, see what's new, or search.",
  },
  frames: { title: COPY.frame.heading, lede: COPY.frame.intro },
  themes: { title: COPY.theme.heading, lede: COPY.theme.intro },
  collections: {
    title: COPY.collection.heading,
    lede: COPY.collection.intro,
  },
  templates: {
    title: COPY["page-template"].heading,
    lede: COPY["page-template"].intro,
  },
  kits: { title: COPY.kit.heading, lede: COPY.kit.intro },
};
