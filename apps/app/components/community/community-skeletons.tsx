// What a community view shows while it loads: its own frame with
// placeholders where the cards will be, built from the cards' and the
// galleries' class constants (./card-layout.ts, ./browse-geometry.ts) so a
// placeholder keeps the size of what replaces it. Shown by the views'
// loading.tsx files and, the moment a tab is chosen, by the shared header
// (./community-shell.tsx). No "use client": the server draws them for
// loading.tsx, the browser for a tab still loading.

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import {
  BROWSE_ASIDE,
  BROWSE_MAIN,
  BROWSE_NAV,
  BROWSE_ROOT,
  BROWSE_TOOLBAR,
} from "./browse-geometry";
import { GALLERY_GRID } from "./browse-sidebar";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  CARD_TEXT_REVEAL,
  CARD_TEXT_TOUCH_ONLY,
  MAKER_CARD,
  RAIL,
  RAIL_CARD,
  RAIL_MAKER,
  RAIL_RANKED,
  RANK_ROOM,
  RANK_ROOM_WIDE,
} from "./card-layout";
import type { CommunityTab } from "./community-views";

/** The overview's rows, around them (the page uses it too). */
export const OVERVIEW_ROWS =
  "mx-6 space-y-12 px-4 py-10 sm:px-6 md:space-y-14 md:py-12";

/** Around a gallery: rail to rail (the galleries use it too). */
export const GALLERY_FRAME = "mx-6";

/** A line of placeholder text: a faint bar, centred in the line's height. */
const BAR = "bg-foreground/[0.06] rounded-sm";

/** Cards in a gallery's placeholder grid: two full rows on a wide screen. */
const GALLERY_CARDS = 6;

/**
 * A card's shape: the design's box, then its caption's lines, hidden until
 * hover where the card's own caption is (CARD_TEXT_REVEAL), and one line
 * there (CARD_TEXT_TOUCH_ONLY).
 */
export function CardShape() {
  return (
    <div className={CARD_FRAME}>
      <div className="relative">
        <div className={CARD_ART} />
      </div>
      <div className={cn(CARD_TEXT, CARD_TEXT_REVEAL)}>
        <div className="flex h-5 items-center">
          <div className={cn(BAR, "h-3 w-2/5")} />
        </div>
        <div className={cn("flex h-5 items-center", CARD_TEXT_TOUCH_ONLY)}>
          <div className={cn(BAR, "h-2.5 w-1/4")} />
        </div>
      </div>
    </div>
  );
}

/** An overview row's cards (lib/community/home.ts), laid out as the row's. */
export function RowCardsShape({
  count,
  kind,
}: {
  count: number;
  kind: "cards" | "ranked" | "makers";
}) {
  return (
    <ol aria-hidden className={RAIL}>
      {Array.from({ length: count }, (_, index) => {
        if (kind === "makers") {
          return (
            <li className={RAIL_MAKER} key={index}>
              <div className={MAKER_CARD} />
            </li>
          );
        }
        const rank = index + 1;
        return (
          <li
            className={
              kind === "ranked"
                ? cn(RAIL_RANKED, rank >= 10 ? RANK_ROOM_WIDE : RANK_ROOM)
                : RAIL_CARD
            }
            key={index}
          >
            <CardShape />
          </li>
        );
      })}
    </ol>
  );
}

/** Says a view is loading, to screen readers only. */
function Status() {
  const t = useTranslations("community.more");
  return (
    <span className="sr-only" role="status">
      {t("loading")}
    </span>
  );
}

/** A row's heading (./row-section.tsx): its title and grey line. */
function RowHeadingShape() {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex h-7 items-center">
        <div className={cn(BAR, "h-4 w-36")} />
      </div>
      <div className="flex h-5 items-center">
        <div className={cn(BAR, "h-3 w-60 max-w-full")} />
      </div>
    </div>
  );
}

/**
 * The overview while it loads: its first rows, ranked then cards, as they
 * usually come (lib/community/home-sections.ts, SECTION_ORDER).
 */
export function OverviewSkeleton() {
  const rows = [
    { kind: "ranked", count: 6 },
    { kind: "ranked", count: 6 },
    { kind: "cards", count: 6 },
  ] as const;
  return (
    <div className={OVERVIEW_ROWS}>
      <Status />
      {rows.map((row, index) => (
        <section aria-hidden className="space-y-4" key={index}>
          <div className="flex items-end justify-between gap-4">
            <RowHeadingShape />
          </div>
          <div className="relative">
            <RowCardsShape count={row.count} kind={row.kind} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** Sidebar rows: the filters (bold) and one titled section after them. */
function SidebarShape({
  filters,
  section,
}: {
  filters: number;
  section: number;
}) {
  return (
    <div className={BROWSE_NAV}>
      {Array.from({ length: filters }, (_, index) => (
        <div className="flex h-8 items-center px-3" key={index}>
          <div className={cn(BAR, "h-3", index === 0 ? "w-24" : "w-28")} />
        </div>
      ))}
      <div className="bg-border my-3 h-px" />
      <div className="flex h-6 items-center px-3">
        <div className={cn(BAR, "h-2.5 w-12")} />
      </div>
      <div className="space-y-0.5">
        {Array.from({ length: section }, (_, index) => (
          <div className="flex h-8 items-center px-3" key={index}>
            <div className={cn(BAR, "h-3", index % 2 ? "w-20" : "w-24")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A toolbar button's box: outlined like the sort menu, or bare. */
const TOOL = "h-8 rounded-md border";

/**
 * A gallery while it loads (frames, themes, collections, page templates,
 * kits, or "All"): the sidebar, the toolbar and a grid of cards, in the
 * gallery's frame (./browse-layout.tsx).
 */
export function GallerySkeleton({ view }: { view: CommunityTab }) {
  const all = view === "all";
  return (
    <div className={GALLERY_FRAME}>
      <div className={BROWSE_ROOT}>
        <Status />
        <div aria-hidden className={BROWSE_ASIDE}>
          <SidebarShape filters={all ? 3 : 5} section={6} />
        </div>
        <div aria-hidden className={BROWSE_MAIN}>
          <div className={BROWSE_TOOLBAR}>
            <div className="flex items-center gap-2">
              <div className={cn(TOOL, "w-[5.25rem] lg:hidden")} />
              {all ? (
                <div className={cn(BAR, "h-4 w-44")} />
              ) : (
                <div className={cn(TOOL, "w-24")} />
              )}
            </div>
            {!all && (
              <div className="flex h-8 w-8 items-center justify-center sm:w-32">
                <div className={cn(BAR, "h-3 w-4 sm:w-24")} />
              </div>
            )}
          </div>
          <div className={GALLERY_GRID}>
            {Array.from({ length: GALLERY_CARDS }, (_, index) => (
              <CardShape key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The placeholder for a view. */
export function ViewSkeleton({ view }: { view: CommunityTab }) {
  return view === "home" ? (
    <OverviewSkeleton />
  ) : (
    <GallerySkeleton view={view} />
  );
}
