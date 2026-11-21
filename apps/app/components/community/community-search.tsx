// The community's search box: a plain GET form to /community/all, so it
// works before (and without) any script. Results are found by
// lib/community/api.ts (full-text search once its index exists).

import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";

export function CommunitySearch({
  defaultValue,
  className,
}: {
  /** The search being shown, on the results page */
  defaultValue?: string;
  className?: string;
}) {
  const t = useTranslations("community.search");
  return (
    <search className={cn("w-full", className)}>
      <form action="/community/all" className="relative" method="get">
        <SearchNormal1
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        />
        <Input
          aria-label={t("label")}
          autoComplete="off"
          // A narrow phone fits the hint at a size smaller than what's typed
          // (16px, so iOS doesn't zoom), and a long one ends in "…"
          className="h-10 rounded-full pl-10 text-ellipsis placeholder:text-sm"
          defaultValue={defaultValue}
          enterKeyHint="search"
          key={defaultValue}
          maxLength={100}
          name="q"
          placeholder={t("placeholder")}
          type="search"
        />
      </form>
    </search>
  );
}
