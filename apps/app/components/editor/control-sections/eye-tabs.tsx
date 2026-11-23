"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { EYE_POSITIONS, type EyePosition } from "qrdx/types";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

/**
 * The tab a key moves to from tab `index` (the arrows wrap, Home and End
 * jump to the ends), or null for a key the tabs leave alone.
 */
export function eyeTabMove(key: string, index: number): number | null {
  const last = EYE_POSITIONS.length - 1;
  switch (key) {
    case "ArrowRight":
      return index === last ? 0 : index + 1;
    case "ArrowLeft":
      return index === 0 ? last : index - 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/**
 * The row of three corner eyes (Top left · Top right · Bottom left) that
 * picks the one eye a per-eye section shows, with that eye's controls under
 * it: the Eye colors and Eye shapes sections. An eye with its own setting
 * carries a dot.
 */
export function EyeTabs({
  value,
  onChange,
  marked,
  children,
}: {
  value: EyePosition;
  onChange: (eye: EyePosition) => void;
  /** True for an eye with its own setting (its tab gets a dot) */
  marked: (eye: EyePosition) => boolean;
  /** The selected eye's controls */
  children: ReactNode;
}) {
  const t = useTranslations("editor.controlSections.eyeTabs");
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = eyeTabMove(event.key, index);
    if (next === null) return;
    event.preventDefault();
    onChange(EYE_POSITIONS[next]);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <div
        aria-label={t("whichEye")}
        className="grid grid-cols-3 gap-1 rounded-lg border p-1"
        role="tablist"
      >
        {EYE_POSITIONS.map((eye, index) => (
          <button
            aria-controls={`${id}-panel`}
            aria-selected={eye === value}
            className={cn(
              "focus-visible:ring-ring/50 rounded-md px-2 py-1.5 text-xs transition-colors outline-none focus-visible:ring-[3px]",
              eye === value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent/40",
            )}
            id={`${id}-${eye}`}
            key={eye}
            onClick={() => onChange(eye)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            role="tab"
            tabIndex={eye === value ? 0 : -1}
            type="button"
          >
            {t(`positions.${eye}`)}
            {marked(eye) && (
              <span aria-hidden className="ml-1 opacity-70">
                •
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-${value}`}
        className="space-y-4"
        id={`${id}-panel`}
        role="tabpanel"
      >
        {children}
      </div>
    </>
  );
}
