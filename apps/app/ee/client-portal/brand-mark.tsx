import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties } from "react";
import { accentUse } from "@/ee/client-portal/brands-shared";
import type { StatsPageBrand } from "@/lib/public-stats-shared";
import { logoImageSrc } from "@/lib/workspace-logo";

// A client's brand mark and color (agency tools): the header of a
// client-branded stats page (app/(app)/stats/[token]) and of the client
// portal (./portal-shell.tsx).

/**
 * The client's color, applied sparingly: the scans chart and the logo
 * tile. A color that can't be read on a theme's background (too pale on
 * white, too dark on black) leaves that theme monochrome.
 */
export function brandStyle(accent: string | null): CSSProperties | undefined {
  if (!accent) return;
  const use = accentUse(accent);
  return {
    "--brand-accent": accent,
    "--brand-on-accent": use.onAccent,
    "--brand-chart-light": use.light ? accent : "var(--foreground)",
    "--brand-chart-dark": use.dark ? accent : "var(--foreground)",
  } as CSSProperties;
}

/** The client's logo, or its initial on the accent color. */
export function BrandMark({ brand }: { brand: StatsPageBrand }) {
  const src = logoImageSrc(brand.logo);
  if (src) {
    return (
      <span className="bg-background ring-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1">
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={32}
          referrerPolicy="no-referrer"
          src={src}
          width={32}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold uppercase",
        brand.accent
          ? "bg-[var(--brand-accent)] text-[var(--brand-on-accent)]"
          : "bg-foreground text-background",
      )}
    >
      {brand.name.trim().charAt(0) || "C"}
    </span>
  );
}
