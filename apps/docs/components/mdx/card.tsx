import { cn } from "@repo/design-system/lib/utils";
import Link from "fumadocs-core/link";
import { ArrowRight } from "iconsax-reactjs";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

/**
 * A grid of cards: one column on phones, two from `sm`. An odd last card
 * spans the row instead of sitting alone in a half-empty one.
 */
export function Cards({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "not-prose my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 [&>[data-card]:last-child:nth-child(odd)]:col-span-full",
        className,
      )}
    />
  );
}

export interface CardProps extends Omit<ComponentProps<"a">, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  /** Show an arrow at the end of the title (a "go there" affordance). */
  arrow?: boolean;
  external?: boolean;
}

/**
 * A card: an icon in a consistent tile, a title, a short description and,
 * with `href`, the whole card as the link. Cards keep the design system's
 * radius where the rest of the prose uses a smaller one (styles/styles.css).
 */
export function Card({
  icon,
  title,
  description,
  href,
  arrow = false,
  external,
  className,
  style,
  children,
  ...props
}: CardProps) {
  const body = (
    <>
      {icon ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-fd-background text-fd-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium text-[0.9375rem] leading-snug text-fd-foreground">
          {title}
        </span>
        {arrow ? (
          <ArrowRight
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-fd-muted-foreground transition-transform duration-200 group-hover/card:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180"
          />
        ) : null}
      </span>
      {description ? (
        <span className="text-sm leading-relaxed text-fd-muted-foreground">
          {description}
        </span>
      ) : null}
      {children ? (
        <div className="text-sm leading-relaxed text-fd-muted-foreground prose-no-margin">
          {children}
        </div>
      ) : null}
    </>
  );
  const classes = cn(
    "group/card flex flex-col gap-2 rounded-xl border bg-fd-card p-4 text-start text-fd-card-foreground",
    href &&
      "transition-colors hover:border-fd-foreground/20 hover:bg-fd-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
    className,
  );
  const radius = {
    "--radius": "var(--docs-card-radius)",
    ...style,
  } as CSSProperties;

  if (href) {
    return (
      <Link
        {...props}
        className={classes}
        data-card
        external={external}
        href={href}
        style={radius}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={classes} data-card style={radius}>
      {body}
    </div>
  );
}
