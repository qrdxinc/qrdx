// A server component (no "use client"): page template cards render their
// page preview here, so the page itself never goes to the browser.

import { cn } from "@repo/design-system/lib/utils";
import { Archive } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TemplatePreview } from "@/components/landing/template-preview";
import {
  type CommunityItemCard,
  itemPath,
  TYPE_LABELS,
  TYPE_SEGMENTS,
} from "@/lib/community/types";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  RAIL_CARD,
  RAIL_RANKED,
  RANK_NUMERAL,
  RANK_ROOM,
  RANK_ROOM_WIDE,
} from "./card-layout";
import { CardRail } from "./card-rail";
import { CreatorLine } from "./creator-line";
import { LazyDesignQr } from "./design-qr";
import numeral from "./rank-numeral.module.css";
import { RowSection } from "./row-section";

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });

/** Where a card goes: its item page, or the type's gallery (legacy themes). */
export const cardHref = (card: CommunityItemCard) =>
  card.slug
    ? itemPath(card.type, card.slug)
    : `/community/${TYPE_SEGMENTS[card.type]}`;

/** The plate a theme is drawn on: its own background. */
const plateColor = (card: CommunityItemCard) =>
  typeof card.preview.bgColor === "string" && card.preview.bgColor
    ? card.preview.bgColor
    : "#ffffff";

/**
 * One item in a grid or row: the design on a calm surface, then its name,
 * saves and creator. The design is drawn in the browser as the card nears
 * the screen; `eager` draws it in the server's HTML too (first-screen cards
 * only: a framed design is tens of kilobytes of SVG).
 */
export function ItemCard({
  card,
  className,
  eager = false,
  rank,
  rankAs = "numeral",
}: {
  card: CommunityItemCard;
  className?: string;
  eager?: boolean;
  /** Its place in a ranking */
  rank?: number;
  /**
   * How the place shows: large and half behind the design's box (rows,
   * which leave room for it), or a small badge on the box (grids)
   */
  rankAs?: "numeral" | "badge";
}) {
  const t = useTranslations("community.itemCard");
  const stack = card.type === "collection" ? (card.stack ?? []) : [];
  const type = TYPE_LABELS[card.type].one;
  // Page previews have links of their own, so the card's link is stretched
  // over the card instead of wrapping it (nested <a> is invalid HTML and
  // breaks hydration), as on the /templates gallery.
  return (
    <article
      className={cn(
        CARD_FRAME,
        rank !== undefined && rankAs === "numeral" && numeral.card,
        className,
      )}
    >
      <Link
        aria-label={`${card.name}, ${type}`}
        className="absolute inset-0 z-10 rounded-xl outline-none"
        href={cardHref(card)}
      />
      <div className="relative">
        {rank !== undefined && rankAs === "numeral" && (
          <RankNumeral rank={rank} />
        )}
        <div className={CARD_ART}>
          {card.type === "collection" ? (
            <div className="absolute inset-5 grid place-items-center">
              {stack.length === 0 ? (
                <span className="text-muted-foreground text-xs">
                  {t("empty")}
                </span>
              ) : (
                stack.map((style, index) => (
                  <div
                    className="absolute grid aspect-square h-[80%] place-items-center rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5"
                    key={index}
                    style={{
                      transform: `translateX(${(index - (stack.length - 1) / 2) * 24}%) rotate(${(index - (stack.length - 1) / 2) * 5}deg)`,
                      zIndex: index,
                    }}
                  >
                    {/* Only the front design of an eager card is in the
                      HTML; the ones behind it draw in the browser. */}
                    <LazyDesignQr
                      className="size-full"
                      eager={eager && index === stack.length - 1}
                      style={style}
                    />
                  </div>
                ))
              )}
            </div>
          ) : card.type === "kit" ? (
            // The look and the page, side by side.
            <div className="absolute inset-0 flex items-start justify-center gap-3 px-5 pt-5">
              <div className="mt-6 aspect-square w-[36%] rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5">
                <LazyDesignQr
                  className="size-full"
                  eager={eager}
                  style={card.preview}
                />
              </div>
              <div className="aspect-[9/16] w-[34%] overflow-hidden rounded-t-xl bg-white shadow-sm ring-1 ring-black/5">
                {card.page ? (
                  <TemplatePreview
                    className="size-full"
                    content={card.page.content}
                  />
                ) : null}
              </div>
            </div>
          ) : card.type === "page-template" ? (
            // The top of the page on a phone-sized screen, cropped by the box.
            <div className="absolute top-5 left-1/2 aspect-[9/16] w-[42%] -translate-x-1/2 overflow-hidden rounded-t-xl bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
              {card.page ? (
                <TemplatePreview
                  className="size-full"
                  content={card.page.content}
                />
              ) : null}
            </div>
          ) : card.type === "frame" ? (
            // A frame is a card of its own: drawn as it is, no plate.
            <div className="absolute inset-y-[8%] inset-x-0 transition-transform duration-300 motion-safe:group-hover:scale-[1.03]">
              <LazyDesignQr
                className="size-full drop-shadow-sm"
                eager={eager}
                style={card.preview}
              />
            </div>
          ) : (
            <div
              className="absolute top-1/2 left-1/2 aspect-square h-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg p-1.5 shadow-sm ring-1 ring-black/5 transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
              style={{ backgroundColor: plateColor(card) }}
            >
              <LazyDesignQr
                className="size-full"
                eager={eager}
                style={card.preview}
              />
            </div>
          )}
          {rank !== undefined && rankAs === "badge" && (
            <span
              aria-hidden
              className="bg-background/90 text-foreground absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-md border px-1.5 text-xs font-semibold tabular-nums shadow-xs"
            >
              {rank}
            </span>
          )}
        </div>
      </div>
      <div className={CARD_TEXT}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{card.name}</span>
          {card.saveCount > 0 && (
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
              <Archive aria-hidden className="size-3.5" />
              <span className="sr-only">{t("saves")}</span>
              {COUNT.format(card.saveCount)}
            </span>
          )}
        </div>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <CreatorLine
            className="min-w-0"
            creator={card.creator}
            handle={false}
            link={false}
          />
          <span aria-hidden className="shrink-0">
            ·
          </span>
          <span className="shrink-0">
            {card.type === "collection" && card.itemCount !== undefined
              ? t("itemCount", { count: card.itemCount })
              : type}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * A rank's numeral: a faint, solid figure whose outline draws in when its
 * card is hovered or focused (./rank-numeral.module.css). The figure in the
 * HTML is invisible and only gives the numeral its size; both visible
 * layers are SVG text anchored to its right edge, so they line up.
 */
function RankNumeral({ rank }: { rank: number }) {
  // The baseline of a line-height-1 figure, about the same in every face.
  const baseline = "0.86em";
  return (
    <span aria-hidden className={cn(RANK_NUMERAL, numeral.numeral)}>
      <span className="invisible">{rank}</span>
      <svg aria-hidden className={numeral.art} focusable="false">
        <text
          className={cn(
            numeral.fill,
            "fill-foreground/[0.08] dark:fill-foreground/[0.1]",
          )}
          textAnchor="end"
          x="100%"
          y={baseline}
        >
          {rank}
        </text>
        <text
          className={cn(
            numeral.trace,
            "stroke-foreground/45 dark:stroke-foreground/55",
          )}
          textAnchor="end"
          x="100%"
          y={baseline}
        >
          {rank}
        </text>
      </svg>
    </span>
  );
}

/** A card's key in a list: unique across types. */
export const cardKey = (card: CommunityItemCard) =>
  `${card.type}-${card.slug || card.id}`;

/** A row of cards that scrolls sideways. */
export function ItemRowCards({
  cards,
  label,
  eager = 0,
}: {
  cards: CommunityItemCard[];
  /** Names the row for screen readers */
  label: string;
  /** How many cards, from the first, draw their design on the server */
  eager?: number;
}) {
  return (
    <CardRail label={label}>
      {cards.map((card, index) => (
        <li className={RAIL_CARD} key={cardKey(card)}>
          <ItemCard card={card} eager={index < eager} />
        </li>
      ))}
    </CardRail>
  );
}

/** A ranked row: each card with its place, 1 first. */
export function RankedRowCards({
  cards,
  label,
  eager = 0,
}: {
  cards: CommunityItemCard[];
  label: string;
  eager?: number;
}) {
  return (
    <CardRail label={label}>
      {cards.map((card, index) => (
        <li
          className={cn(
            RAIL_RANKED,
            index + 1 >= 10 ? RANK_ROOM_WIDE : RANK_ROOM,
          )}
          key={cardKey(card)}
        >
          <ItemCard card={card} eager={index < eager} rank={index + 1} />
        </li>
      ))}
    </CardRail>
  );
}

/** A titled row of cards (an item page's remixes, more from its creator). */
export function ItemRow({
  title,
  href,
  cards,
}: {
  title: string;
  href?: string;
  cards: CommunityItemCard[];
}) {
  if (cards.length === 0) return null;
  return (
    <RowSection href={href} title={title}>
      <ItemRowCards cards={cards} label={title} />
    </RowSection>
  );
}

/** Every card of a list, in a responsive grid. */
export function ItemGrid({
  cards,
  className = "grid gap-x-4 gap-y-7 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  eager = 0,
}: {
  cards: CommunityItemCard[];
  /** The grid's columns (a gallery with a sidebar has less room) */
  className?: string;
  /** How many cards, from the first, draw their design on the server */
  eager?: number;
}) {
  return (
    <div className={className}>
      {cards.map((card, index) => (
        <ItemCard card={card} eager={index < eager} key={cardKey(card)} />
      ))}
    </div>
  );
}
