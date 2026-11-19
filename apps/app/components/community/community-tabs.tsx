"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";
import { REDUCED_MOTION } from "@/components/fx/engine";
import type { CommunityTab, TabSpec } from "./community-views";

// The community's type tabs (links, so every view has a URL), in the shared
// header (./community-shell.tsx), so the row stays mounted while the views
// change under it. The active tab is underlined by its own bar, which slides
// over from the tab that was active before: one bar moved with a transform,
// never the text. Without scripts the bar is simply there; with reduced
// motion it moves without sliding.

/** The site's ease-out curve. */
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const SLIDE_MS = 280;

export function CommunityTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly TabSpec[];
  /** The tab to underline (null: none of them, like a type with no tab) */
  active: CommunityTab | null;
  /** Called the moment a tab is chosen, before its view loads */
  onSelect?: (tab: CommunityTab) => void;
}) {
  const t = useTranslations("community.communityTabs");
  const row = useRef<HTMLDivElement>(null);
  const bars = useRef(new Map<CommunityTab, HTMLSpanElement>());
  const shown = useRef(active);

  useLayoutEffect(() => {
    const from = shown.current;
    shown.current = active;
    const bar = active ? bars.current.get(active) : undefined;
    if (!bar) return;
    const scroller = row.current;
    const link = bar.parentElement;
    // Bring the tab into view on a row that scrolls sideways (phones).
    if (scroller && link && scroller.scrollWidth > scroller.clientWidth) {
      const left = link.offsetLeft - scroller.offsetLeft;
      const right = left + link.offsetWidth;
      if (
        left < scroller.scrollLeft ||
        right > scroller.scrollLeft + scroller.clientWidth
      ) {
        scroller.scrollTo({
          left: left - 16,
          behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth",
        });
      }
    }
    const previous = from && from !== active ? bars.current.get(from) : null;
    if (!previous || matchMedia(REDUCED_MOTION).matches) return;
    const a = previous.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (!b.width) return;
    bar.animate(
      [
        {
          transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})`,
        },
        { transform: "none" },
      ],
      { duration: SLIDE_MS, easing: EASE },
    );
  }, [active]);

  return (
    <nav aria-label={t("community")} className="border-b">
      <div
        className="no-scrollbar mx-6 -mb-px flex gap-1 overflow-x-auto px-1 sm:px-3"
        ref={row}
      >
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "relative shrink-0 px-3 py-3 text-sm font-medium transition-colors duration-200",
                current
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              href={tab.href}
              key={tab.id}
              onNavigate={() => onSelect?.(tab.id)}
              scroll={false}
            >
              {tab.label}
              <span
                aria-hidden
                className={cn(
                  "bg-foreground absolute inset-x-0 bottom-0 h-0.5 origin-left",
                  !current && "opacity-0",
                )}
                ref={(node) => {
                  if (node) bars.current.set(tab.id, node);
                  else bars.current.delete(tab.id);
                }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
