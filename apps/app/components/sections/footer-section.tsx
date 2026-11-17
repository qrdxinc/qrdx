"use client";

import { CookieSettingsButton } from "@repo/analytics/consent/cookie-settings-button";
import {
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  GITHUB_REPO_URL,
  X_PROFILE_URL,
} from "@repo/config";
import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import { GithubLogo, XLogo } from "@repo/design-system/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowUp2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { GithubStarCount } from "@/components/github-stars";
import { LocaleLink, useLocalizeHref } from "@/components/i18n/locale-link";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  type FooterLink,
} from "@/config/navigation";
import { LANDING_PATH } from "@/lib/home-path";

const LINK =
  "rounded-sm text-sm leading-5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const SOCIAL =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A footer link's text: the destination's name, or one that stays as is. */
function useLinkText() {
  const t = useTranslations("footer.links");
  return (link: FooterLink) => (link.key ? t(link.key) : link.label);
}

/** "Legal ▾": the legal pages in a small menu that opens upwards. */
function LegalMenu({ links }: { links: FooterLink[] }) {
  const t = useTranslations("footer.links");
  const text = useLinkText();
  const localize = useLocalizeHref();
  const [open, setOpen] = useState(false);

  return (
    <li>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            LINK,
            "group inline-flex items-center gap-1",
            open && "text-foreground",
          )}
        >
          {t("legal")}
          <ArrowUp2
            aria-hidden
            className="size-3 transition-transform duration-200 group-data-[state=closed]:rotate-180 motion-reduce:transition-none"
          />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-56 rounded-xl p-1.5 shadow-md"
        >
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <LocaleLink
                  href={link.href}
                  prefetch={false}
                  onClick={() => setOpen(false)}
                  className="flex h-9 items-center rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground"
                >
                  {text(link)}
                </LocaleLink>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {/* The popover mounts only when open: these keep its links in the
          page's HTML for crawlers, out of view and out of the tab order. */}
      <ul hidden>
        {links.map((link) => (
          <li key={link.href}>
            <a href={localize(link.href)}>{text(link)}</a>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function FooterSection() {
  const t = useTranslations("footer");
  const github = useTranslations("nav.github");
  const text = useLinkText();
  const year = String(new Date().getFullYear());
  // No links to pages for features this deployment can't offer.
  const { showsPath } = useAvailability();

  return (
    <footer id="footer" className="w-full border-t">
      <div className="flex flex-col gap-12 px-10 pt-14 pb-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {/* The home page (English only) at its /home address. */}
            <LocaleLink
              href={LANDING_PATH}
              className="flex w-fit items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <QrdxLogo className="size-5 text-foreground" />
              <span className="text-lg font-semibold tracking-tight">QRdx</span>
            </LocaleLink>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="-ml-2 flex items-center gap-1 sm:ml-0">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL}
              aria-label={github("starOnGithub")}
            >
              <GithubLogo aria-hidden className="size-4" />
              <GithubStarCount />
            </a>
            <a
              href={X_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SOCIAL}
              aria-label={t("newsOnX")}
            >
              <XLogo aria-hidden className="size-3.5" />
            </a>
          </div>
        </div>

        <nav aria-label={t("navLabel")}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.key} className="flex flex-col gap-4">
                <h2 className="text-sm font-medium text-foreground">
                  {t(`columns.${column.key}`)}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {column.links
                    .filter((link) => showsPath(link.href))
                    .map((link) => (
                      <li key={link.href}>
                        <LocaleLink
                          href={link.href}
                          className={LINK}
                          prefetch={false}
                        >
                          {text(link)}
                        </LocaleLink>
                      </li>
                    ))}
                  {column.key === "company" && (
                    // The affiliate terms only where the program runs.
                    <LegalMenu
                      links={FOOTER_LEGAL.filter((link) =>
                        showsPath(link.href),
                      )}
                    />
                  )}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t px-10 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            {t("copyright", { year })}
          </p>
          <CookieSettingsButton />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LocaleSwitcher />
          <a
            href={CANONICAL_ORIGIN}
            className="w-fit font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {CANONICAL_HOST}
          </a>
        </div>
      </div>
    </footer>
  );
}
