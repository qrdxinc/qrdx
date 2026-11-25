// The type mark: one app-icon tile per QR content type and hosted page type,
// so a type reads at a glance (WhatsApp green, Wi-Fi blue). Colours and
// glyphs live in lib/type-marks/data.ts; the glyph is white unless a brand
// draws its mark dark (lib/type-marks/ink.ts). Plain markup, no hooks:
// server pages (the /qr-code-generator hub and its per-type pages) and client
// components (the type picker) share it. Open Graph images draw the same tile
// with type-mark-og.tsx.

import { LinkedinLogo } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrangeHorizontalSquare,
  Bag2,
  Bank,
  Box,
  Briefcase,
  Brush2,
  Calendar1,
  CalendarAdd,
  CalendarEdit,
  Call,
  CardSend,
  Coin,
  DocumentText,
  Element4,
  Flash,
  Gallery,
  Health,
  House,
  type Icon,
  Link,
  Link21,
  Location,
  Lovely,
  Map1,
  MessageFavorite,
  MessageText1,
  Mobile,
  MoneySend,
  Moneys,
  Music,
  MusicPlaylist,
  MusicSquare,
  People,
  Personalcard,
  Pet,
  Profile2User,
  ReceiptText,
  Reserve,
  ScanBarcode,
  Shop,
  ShoppingCart,
  Sms,
  SmsStar,
  Tag2,
  Task,
  TaskSquare,
  Text,
  TicketDiscount,
  UserEdit,
  UserSquare,
  UserTag,
  Video,
  Wallet2,
  Wifi,
  WifiSquare,
} from "iconsax-reactjs";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { BrandLogo, type BrandMarkSlug } from "@/lib/brand-logos/brand-logo";
import { BRAND_MARKS } from "@/lib/brand-logos/marks.generated";
import { EDITOR_INTEGRATIONS } from "@/lib/integration-catalog";
import type { TypeMarkEntry } from "@/lib/type-marks/data";
import {
  contentTypeMark,
  glyphInk,
  isNearBlack,
  markFill,
  pageTypeMark,
  tintInks,
  WHITE_INK,
} from "@/lib/type-marks/ink";

type AnyIcon = Icon | ComponentType<{ className?: string }>;

/**
 * The iconsax glyphs data.ts may name (drawn Bold so they read when small).
 * Add the import here when a new entry names another icon.
 */
export const TYPE_MARK_GLYPHS: Record<string, Icon> = {
  ArrangeHorizontalSquare,
  Bag2,
  Bank,
  Box,
  Brush2,
  Briefcase,
  Calendar1,
  CalendarAdd,
  CalendarEdit,
  Call,
  CardSend,
  Coin,
  DocumentText,
  Element4,
  Flash,
  Gallery,
  Health,
  House,
  Link,
  Link21,
  Location,
  Lovely,
  Map1,
  MessageFavorite,
  MessageText1,
  Mobile,
  Moneys,
  MoneySend,
  Music,
  MusicPlaylist,
  MusicSquare,
  People,
  Personalcard,
  Pet,
  Profile2User,
  ReceiptText,
  Reserve,
  ScanBarcode,
  Shop,
  ShoppingCart,
  Sms,
  SmsStar,
  Tag2,
  Task,
  TaskSquare,
  Text,
  TicketDiscount,
  UserEdit,
  UserSquare,
  UserTag,
  Video,
  Wallet2,
  Wifi,
  WifiSquare,
};

export type TypeMarkSize = 28 | 36 | 44 | 56 | 64 | 80;

/** "fill" (the default): the type's colour with a light glyph. "tint": the glyph in that colour on a pale wash of it. */
export type TypeMarkVariant = "fill" | "tint";

interface TypeMarkTarget {
  /** A QR content type id (CONTENT_TYPES_METADATA). */
  type?: string;
  /** A hosted page type id (lib/landing/page-type-ids.ts). */
  pageType?: string;
  /** The type's own icon, drawn on a slate tile when it has no entry yet. */
  fallbackIcon?: AnyIcon;
}

export interface TypeMarkProps extends TypeMarkTarget {
  size?: TypeMarkSize;
  variant?: TypeMarkVariant;
  className?: string;
}

/** A type's entry in lib/type-marks/data.ts, or undefined when it has none yet. */
export function typeMarkEntry({ type, pageType }: TypeMarkTarget) {
  return pageType ? pageTypeMark(pageType) : contentTypeMark(type);
}

export type TypeMarkGlyph =
  | { kind: "brand"; slug: BrandMarkSlug }
  | { kind: "integration"; light: string; dark: string }
  | { kind: "icon"; Icon: AnyIcon; bold: boolean };

/** What an entry's glyph draws: a brand's mark, an integration's logo files or an icon. */
export function resolveGlyph(
  entry: TypeMarkEntry | undefined,
  fallbackIcon: AnyIcon | undefined,
): TypeMarkGlyph {
  const glyph = entry?.glyph ?? "";
  if (glyph.startsWith("brand:")) {
    const slug = glyph.slice("brand:".length);
    if (Object.hasOwn(BRAND_MARKS, slug)) {
      return { kind: "brand", slug: slug as BrandMarkSlug };
    }
  } else if (glyph.startsWith("integration:")) {
    const slug = glyph.slice("integration:".length);
    const integration = EDITOR_INTEGRATIONS.find((item) => item.slug === slug);
    if (integration) {
      const { light, dark } = integration.logos;
      return { kind: "integration", light, dark: dark ?? light };
    }
  } else if (glyph === "LinkedinLogo") {
    // LinkedIn isn't in Simple Icons; the design system keeps its mark.
    return { kind: "icon", Icon: LinkedinLogo, bold: false };
  } else if (Object.hasOwn(TYPE_MARK_GLYPHS, glyph)) {
    return { kind: "icon", Icon: TYPE_MARK_GLYPHS[glyph] as Icon, bold: true };
  }
  return { kind: "icon", Icon: fallbackIcon ?? Link, bold: true };
}

/**
 * Simple Icons marks that are wide wordmarks: drawn in a wider box, or their
 * letters end up a few pixels tall.
 */
const WORDMARKS = new Set<string>(["caldotcom", "sepa", "venmo", "zoom"]);

/**
 * The glyph's box on a tile of `size`: iconsax glyphs at 62% (their art has
 * its own air), brand marks and logos at 52%, wide wordmarks at 74%.
 */
export function glyphBox(size: number, glyph: TypeMarkGlyph): number {
  if (glyph.kind === "icon" && glyph.bold) return Math.round(size * 0.62);
  const wide = glyph.kind === "brand" && WORDMARKS.has(glyph.slug);
  return Math.round(size * (wide ? 0.74 : 0.52));
}

const RING =
  "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]";
// From 44 px: the same ring plus a very soft drop shadow.
const RING_LIFTED =
  "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.06),0_6px_14px_-8px_rgb(0_0_0/0.25)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.5),0_6px_14px_-8px_rgb(0_0_0/0.7)]";

/** The tile's soft top highlight. */
export const TYPE_MARK_HIGHLIGHT =
  "linear-gradient(to bottom, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0) 50%)";

const tintOf = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** A QR type's app-icon tile: its colour, its real mark or an iconsax glyph. */
export function TypeMark({
  type,
  pageType,
  fallbackIcon,
  size = 36,
  variant = "fill",
  className,
}: TypeMarkProps) {
  const entry = typeMarkEntry({ type, pageType });
  const fill = markFill(entry);
  const glyph = resolveGlyph(entry, fallbackIcon);
  const tint = variant === "tint";
  const inks = tintInks(fill);
  const ink = glyphInk(entry);

  const style = (
    tint
      ? {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          "--mark-ink": inks.light,
          "--mark-ink-dark": inks.dark,
          "--mark-bg": tintOf(fill, 12),
          "--mark-bg-dark": tintOf(isNearBlack(fill) ? inks.dark : fill, 12),
        }
      : {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: fill,
          backgroundImage: TYPE_MARK_HIGHLIGHT,
          color: ink,
        }
  ) as CSSProperties;

  const markSize = glyphBox(size, glyph);

  let content: ReactNode;
  if (glyph.kind === "brand") {
    content = (
      <BrandLogo color="currentColor" size={markSize} slug={glyph.slug} />
    );
  } else if (glyph.kind === "integration") {
    // Their own logo files: the light one is drawn for light grounds.
    const onDark = tint ? null : ink === WHITE_INK;
    const img = (src: string, className?: string) => (
      <img
        alt=""
        className={className}
        height={markSize}
        key={src}
        src={src}
        width={markSize}
      />
    );
    content =
      onDark === null
        ? [
            img(glyph.light, "dark:hidden"),
            img(glyph.dark, "hidden dark:block"),
          ]
        : img(onDark ? glyph.dark : glyph.light);
  } else {
    // A sized box with the svg filling it, so any icon component (iconsax,
    // a brandIcon() fallback, the LinkedIn mark) follows the tile's size.
    const GlyphIcon = glyph.Icon as ComponentType<{
      className?: string;
      variant?: "Bold";
    }>;
    content = (
      <span className="grid" style={{ width: markSize, height: markSize }}>
        {glyph.bold ? (
          <GlyphIcon className="size-full" variant="Bold" />
        ) : (
          <GlyphIcon className="size-full" />
        )}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center",
        size >= 44 ? RING_LIFTED : RING,
        tint &&
          "bg-[var(--mark-bg)] text-[var(--mark-ink)] dark:bg-[var(--mark-bg-dark)] dark:text-[var(--mark-ink-dark)]",
        className,
      )}
      data-type-mark={pageType ? `page:${pageType}` : type}
      style={style}
    >
      {content}
    </span>
  );
}

/**
 * A big mark's soft wash: 22% of its colour at the centre (16% on the dark
 * theme, where colour glows more), fading out.
 */
const WASH =
  "bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--mark-wash)_22%,transparent),transparent)] dark:bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--mark-wash)_16%,transparent),transparent)]";

/**
 * The colour a wash is mixed from. Black fills (X, TikTok) would smudge
 * grey, or vanish on the dark theme: they wash with half-strength text
 * colour instead.
 */
function washStyle(target: TypeMarkTarget): CSSProperties {
  const fill = markFill(typeMarkEntry(target));
  const wash = isNearBlack(fill)
    ? "color-mix(in srgb, var(--foreground) 45%, transparent)"
    : fill;
  return { "--mark-wash": wash } as CSSProperties;
}

/**
 * A big mark on a soft wash of its colour (the picker's Popular cards, the
 * hub's cards). The wash is a 16:10 ellipse as tall as the area, centred,
 * so wide cards get the same soft shape rather than a long streak.
 */
export function TypeMarkArt({
  size = 64,
  phoneSize,
  className,
  markClassName,
  variant,
  ...target
}: TypeMarkTarget & {
  size?: TypeMarkSize;
  /** The mark's size below 640 px wide, where the art is shorter. */
  phoneSize?: TypeMarkSize;
  variant?: TypeMarkVariant;
  className?: string;
  /** Extra classes for the mark (a hover lift). */
  markClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative grid place-items-center", className)}
    >
      <span
        className={cn(
          "absolute top-0 left-1/2 aspect-[16/10] h-full -translate-x-1/2",
          WASH,
        )}
        style={washStyle(target)}
      />
      <span
        className={cn(
          "relative grid",
          phoneSize && "max-sm:[scale:var(--mark-phone-scale)]",
        )}
        style={
          phoneSize
            ? ({ "--mark-phone-scale": phoneSize / size } as CSSProperties)
            : undefined
        }
      >
        <TypeMark
          {...target}
          className={markClassName}
          size={size}
          variant={variant}
        />
      </span>
    </span>
  );
}

/** The hover lift big marks may do (1 px, none with reduced motion). */
export const TYPE_MARK_LIFT =
  "transition-transform duration-200 ease-out group-hover:-translate-y-px group-focus-visible:-translate-y-px motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-focus-visible:translate-y-0";

/**
 * A type card's header (the /qr-code-generator hub, the Related grids of its
 * per-type pages): the 80 px mark on its wash, 128 px tall; on phones 112 px
 * with a 56 px mark.
 */
export function TypeMarkCardArt(target: TypeMarkTarget) {
  return (
    <TypeMarkArt
      {...target}
      className="h-32 w-full max-sm:h-28"
      markClassName={TYPE_MARK_LIFT}
      phoneSize={56}
      size={80}
    />
  );
}

/**
 * A page's mark above its title (the per-type generator pages): the mark on
 * a round wash of its colour, 160 px across. Only the mark takes up room;
 * the wash spills past it, under the text around it.
 */
export function TypeMarkHero({
  size = 64,
  phoneSize = 56,
  className,
  ...target
}: TypeMarkTarget & {
  size?: TypeMarkSize;
  /** The mark's size below 640 px wide. */
  phoneSize?: TypeMarkSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative size-[var(--mark-box)] shrink-0 max-sm:size-[var(--mark-box-phone)]",
        className,
      )}
      style={
        {
          "--mark-box": `${size}px`,
          "--mark-box-phone": `${phoneSize}px`,
          "--mark-phone-scale": phoneSize / size,
        } as CSSProperties
      }
    >
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -z-10 size-40 -translate-x-1/2 -translate-y-1/2",
          WASH,
        )}
        style={washStyle(target)}
      />
      <span className="absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 max-sm:[scale:var(--mark-phone-scale)]">
        <TypeMark {...target} size={size} />
      </span>
    </span>
  );
}
