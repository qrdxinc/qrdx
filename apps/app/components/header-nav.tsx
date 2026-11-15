"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@repo/design-system/components/ui/navigation-menu";
import { cn } from "@repo/design-system/lib/utils";
import { splitLocale } from "@repo/i18n/paths";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  LocaleLink as Link,
  useLocalizeHref,
} from "@/components/i18n/locale-link";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";
import {
  HEADER_MENUS,
  HEADER_PRICING,
  type ItemKey,
  isExternalHref,
  type LinkKey,
  type MenuId,
  type NavIcon,
  type ProductArt,
} from "@/config/navigation";
import styles from "./header-nav.module.css";
import { ColumnsPanel } from "./header-nav-panel";

/** A menu link in the visitor's language, for this deployment. */
export interface HeaderLink {
  key: LinkKey;
  href: string;
  name: string;
  /** The promise under the name; none on compact rows. */
  description?: string;
  /** The mobile menu's shorter promise. */
  short?: string;
  icon: NavIcon;
  external: boolean;
  compact: boolean;
  art?: ProductArt;
  github?: boolean;
}

export interface HeaderColumn {
  label: string;
  links: HeaderLink[];
}

export type HeaderMenu =
  | { id: "product"; name: string; cards: HeaderLink[] }
  | {
      id: Exclude<MenuId, "product">;
      name: string;
      columns: HeaderColumn[];
      strip: HeaderLink[];
    };

type LinkConfig = {
  key: LinkKey;
  href: string;
  icon: NavIcon;
  compact?: boolean;
  art?: ProductArt;
  github?: boolean;
};

/**
 * Turns a configured link into what the menus render: its name and promise
 * in the visitor's language and its href in that language where the page
 * exists, or nothing for a page about a feature this deployment can't offer
 * (packages/availability/rules.ts), like AI QR art.
 */
export function useResolveLink(): (link: LinkConfig) => HeaderLink[] {
  const { showsPath } = useAvailability();
  const t = useTranslations("nav");
  const names = useTranslations("footer.links");
  const localize = useLocalizeHref();

  return useCallback(
    (link: LinkConfig) => {
      const external = isExternalHref(link.href);
      if (!(external || showsPath(link.href))) return [];
      const compact = Boolean(link.compact);
      const item = link.key as ItemKey;
      return [
        {
          key: link.key,
          href: external ? link.href : localize(link.href),
          name: names(link.key),
          ...(!compact && {
            description: t(`items.${item}.description`, {
              max: MAX_BULK_ROWS,
            }),
            short: t(`items.${item}.short`),
          }),
          icon: link.icon,
          external,
          compact,
          art: link.art,
          github: link.github,
        },
      ];
    },
    [showsPath, t, names, localize],
  );
}

/** The header's menus, resolved (useResolveLink); empty menus drop out. */
export function useHeaderMenus(): HeaderMenu[] {
  const t = useTranslations("nav");
  const resolve = useResolveLink();

  return useMemo(
    () =>
      HEADER_MENUS.flatMap((menu): HeaderMenu[] => {
        const name = t(`entries.${menu.id}`);
        if (menu.id === "product") {
          const cards = menu.cards.flatMap(resolve);
          return cards.length > 0 ? [{ id: menu.id, name, cards }] : [];
        }
        const columns = menu.columns.flatMap((column) => {
          const links = column.links.flatMap(resolve);
          return links.length > 0
            ? [{ label: t(`columns.${column.label}`), links }]
            : [];
        });
        if (columns.length === 0) return [];
        return [
          { id: menu.id, name, columns, strip: menu.strip.flatMap(resolve) },
        ];
      }),
    [t, resolve],
  );
}

/** Every link a menu holds, in order. */
export const menuLinks = (menu: HeaderMenu): HeaderLink[] =>
  menu.id === "product"
    ? menu.cards
    : [...menu.columns.flatMap((column) => column.links), ...menu.strip];

// Loaded when the pointer first comes near the menus (or a menu opens): it
// carries the qrdx engine for the Product menu's live codes, which no page
// needs before that.
const loadProductPanel = () => import("./header-product-panel");
const ProductPanel = lazy(loadProductPanel);

/**
 * A closed menu's links, as plain anchors in the server HTML. Radix only
 * mounts a panel once it opens, so without these the page's first HTML has
 * no link to anything inside the menus and crawlers can't follow them.
 * `hidden` keeps them out of view, out of the tab order and out of the
 * accessibility tree; the open panel is what people use.
 */
function MenuLinks({ links }: { links: HeaderLink[] }) {
  return (
    <ul hidden>
      {links.map((link) => (
        <li key={link.href}>
          <a href={link.href}>{link.name}</a>
        </li>
      ))}
    </ul>
  );
}

/** Hover intent before a closed menu opens (Radix's delayDuration). */
const OPEN_DELAY_MS = 150;
/**
 * After the pointer leaves, Radix waits 150 ms before it asks to close; the
 * panel waits this much more, so a diagonal move back to it doesn't lose it.
 * Escape, a click or a keyboard move closes at once.
 */
const CLOSE_GRACE_MS = 200;

export function HeaderNav({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const names = useTranslations("footer.links");
  const menus = useHeaderMenus();
  const localize = useLocalizeHref();
  // Hrefs are localized, so match the current page by its localized URL.
  const pathname = usePathname() ?? "/";
  const pricingHref = localize(HEADER_PRICING.href);
  const onPricing = splitLocale(pathname).path === HEADER_PRICING.href;

  const [value, setValue] = useState("");
  const [switching, setSwitching] = useState(false);
  const current = useRef("");
  const pointerInside = useRef(false);
  const closeNow = useRef(false);
  const closeTimer = useRef(0);

  const commit = (next: string) => {
    window.clearTimeout(closeTimer.current);
    setSwitching(current.current !== "" && next !== "");
    current.current = next;
    setValue(next);
  };

  const onValueChange = (next: string) => {
    window.clearTimeout(closeTimer.current);
    const leaving = next === "" && !pointerInside.current && !closeNow.current;
    closeNow.current = false;
    if (leaving) {
      closeTimer.current = window.setTimeout(() => commit(""), CLOSE_GRACE_MS);
      return;
    }
    commit(next);
  };

  // A key or a click outside closes at once rather than after the grace.
  // Radix handles both in the same event, after these capture listeners.
  useEffect(() => {
    if (!value) return;
    const mark = () => {
      closeNow.current = true;
      window.setTimeout(() => {
        closeNow.current = false;
      }, 0);
    };
    window.addEventListener("keydown", mark, true);
    window.addEventListener("pointerdown", mark, true);
    return () => {
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("pointerdown", mark, true);
    };
  }, [value]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <NavigationMenu
      value={value}
      onValueChange={onValueChange}
      delayDuration={OPEN_DELAY_MS}
      onPointerEnter={() => {
        pointerInside.current = true;
        window.clearTimeout(closeTimer.current);
        loadProductPanel();
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
      }}
      onFocus={() => loadProductPanel()}
      aria-label={t("main")}
      data-switching={switching ? "" : undefined}
      className={cn(styles.nav, "static", className)}
    >
      <NavigationMenuList className="gap-0.5">
        {menus.map((menu) => (
          <NavigationMenuItem key={menu.id} value={menu.id}>
            <NavigationMenuTrigger className={styles.trigger}>
              {menu.name}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              {menu.id === "product" ? (
                <Suspense fallback={<div className="h-[23.75rem]" />}>
                  <ProductPanel cards={menu.cards} pathname={pathname} />
                </Suspense>
              ) : (
                <ColumnsPanel menu={menu} pathname={pathname} />
              )}
            </NavigationMenuContent>
            <MenuLinks links={menuLinks(menu)} />
          </NavigationMenuItem>
        ))}
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            active={onPricing}
            className={cn(styles.trigger, "flex-row items-center")}
          >
            <Link
              href={pricingHref}
              aria-current={onPricing ? "page" : undefined}
            >
              {names(HEADER_PRICING.key)}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
