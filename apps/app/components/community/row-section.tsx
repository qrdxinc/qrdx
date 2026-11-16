// A row's heading on the community pages: its title, a short grey line
// under it, and "View all" on the right when there's a page with more.

import { ArrowRight2 } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function RowSection({
  id,
  title,
  sub,
  badge,
  href,
  children,
}: {
  /** The heading's id, for aria-labelledby and links to the row */
  id?: string;
  title: string;
  sub?: string;
  /** After the title (the verified mark) */
  badge?: ReactNode;
  href?: string;
  children: ReactNode;
}) {
  const t = useTranslations("community.itemCard");
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className="scroll-mt-20 space-y-4"
      id={id}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <h2
            className="flex items-center gap-1.5 text-lg font-semibold tracking-tight md:text-xl"
            id={headingId}
          >
            {title}
            {badge}
          </h2>
          {sub && (
            <p className="text-muted-foreground text-sm text-pretty sm:truncate">
              {sub}
            </p>
          )}
        </div>
        {href && (
          <Link
            aria-label={`${t("viewAll")}: ${title}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 group/all -mr-1 flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]"
            href={href}
          >
            {t("viewAll")}
            <ArrowRight2
              aria-hidden
              className="size-3.5 transition-transform duration-200 motion-safe:group-hover/all:translate-x-0.5"
            />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
