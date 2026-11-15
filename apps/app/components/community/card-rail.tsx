"use client";

import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft2, ArrowRight2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { RAIL } from "./card-layout";

// A row of cards that scrolls sideways: swipe on touch (it snaps card by
// card), scroll or use the arrow buttons on wider screens. The cards come
// from the server as the list's items (<li>); the arrows show only when
// there's more to that side.

export function CardRail({
  label,
  children,
  className,
}: {
  /** Names the list for screen readers (the row's title) */
  label: string;
  /** The row's <li> items */
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("community.cardRail");
  const ref = useRef<HTMLOListElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const rail = ref.current;
    if (!rail) return;
    const before = rail.scrollLeft > 4;
    const after = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4;
    setMore((current) =>
      current.before === before && current.after === after
        ? current
        : { before, after },
    );
  }, []);

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const rail = ref.current;
    if (!rail) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.8,
      behavior: still ? "auto" : "smooth",
    });
  };

  return (
    <div className="group/rail relative">
      <ol
        aria-label={label}
        className={cn(RAIL, className)}
        onScroll={measure}
        ref={ref}
      >
        {children}
      </ol>
      <RailButton
        label={t("previous")}
        onClick={() => page(-1)}
        shown={more.before}
        side="start"
      />
      <RailButton
        label={t("next")}
        onClick={() => page(1)}
        shown={more.after}
        side="end"
      />
    </div>
  );
}

function RailButton({
  side,
  shown,
  label,
  onClick,
}: {
  side: "start" | "end";
  shown: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "start" ? ArrowLeft2 : ArrowRight2;
  return (
    <button
      aria-hidden={!shown}
      aria-label={label}
      className={cn(
        // Centred on the designs' boxes (the row's top 80%), over the edge.
        "bg-background/95 text-foreground hover:bg-background focus-visible:ring-ring/50 absolute top-[38%] z-20 hidden size-9 -translate-y-1/2 place-items-center rounded-full border shadow-sm transition-opacity duration-200 outline-none focus-visible:ring-[3px] md:grid",
        side === "start" ? "-left-2" : "-right-2",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={onClick}
      tabIndex={shown ? 0 : -1}
      type="button"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
