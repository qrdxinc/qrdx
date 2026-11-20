"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";

/** The small "New" pill on recently added options. */
export function NewTag({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <span
      className={cn(
        "rounded-full bg-foreground px-1.5 py-0.5 font-medium text-[9px] text-background uppercase leading-none tracking-wide",
        className
      )}
    >
      {t("newTag")}
    </span>
  );
}
