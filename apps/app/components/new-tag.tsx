"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";

/**
 * The small "New" tag on recently added things: a pill in the accent colour
 * with a white dot before the word. The accent reads the same on light and
 * dark, so one style serves the editor and the community cards alike.
 */
export function NewTag({ className, ...props }: ComponentProps<"span">) {
  const t = useTranslations("common");
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-px font-semibold text-[10px] text-primary-foreground leading-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-primary-foreground"
      />
      {t("newTag")}
    </span>
  );
}
