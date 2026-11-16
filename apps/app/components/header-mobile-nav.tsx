"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { ExportSquare, HamburgerMenu } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  LocaleLink as Link,
  useLocalizeHref,
} from "@/components/i18n/locale-link";
import { MOBILE_ROWS, mobileGroups } from "@/config/navigation";
import { type HeaderLink, useResolveLink } from "./header-nav";

/** The mobile menu's groups, resolved like the desktop menus. */
function useMobileGroups() {
  const t = useTranslations("nav");
  const resolve = useResolveLink();
  return useMemo(
    () =>
      mobileGroups().flatMap((group) => {
        const links = group.links.flatMap(resolve);
        return links.length > 0
          ? [{ id: group.id, name: t(`entries.${group.id}`), links }]
          : [];
      }),
    [t, resolve],
  );
}

function GroupLink({
  link,
  current,
  onNavigate,
}: {
  link: HeaderLink;
  current: boolean;
  onNavigate?: () => void;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      prefetch={false}
      className={cn(
        "flex items-center gap-3 rounded-[10px] p-1.5 -mx-1.5 outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring active:bg-foreground/[0.06]",
        current && "bg-foreground/[0.04]",
      )}
      {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-[8px] border border-border bg-background",
          link.compact ? "size-8" : "size-10",
        )}
      >
        <Icon aria-hidden className="size-4 text-foreground/80" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-sm font-medium text-foreground">
          {link.name}
          {link.external && (
            <ExportSquare
              aria-hidden
              className="size-3 text-muted-foreground"
            />
          )}
        </span>
        {link.short && (
          <span className="text-sm text-muted-foreground">{link.short}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * Every header destination for phones: the menus as accordions (several can
 * be open at once), then the pages people look for most as plain rows, then
 * `footer` (the account action). No prefetching: opening the menu would fetch
 * every destination at once.
 */
export function HeaderMobileNav({
  onNavigate,
  footer,
  className,
}: {
  onNavigate?: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("nav");
  const names = useTranslations("footer.links");
  const pathname = usePathname() ?? "/";
  const groups = useMobileGroups();
  const { showsPath } = useAvailability();
  const localize = useLocalizeHref();
  const rows = MOBILE_ROWS.filter((row) => showsPath(row.href));

  return (
    <nav aria-label={t("main")} className={cn("flex flex-col", className)}>
      <Accordion type="multiple">
        {groups.map((group) => (
          <AccordionItem
            key={group.id}
            value={group.id}
            className="border-b border-border last:border-b"
          >
            <AccordionTrigger className="items-center rounded-none py-3.5 text-base font-semibold hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">
              {group.name}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2.5 pt-0.5 pb-5">
              {group.links.map((link) => (
                <GroupLink
                  key={link.href}
                  link={link}
                  current={!link.external && pathname === link.href}
                  onNavigate={onNavigate}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const href = localize(row.href);
          const current = pathname === href;
          return (
            <li key={row.href} className="border-b border-border">
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                prefetch={false}
                className="flex h-[3.1rem] items-center text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {names(row.key)}
              </Link>
            </li>
          );
        })}
      </ul>
      {footer}
    </nav>
  );
}

/** Menu button and side sheet for the app's header (components/header.tsx). */
export function HeaderMobileMenu({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 lg:hidden", className)}
          aria-label={t("openMenu")}
        >
          <HamburgerMenu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[22rem] max-w-[90vw] gap-2 overflow-y-auto p-5 sm:max-w-[22rem]"
        aria-describedby={undefined}
      >
        <SheetTitle className="text-base">{t("menu")}</SheetTitle>
        <HeaderMobileNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
