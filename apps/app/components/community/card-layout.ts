// How community cards and their rows are laid out, shared by the cards
// (./item-card.tsx, a server component), the rows (./card-rail.tsx) and the
// placeholders that stand in for rows until they load
// (./deferred-community.tsx, in the browser). No imports, so the browser
// gets the classes and nothing else.

/**
 * A row that scrolls sideways: it runs to the frame's rails on both sides,
 * so the last card is cut at the edge, and snaps card by card on touch.
 * The gap leaves each card's caption clear of its neighbour's.
 */
export const RAIL =
  "no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-5 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-6 sm:scroll-pl-6 sm:px-6 md:gap-6 xl:gap-8";

/** A card's box in a row: about four and a half across a wide screen. */
export const RAIL_CARD =
  "w-[68%] shrink-0 snap-start sm:w-[42%] md:w-[31%] lg:w-[23.5%] xl:w-[21.5%]";

/** A ranked item's box (its numeral and card): a little wider. */
export const RAIL_RANKED =
  "w-[80%] shrink-0 snap-start sm:w-[50%] md:w-[37%] lg:w-[29%] xl:w-[27%]";

/** A maker's box in their row. */
export const RAIL_MAKER =
  "w-[46%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[17.5%] xl:w-[15.5%]";

/** A maker's card (and its placeholder): the same height in every row. */
export const MAKER_CARD =
  "bg-card flex h-48 flex-col items-center justify-center gap-3 rounded-xl border px-4 text-center";

/** A card: the design's box, then its name and creator under it. */
export const CARD_FRAME = "group relative flex min-w-0 flex-col gap-3";

/**
 * The design's box: a calm surface with a hairline edge, the same shape for
 * every type. Opaque, so a rank's numeral can sit partly behind it.
 */
export const CARD_ART =
  "bg-muted relative z-[1] aspect-[4/3] overflow-hidden rounded-xl border border-foreground/[0.07] transition-[border-color] duration-200 group-hover:border-foreground/20 group-has-[a:focus-visible]:ring-ring/50 group-has-[a:focus-visible]:ring-[3px]";

/**
 * Where a rank's numeral sits and how large it is: a little above the
 * middle of the design's box, with only its right edge tucked behind the
 * box. Ranked items leave room for it on their left. Its face, colours and
 * motion: ./rank-numeral.module.css and RankNumeral in ./item-card.tsx.
 */
export const RANK_NUMERAL =
  "pointer-events-none absolute top-[46%] right-[calc(100%-0.12em)] -translate-y-1/2 text-[5.5rem] leading-none font-black tracking-tighter select-none md:text-[7rem] xl:text-[8rem]";

/** The room a one-digit numeral needs on its item's left. */
export const RANK_ROOM = "pl-12 md:pl-16 xl:pl-[4.5rem]";

/** The room "10" needs. */
export const RANK_ROOM_WIDE = "pl-24 md:pl-[7.75rem] xl:pl-[8.75rem]";

/**
 * The caption under it, two lines of two ends: the name and its saves, then
 * the creator and what kind of item it is.
 */
export const CARD_TEXT = "flex min-w-0 flex-col gap-1.5 px-0.5";

/** One line of the caption: one end on the left, the other on the right. */
export const CARD_LINE = "flex min-w-0 items-center justify-between gap-3";

/** A card grid with room for four columns (a profile, a collection). */
export const CARD_GRID =
  "grid gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
