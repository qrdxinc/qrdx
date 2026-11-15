"use client";

import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import { QrdxLogoAnimation } from "@repo/design-system/components/brand/qrdx-logo-animation";
import { Close } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { HamburgerMenu } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import {
  HeaderAccountLinks,
  HeaderSignInRow,
} from "@/components/header-account-link";
import { HeaderMobileNav } from "@/components/header-mobile-nav";
import { HeaderNav } from "@/components/header-nav";
import { LocaleLink } from "@/components/i18n/locale-link";
import styles from "./navbar.module.css";

/** Where the desktop menus take over from the mobile one (Tailwind `lg`). */
const DESKTOP = "(min-width: 64rem)";

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return scrolled;
}

/**
 * The marketing pages' header: 56 px and sticky, as wide as the page frame.
 * Logo left, the menus centred, the account actions right. On phones a menu
 * button opens every destination in a panel under the bar.
 */
export function Navbar() {
  const t = useTranslations("nav");
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuId = useId();

  // A new page closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on navigation
  useEffect(() => setMenuOpen(false), [pathname]);

  // While it's open: the page under it doesn't scroll, Escape closes it,
  // and so does growing the window to the desktop menus.
  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const desktop = window.matchMedia(DESKTOP);
    const onWidth = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onWidth);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onWidth);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    // z-30 over the page; with the menu open, over page-level layers too
    // (the cookie banner is z-50).
    <header
      className={cn(
        "sticky top-0 h-[56px] w-full",
        menuOpen ? "z-[60]" : "z-30",
      )}
    >
      <div
        aria-hidden
        className={cn(styles.strip, "absolute inset-0")}
        data-shown={scrolled || menuOpen ? "" : undefined}
        data-solid={menuOpen ? "" : undefined}
      />
      <div className="relative h-full px-10">
        <div className="relative grid h-full grid-cols-[1fr_auto] items-center gap-3 lg:grid-cols-[1fr_auto_1fr] lg:gap-4">
          <LocaleLink
            href="/"
            onClick={close}
            className="flex w-fit items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <QrdxLogo className="block size-5 fill-secondary-foreground lg:hidden" />
            <QrdxLogoAnimation size={28} className="hidden lg:block" />
            <span className="text-lg font-semibold tracking-tight text-secondary-foreground">
              QRdx
            </span>
          </LocaleLink>

          <HeaderNav className="hidden lg:flex" />

          <div className="flex items-center justify-end gap-2">
            <HeaderAccountLinks />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="-mr-1.5 grid size-9 place-items-center rounded-full text-foreground/70 outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              {menuOpen ? (
                <Close aria-hidden className="size-5" />
              ) : (
                <HamburgerMenu aria-hidden className="size-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div
          id={menuId}
          className="fixed inset-x-0 top-[56px] bottom-0 overflow-y-auto overscroll-contain bg-background lg:hidden"
        >
          <HeaderMobileNav
            onNavigate={close}
            className="px-10 pt-2 pb-10"
            footer={<HeaderSignInRow onNavigate={close} className="mt-6" />}
          />
        </div>
      )}
    </header>
  );
}
