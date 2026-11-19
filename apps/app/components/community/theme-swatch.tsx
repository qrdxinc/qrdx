// A theme as a swatch (no "use client": cards render it on the server): a
// close-up of its code on its own background, filling its box edge to edge,
// and its colors as a row of chips, so it reads as a look you apply rather
// than a code. The close-up draws in the browser (./type-previews.tsx); the
// chips are plain HTML, on a quiet pill. On a hovered card the close-up
// pulls back to the whole code and the chips rise one after another
// (./stage.module.css).

import { cn } from "@repo/design-system/lib/utils";
import { getColorString } from "qrdx";
import type { CSSProperties } from "react";
import { themeColors } from "@/lib/community/design-parts";
import type { ThemeStyles } from "@/types/theme";
import stage from "./stage.module.css";
import { LazySwatchCrop } from "./type-previews";

/** At most this many chips (a gradient adds one per stop). */
export const MAX_CHIPS = 5;

export function ThemeSwatch({
  style,
  eager = false,
  aspect = 4 / 3,
  compact = false,
  className,
}: {
  style: ThemeStyles;
  eager?: boolean;
  /** Its box's width / height (the close-up is cut for it) */
  aspect?: number;
  /** Smaller chips, for a swatch that shares the stage (a kit's card) */
  compact?: boolean;
  /** Its box: it fills it (absolute, inset 0, by default) */
  className?: string;
}) {
  const colors = themeColors(style).slice(0, MAX_CHIPS);
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      data-theme-swatch=""
      // Its own background fills the box, and shows while the close-up loads
      style={{ backgroundColor: getColorString(style.bgColor, "#ffffff") }}
    >
      <LazySwatchCrop aspect={aspect} eager={eager} style={style} />
      <ul
        aria-hidden
        className={cn(
          "absolute z-[1] flex items-center rounded-full bg-white/90 ring-1 ring-black/[0.06] backdrop-blur-sm",
          compact
            ? "right-1.5 bottom-1.5 gap-0.5 p-0.5"
            : "right-2.5 bottom-2.5 gap-1 p-1",
        )}
        data-swatch-colors=""
      >
        {colors.map((color, index) => (
          <li
            className={cn(
              "rounded-full ring-1 ring-black/15 ring-inset",
              compact ? "size-2.5" : "size-3.5",
              stage.chip,
            )}
            key={color.hex}
            style={
              {
                backgroundColor: color.hex,
                "--chip": index,
              } as CSSProperties
            }
          />
        ))}
      </ul>
    </div>
  );
}
