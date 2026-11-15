"use client";

import { NavigationMenuLink } from "@repo/design-system/components/ui/navigation-menu";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, ExportSquare } from "iconsax-reactjs";
import { GithubStarCount } from "@/components/github-stars";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type { HeaderLink, HeaderMenu } from "./header-nav";
import styles from "./header-nav.module.css";

const externalProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/**
 * One link inside a menu panel. Its href is already localized; links don't
 * prefetch, since opening a menu would fetch every destination's code at once.
 */
export function PanelLink({
  link,
  pathname,
  className,
  children,
}: {
  link: HeaderLink;
  pathname: string;
  className?: string;
  children: React.ReactNode;
}) {
  const current = !link.external && pathname === link.href;
  return (
    <NavigationMenuLink asChild active={current} className={className}>
      <Link
        href={link.href}
        aria-current={current ? "page" : undefined}
        prefetch={false}
        {...(link.external && externalProps)}
      >
        {children}
      </Link>
    </NavigationMenuLink>
  );
}

function Row({ link, pathname }: { link: HeaderLink; pathname: string }) {
  const Icon = link.icon;
  if (link.compact) {
    return (
      <PanelLink
        link={link}
        pathname={pathname}
        className={cn(styles.item, "flex-row items-center gap-3 px-2 py-1.5")}
      >
        <span
          className={cn(
            styles.box,
            "grid size-[26px] shrink-0 place-items-center",
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </span>
        <span className="text-sm font-medium text-foreground/85">
          {link.name}
        </span>
      </PanelLink>
    );
  }
  return (
    <PanelLink
      link={link}
      pathname={pathname}
      className={cn(styles.item, "flex-row items-center gap-3 p-2")}
    >
      <span
        className={cn(
          styles.box,
          "grid size-[38px] shrink-0 place-items-center",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium leading-5 text-foreground">
          {link.name}
        </span>
        <span className="truncate text-xs leading-4 text-muted-foreground">
          {link.description}
        </span>
      </span>
    </PanelLink>
  );
}

/** A full-width row under the columns: a name, its promise and an arrow. */
function StripLink({ link, pathname }: { link: HeaderLink; pathname: string }) {
  const Icon = link.icon;
  return (
    <PanelLink
      link={link}
      pathname={pathname}
      className={cn(
        styles.item,
        "group/strip min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2.5",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-foreground/80" />
      <span className="text-sm font-medium text-foreground">{link.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {link.description}
      </span>
      {link.github ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <GithubStarCount />
          <ExportSquare aria-hidden className="size-3" />
        </span>
      ) : (
        <ArrowRight
          aria-hidden
          className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/strip:translate-x-0.5 motion-reduce:transition-none"
        />
      )}
    </PanelLink>
  );
}

/** Solutions, Developers and Resources: labelled columns and a strip. */
export function ColumnsPanel({
  menu,
  pathname,
}: {
  menu: Exclude<HeaderMenu, { id: "product" }>;
  pathname: string;
}) {
  return (
    <div className="flex flex-col">
      <div className={styles.columns}>
        {menu.columns.map((column) => (
          <div
            key={column.label}
            className={cn(styles.column, "flex flex-col gap-2 px-4 py-4")}
          >
            <p className={cn(styles.label, "px-2 pt-1 pb-1")}>{column.label}</p>
            <ul className="flex flex-col gap-0.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Row link={link} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {menu.strip.length > 0 && (
        <div className={cn(styles.strip, "flex gap-2 px-3 py-1.5")}>
          {menu.strip.map((link) => (
            <StripLink key={link.href} link={link} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}
