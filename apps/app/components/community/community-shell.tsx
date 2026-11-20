"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useSearchParams, useSelectedLayoutSegments } from "next/navigation";
import {
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CommunitySearch } from "./community-search";
import styles from "./community-shell.module.css";
import { ViewSkeleton } from "./community-skeletons";
import { CommunityTabs } from "./community-tabs";
import {
  type CommunityTab,
  HEADINGS,
  type TabSpec,
  viewOf,
} from "./community-views";

// The frame every tabbed community view shares (the overview, "All" and the
// galleries), drawn by app/(app)/(home)/community/layout.tsx so it stays
// mounted while the views change under it: the header (its ASCII field,
// title, search and buttons), the tab row, then the view, then the licence
// line. The title and its line change in place, in a block that keeps one
// height whatever they say, so the search, the buttons and the tabs never
// move. Choosing a tab underlines it at once and shows that view's loading
// placeholder until the view arrives; the view then fades in.
// Other pages under /community (an item, a profile, "Made with QRdx", the
// new collection form) get none of it.

/** The site header's height: the tab row stays below it when scrolled to. */
const NAVBAR_PX = 56;

export function CommunityShell({
  tabs,
  field,
  actions,
  footer,
  children,
}: {
  /** The tab row: the same on every view */
  tabs: readonly TabSpec[];
  /** The header's ASCII field */
  field: ReactNode;
  /** The header's buttons, after the search */
  actions: ReactNode;
  /** Under every view: the licence line */
  footer: ReactNode;
  children: ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  const routeKey = segments.join("/");
  const route = viewOf(segments);
  // A tab chosen on this route, shown until the route changes.
  const [chosen, setChosen] = useState<{
    tab: CommunityTab;
    from: string;
  } | null>(null);
  const pending = chosen?.from === routeKey ? chosen.tab : null;
  const view = pending ?? route;
  const main = useRef<HTMLElement>(null);
  const firstRoute = useRef(routeKey);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the route changes
  useEffect(() => {
    setChosen(null);
  }, [routeKey]);

  // From the first navigation on, views fade in as they arrive.
  useLayoutEffect(() => {
    if (routeKey !== firstRoute.current) {
      main.current?.classList.add(styles.navigated);
    }
  }, [routeKey]);

  if (!view) return children;

  const choose = (tab: CommunityTab) => {
    if (tab === view) return;
    // Scrolled past the tabs: bring them back under the site header, so the
    // new view starts in sight instead of the page jumping to the top.
    const row = main.current?.querySelector("nav");
    const top = row?.getBoundingClientRect().top ?? 0;
    if (row && top < NAVBAR_PX) {
      window.scrollTo({ top: window.scrollY + top - NAVBAR_PX });
    }
    setChosen({ tab, from: routeKey });
  };

  const heading = HEADINGS[view];
  return (
    <main className="w-full border-b" ref={main}>
      <header>
        <div className="relative mx-6 overflow-hidden">
          <div
            aria-hidden
            className={cn(
              "absolute inset-y-0 right-0 flex w-full items-start justify-end pt-6 text-[7px] sm:text-[8px] md:w-[72%] md:items-center md:pt-0 md:text-[9px] lg:text-[10px] xl:text-[11px]",
              styles.field,
            )}
          >
            {field}
          </div>
          <div className="relative px-4 pt-10 pb-8 sm:px-6 md:pt-14 md:pb-10">
            {/* One height for every view's title and line, so nothing under
                it moves: the tallest heading's (the overview's title, or
                the page templates' line) at each width, measured from 320
                to 1440 px; check them when HEADINGS change. From md the
                title stays put and only its line grows; on phones, where
                the overview's title takes an extra line or two, the text
                sits at the foot and the field fills the room above. */}
            <div
              className="flex min-h-[12.75rem] flex-col justify-end sm:min-h-[9.75rem] md:min-h-[8rem] md:justify-start lg:min-h-[8.25rem]"
              data-community-heading
            >
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                Community
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl">
                {heading.title}
              </h1>
              <p className="text-muted-foreground mt-2 max-w-3xl text-pretty md:text-lg">
                {heading.lede}
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Suspense fallback={<CommunitySearch className="sm:max-w-md" />}>
                <HeaderSearch all={view === "all"} />
              </Suspense>
              {actions}
            </div>
          </div>
        </div>
      </header>

      <CommunityTabs active={view} onSelect={choose} tabs={tabs} />

      <div hidden={pending !== null}>{children}</div>
      {pending && <ViewSkeleton view={pending} />}

      {footer}
    </main>
  );
}

/** The search box: on "All", it holds the search being shown. */
function HeaderSearch({ all }: { all: boolean }) {
  const query = useSearchParams().get("q");
  return (
    <CommunitySearch
      className="sm:max-w-md"
      defaultValue={all ? (query ?? "") : undefined}
    />
  );
}
