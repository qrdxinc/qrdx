// A server component (no "use client"): page template cards render their
// page preview here, so the page itself never goes to the browser.

import { cn } from "@repo/design-system/lib/utils";
import { Archive } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import {
  type CommunityItemCard,
  type CommunityStackEntry,
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
  CARD_TEXT_TOUCH_ONLY,
  RAIL_CARD,
  RAIL_RANKED,
  RANK_NUMERAL,
  RANK_ROOM,
  RANK_ROOM_WIDE,
  STAGE_LABEL,
} from "./card-layout";
import { CardRail } from "./card-rail";
import { CreatorLine } from "./creator-line";
import { LazyDesignQr } from "./design-qr";
import numeral from "./rank-numeral.module.css";
import { RowSection } from "./row-section";
import stage from "./stage.module.css";
import { LightPhone } from "./stage-mockups";
import { ThemeSwatch } from "./theme-swatch";

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });

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
 * One item in a grid or row: its preview on a light stage, labelled with
 * its type, then its name and saves, and its creator. The preview is drawn
 * in the browser as the card nears the screen; `eager` draws it in the
 * server's HTML too (first-screen cards only: a framed design is tens of
 * kilobytes of SVG). Hovering the card, or focusing its link, plays the
 * preview's motion (./stage.module.css).
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
   * How the place shows: large and half behind the stage (rows, which
   * leave room for it), or a small label on the stage beside its type
   * (grids)
   */
  rankAs?: "numeral" | "badge";
}) {
  const t = useTranslations("community.itemCard");
  const type = TYPE_LABELS[card.type].one;
  // Page previews have links of their own, so the card's link is stretched
  // over the card instead of wrapping it (nested <a> is invalid HTML and
  // breaks hydration), as on the /templates gallery.
  return (
    <article
      className={cn(
        CARD_FRAME,
        stage.card,
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
        <div className={CARD_ART} data-stage="">
          <CardPicture card={card} eager={eager} />
          <div
            aria-hidden
            className="absolute top-2.5 left-2.5 z-[3] flex items-center gap-1"
          >
            {rank !== undefined && rankAs === "badge" && (
              <span className={cn(STAGE_LABEL, "font-semibold tabular-nums")}>
                {rank}
              </span>
            )}
            <span className={STAGE_LABEL} data-type-label="">
              {card.type === "collection" && card.itemCount !== undefined
                ? t("typeCollectionCount", { count: card.itemCount })
                : t(TYPE_KEYS[card.type])}
            </span>
          </div>
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
        <div
          className={cn(
            CARD_LINE,
            CARD_TEXT_TOUCH_ONLY,
            "text-muted-foreground text-xs",
          )}
        >
          <CreatorLine
            className="min-w-0"
            creator={card.creator}
            handle={false}
            link={false}
          />
        </div>
      </div>
    </article>
  );
}

/** The words of each type's label on the stage (community.itemCard). */
const TYPE_KEYS = {
  frame: "typeFrame",
  theme: "typeTheme",
  "page-template": "typePage",
  kit: "typeKit",
  collection: "typeCollection",
} as const;

/** What a card shows on its stage, by its type. */
function CardPicture({
  card,
  eager,
}: {
  card: CommunityItemCard;
  eager: boolean;
}) {
  switch (card.type) {
    case "frame":
      // A printed piece standing on the stage, around a sample code; it
      // lifts off the stage when the card is hovered.
      return (
        <div
          className={cn("absolute inset-x-[8%] inset-y-[6%]", stage.frame)}
          data-frame-piece=""
        >
          <LazyDesignQr
            className="size-full"
            eager={eager}
            style={card.preview}
          />
        </div>
      );
    case "theme":
      // A look: a close-up of its code, filling the stage, with its colors.
      return <ThemeSwatch eager={eager} style={card.preview} />;
    case "page-template":
      // The top of the page on a phone, rising from the stage's edge.
      return card.page ? (
        <LightPhone
          className="absolute top-[12%] left-1/4 w-1/2"
          content={card.page.content}
        />
      ) : null;
    case "kit":
      return <KitPicture card={card} eager={eager} />;
    case "collection":
      return <CollectionPicture eager={eager} stack={card.stack ?? []} />;
    default:
      return null;
  }
}

/**
 * A kit: its look (a swatch, or the frame it brings) in front of its page,
 * overlapping a little, like a product shot. Hovered, they part.
 */
function KitPicture({
  card,
  eager,
}: {
  card: CommunityItemCard;
  eager: boolean;
}) {
  return (
    <>
      {card.page && (
        <div
          className={cn("absolute top-[9%] left-[47%] w-[40%]", stage.kitPage)}
        >
          <LightPhone className="w-full" content={card.page.content} still />
        </div>
      )}
      <div
        className={cn(
          "absolute top-[27%] left-[10%] aspect-square w-[42%]",
          stage.kitLook,
        )}
      >
        {frameOnlyKit(card) ? (
          <LazyDesignQr
            className={cn("absolute inset-0", stage.object)}
            eager={eager}
            style={card.preview}
          />
        ) : (
          <div className={cn("absolute inset-0 rounded-xl", stage.object)}>
            <ThemeSwatch
              className="rounded-xl"
              compact
              eager={eager}
              style={card.preview}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** One of a collection's items, as its own card draws it, fitting its box. */
function StackPiece({
  entry,
  eager,
}: {
  entry: CommunityStackEntry;
  eager: boolean;
}) {
  if (entry.type === "frame") {
    return (
      <LazyDesignQr
        className={cn("absolute inset-0", stage.object)}
        eager={eager}
        style={entry.preview}
      />
    );
  }
  if (entry.type === "page-template") {
    return entry.page ? (
      <div className="absolute inset-0 grid place-items-center">
        <LightPhone className="h-full" content={entry.page.content} still />
      </div>
    ) : null;
  }
  return (
    <div className="absolute inset-0 grid place-items-center [container-type:size]">
      <div
        className={cn(
          "relative aspect-square w-[min(100cqw,100cqh)] overflow-hidden rounded-lg",
          stage.object,
        )}
      >
        <ThemeSwatch compact eager={eager} style={entry.preview} />
      </div>
    </div>
  );
}

/** A piece of a fan: where it stands, at rest and spread (hovered). */
interface FanPlace {
  left: string;
  rest: string;
  spread: string;
}

/** The side pieces of a fan: a little smaller and lower, turned out. */
const side = (left: string, turn: 1 | -1, shift: number): FanPlace => ({
  left,
  rest: `translateY(5%) rotate(${turn * 3}deg) scale(0.9)`,
  spread: `translate(${turn * shift}px, 5%) rotate(${turn * 4}deg) scale(0.9)`,
});

/** Where each piece of a fan stands, by how many there are. */
const FAN: Record<number, FanPlace[]> = {
  1: [{ left: "31%", rest: "none", spread: "translateY(-3px)" }],
  2: [side("17%", -1, 6), side("45%", 1, 6)],
  3: [
    side("5%", -1, 7),
    { left: "31%", rest: "none", spread: "translateY(-3px)" },
    side("57%", 1, 7),
  ],
};

/**
 * A collection: its first items (up to three), each drawn as its own card
 * draws it (a frame around a code, a theme's swatch, a page on a phone),
 * standing in a tidy fan, the first in front. Hovered, the fan spreads.
 */
function CollectionPicture({
  stack,
  eager,
}: {
  stack: CommunityStackEntry[];
  eager: boolean;
}): ReactNode {
  const t = useTranslations("community.itemCard");
  if (stack.length === 0) {
    return (
      <span className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
        {t("empty")}
      </span>
    );
  }
  const pieces = stack.slice(0, 3);
  const places = FAN[pieces.length] ?? FAN[3];
  const middle = Math.floor((pieces.length - 1) / 2);
  // The first item stands in the middle, in front; the next ones beside it
  const order =
    pieces.length === 3 ? [pieces[1], pieces[0], pieces[2]] : pieces;
  return (
    <>
      {order.map((entry, index) => {
        const place = places[index];
        if (!(entry && place)) return null;
        return (
          <div
            className={cn(
              "absolute top-[15%] bottom-[7%] w-[38%] origin-bottom",
              stage.piece,
            )}
            data-stack-piece={entry.type}
            // A collection may hold the same design twice
            key={index}
            style={
              {
                left: place.left,
                zIndex: index === middle ? 2 : 1,
                "--piece": index,
                "--piece-rest": place.rest,
                "--piece-spread": place.spread,
              } as CSSProperties
            }
          >
            <StackPiece entry={entry} eager={eager && index === middle} />
          </div>
        );
      })}
    </>
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
