// How community cards and their rows are laid out, shared by the cards
// (./item-card.tsx, a server component), the rows (./card-rail.tsx) and the
// placeholders that stand in for rows until they load
// (./deferred-community.tsx, in the browser). No imports, so the browser
// gets the classes and nothing else.

/**
 * A row that scrolls sideways: it runs to the frame's rails on both sides,
 * so the last card is cut at the edge, and snaps card by card on touch.
 * The gap leaves each card's caption clear of its neighbour's. A row that
 * scrolls sideways clips up and down too, so it keeps room above the cards
 * (pt-3, taken back by -mt-3 so the row stays where it was) for a focused
 * card's ring; without it a card's top edge was cut off.
 */
export const RAIL =
  "no-scrollbar -mx-4 -mt-3 flex snap-x snap-mandatory scroll-pl-4 gap-5 overflow-x-auto overscroll-x-contain px-4 pt-3 pb-2 sm:-mx-6 sm:scroll-pl-6 sm:px-6 md:gap-6 xl:gap-8";

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
 * The stage every preview stands on: light in both colour schemes, like a
 * lit product shot, so a design shows in its own colours whatever the
 * page's (stepped down a little on a dark page, so it doesn't glare), with
 * a hairline edge drawn over whatever fills it. Give it `relative`. What
 * stands on it, and how it moves, is ./stage.module.css.
 */
export const STAGE =
  "bg-zinc-100 dark:bg-zinc-200 after:pointer-events-none after:absolute after:inset-0 after:z-[2] after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]";

/**
 * The preview's box on a card (and on its placeholder), the same shape for
 * every type: the stage, opaque, so a rank's numeral can sit partly behind
 * it. The box itself stays put on hover: what stands on it moves.
 */
export const CARD_ART = `relative z-[1] aspect-[4/3] overflow-hidden rounded-xl group-has-[a:focus-visible]:ring-ring/50 group-has-[a:focus-visible]:ring-[3px] ${STAGE}`;

/**
 * A quiet label on the stage's top-left corner: the item's type ("Frame",
 * "Collection · 6"), and a grid's rank beside it. The stage is light in
 * both colour schemes, so one style serves both.
 */
export const STAGE_LABEL =
  "rounded-full bg-white/90 px-2 py-0.5 text-[11px] leading-4 font-medium text-zinc-900 ring-1 ring-black/[0.06] backdrop-blur-sm";

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
 * The caption under it: the name with its saves on the right, then (on
 * touch screens) the creator.
 */
export const CARD_TEXT = "flex min-w-0 flex-col gap-1.5 px-0.5";

/**
 * The caption's second line (the creator). Where a pointer can hover, the
 * caption is one line, so the room each card keeps for it is small and
 * rows of cards sit close; there the creator is left to screen readers.
 * Touch screens show both lines. A placeholder's second line uses it too,
 * so it stays as tall as the card it stands in for.
 */
export const CARD_TEXT_TOUCH_ONLY =
  "[@media(hover:hover)_and_(pointer:fine)]:sr-only";

/**
 * Where a pointer can hover (a mouse or trackpad), the caption waits out of
 * sight until its card is hovered or holds keyboard focus (its link, or
 * its like and bookmark buttons), then rises into place; it keeps its room,
 * so nothing below moves. Touch screens, which
 * can't hover, always show it. Screen readers read it either way.
 */
export const CARD_TEXT_REVEAL =
  "transition-[opacity,translate] duration-200 ease-out [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:motion-safe:translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100";

/** One line of the caption: one end on the left, the other on the right. */
export const CARD_LINE = "flex min-w-0 items-center justify-between gap-3";

/**
 * The space between cards in a grid. Where a pointer can hover, a card's
 * one-line caption is hidden until hover but keeps its room, which already
 * parts the rows, so they sit as close as the columns.
 */
export const GRID_GAPS =
  "gap-x-6 gap-y-10 [@media(hover:hover)_and_(pointer:fine)]:gap-y-6";

/** A card grid with room for four columns (a profile, a collection). */
export const CARD_GRID = `grid ${GRID_GAPS} sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`;
