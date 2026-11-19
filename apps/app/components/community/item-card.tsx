// A server component (no "use client"): page template cards render their
// page preview here, so the page itself never goes to the browser.

import { cn } from "@repo/design-system/lib/utils";
import {
  Archive,
  Box,
  Brush2,
  Folder2,
  type Icon,
  Mobile,
  Scan,
} from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TemplatePreview } from "@/components/landing/template-preview";
import {
  type CommunityItemCard,
  type CommunityItemType,
  itemPath,
  TYPE_LABELS,
  TYPE_SEGMENTS,
} from "@/lib/community/types";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_GRID,
  CARD_LINE,
  CARD_TEXT,
  CARD_TEXT_REVEAL,
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
import { ThemeSwatch } from "./theme-swatch";
import { LazyFrameSlot } from "./type-previews";

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });

/** The mark beside an item's type on its card. */
export const TYPE_ICONS: Record<CommunityItemType, Icon> = {
  frame: Scan,
  theme: Brush2,
  "page-template": Mobile,
  collection: Folder2,
  kit: Box,
};

/** Where a card goes: its item page, or the type's gallery (legacy themes). */
export const cardHref = (card: CommunityItemCard) =>
  card.slug
    ? itemPath(card.type, card.slug)
    : `/community/${TYPE_SEGMENTS[card.type]}`;

/**
 * Whether a kit's look is a frame alone: it has a frame and no theme, so
 * its picture is the frame's (a swatch would show the plain code frames
 * are drawn on).
 */
const frameOnlyKit = (card: CommunityItemCard) =>
  Boolean(card.kit?.frame && !card.kit.theme && card.preview.frame);

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
  const TypeIcon = TYPE_ICONS[card.type];
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
          <RankNumeral id={rankId(card, rank)} rank={rank} />
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
            // The look (a swatch, or the frame it brings) and the page, side
            // by side: "look + page".
            <div className="absolute inset-0 flex items-start justify-center gap-3 px-5 pt-5">
              {frameOnlyKit(card) ? (
                <LazyFrameSlot
                  className="mt-6 aspect-square w-[36%] drop-shadow-sm"
                  eager={eager}
                  label={t("yourQrCode")}
                  style={card.preview}
                />
              ) : (
                <ThemeSwatch
                  className="mt-6 aspect-square w-[36%]"
                  compact
                  eager={eager}
                  style={card.preview}
                />
              )}
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
            // A frame is a card of its own, drawn as it is with a holder
            // where your code goes: a frame, not a code.
            <div className="absolute inset-y-[8%] inset-x-0 transition-transform duration-300 motion-safe:group-hover:scale-[1.03]">
              <LazyFrameSlot
                className="size-full drop-shadow-sm"
                eager={eager}
                label={t("yourQrCode")}
                style={card.preview}
              />
            </div>
          ) : (
            // A theme is a look: a close-up of its code with its colors.
            // One that carries a frame shows it on its page.
            <ThemeSwatch
              className="absolute inset-[8%] transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
              eager={eager}
              style={card.preview}
            />
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
      <div className={cn(CARD_TEXT, CARD_TEXT_REVEAL)}>
        <div className={CARD_LINE}>
          <span className="truncate text-sm font-medium">{card.name}</span>
          {card.saveCount > 0 && (
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
              <Archive aria-hidden className="size-4" />
              <span className="sr-only">{t("saves")}</span>
              {COUNT.format(card.saveCount)}
            </span>
          )}
        </div>
        <div className={cn(CARD_LINE, "text-muted-foreground text-xs")}>
          <CreatorLine
            className="min-w-0"
            creator={card.creator}
            handle={false}
            link={false}
          />
          <span className="flex shrink-0 items-center gap-1">
            <TypeIcon aria-hidden className="size-4" />
            {card.type === "collection" && card.itemCount !== undefined
              ? t("itemCount", { count: card.itemCount })
              : type}
          </span>
        </div>
      </div>
    </article>
  );
}

/** The id a ranked card's numeral gives its SVG filter and clip. */
const rankId = (card: CommunityItemCard, rank: number) =>
  `rank-${rank}-${cardKey(card).replace(/[^\w-]/g, "")}`;

/**
 * A rank's numeral: a faint, solid figure that, when its card is hovered or
 * focused, turns into liquid accent (./rank-numeral.module.css): a bright
 * rim, then a deep accent inside where lighter and darker currents drift,
 * under a fixed highlight. The figure in the HTML is invisible and only
 * gives the numeral its size; every visible layer is SVG over the same
 * figure, anchored to its right edge, so they line up.
 *
 * The currents are soft-edged ellipses clipped to the figure; the highlight
 * is an SVG lighting filter (the figure's blurred edge read as a height map
 * and lit from the top left), keeping only the light it catches.
 */
function RankNumeral({ rank, id }: { rank: number; id: string }) {
  // The baseline of a line-height-1 figure, about the same in every face.
  const figure = {
    textAnchor: "end",
    x: "100%",
    y: "0.86em",
  } as const;
  return (
    <span aria-hidden className={cn(RANK_NUMERAL, numeral.numeral)}>
      <span className="invisible">{rank}</span>
      <svg aria-hidden className={numeral.art} focusable="false">
        <defs>
          <clipPath id={`${id}-shape`}>
            <text {...figure}>{rank}</text>
          </clipPath>
          <radialGradient id={`${id}-light`}>
            <stop className={numeral.lightStop} offset="0" stopOpacity="0.95" />
            <stop className={numeral.lightStop} offset="1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-deep`}>
            <stop className={numeral.deepStop} offset="0" stopOpacity="0.7" />
            <stop className={numeral.deepStop} offset="1" stopOpacity="0" />
          </radialGradient>
          <filter
            colorInterpolationFilters="sRGB"
            height="140%"
            id={`${id}-shine`}
            width="140%"
            x="-20%"
            y="-20%"
          >
            <feGaussianBlur in="SourceAlpha" result="height" stdDeviation="3" />
            <feSpecularLighting
              in="height"
              lightingColor="#fff"
              result="specular"
              specularConstant="0.35"
              specularExponent="28"
              surfaceScale="3"
            >
              <feDistantLight azimuth="225" elevation="42" />
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id={`${id}-soft`}>
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>
        <text
          className={cn(
            numeral.fill,
            "fill-foreground/[0.08] dark:fill-foreground/[0.1]",
          )}
          {...figure}
        >
          {rank}
        </text>
        <g className={numeral.gloss}>
          <g className={numeral.body} clipPath={`url(#${id}-shape)`}>
            <rect className={numeral.base} height="100%" width="100%" />
            <g>
              <ellipse
                className={numeral.current}
                cx="34%"
                cy="30%"
                fill={`url(#${id}-light)`}
                rx="58%"
                ry="13%"
              />
              <ellipse
                className={numeral.current}
                cx="68%"
                cy="56%"
                fill={`url(#${id}-deep)`}
                rx="42%"
                ry="18%"
              />
              <ellipse
                className={numeral.current}
                cx="52%"
                cy="76%"
                fill={`url(#${id}-light)`}
                rx="38%"
                ry="8%"
              />
            </g>
            <text
              className={numeral.edge}
              filter={`url(#${id}-soft)`}
              {...figure}
            >
              {rank}
            </text>
          </g>
          <text
            className={numeral.shine}
            filter={`url(#${id}-shine)`}
            {...figure}
          >
            {rank}
          </text>
          <text className={numeral.rim} {...figure}>
            {rank}
          </text>
        </g>
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
  className = CARD_GRID,
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
