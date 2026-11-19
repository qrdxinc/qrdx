// A theme as a swatch (no "use client": cards render it on the server): a
// close-up of its code on its own background, and its colors as a row of
// chips, so it reads as a look you apply rather than a code. The close-up
// draws in the browser (./type-previews.tsx); the chips are plain HTML.

import { cn } from "@repo/design-system/lib/utils";
import { getColorString } from "qrdx";
import { themeColors } from "@/lib/community/design-parts";
import type { ThemeStyles } from "@/types/theme";
import { LazySwatchCrop } from "./type-previews";

/** At most this many chips (a gradient adds one per stop). */
export const MAX_CHIPS = 5;

export function ThemeSwatch({
  style,
  eager = false,
  compact = false,
  className,
}: {
  style: ThemeStyles;
  eager?: boolean;
  /** Smaller chips, for a swatch that shares its box (a kit's card) */
  compact?: boolean;
  className?: string;
}) {
  const colors = themeColors(style).slice(0, MAX_CHIPS);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg shadow-sm ring-1 ring-black/5",
        className,
      )}
      // Its own background shows while the close-up loads
      style={{ backgroundColor: getColorString(style.bgColor, "#ffffff") }}
    >
      <LazySwatchCrop
        className="absolute inset-0"
        eager={eager}
        style={style}
      />
      <ul
        aria-hidden
        className={cn(
          "bg-background/85 absolute flex items-center rounded-full shadow-xs ring-1 ring-foreground/10 backdrop-blur-sm",
          compact
            ? "right-1.5 bottom-1.5 gap-0.5 p-0.5"
            : "right-2 bottom-2 gap-1 p-1",
        )}
        data-swatch-colors=""
      >
        {colors.map((color) => (
          <li
            className={cn(
              "rounded-full ring-1 ring-foreground/20 ring-inset",
              compact ? "size-2.5" : "size-3.5",
            )}
            key={color.hex}
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </ul>
    </div>
  );
}
