"use client";

import { cn } from "@repo/design-system/lib/utils";
import { loadCommunityChunks } from "@/app/(app)/(home)/community/actions";
import {
  createChunkLoader,
  Deferred,
  type DeferredLabels,
} from "@/components/infinite/deferred";
import { WallPlaceholder } from "@/components/showcase/wall-placeholder";
import type { WallShapeRow } from "@/lib/landing/showcase-wall";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  MAKER_CARD,
  RAIL,
  RAIL_CARD,
  RAIL_MAKER,
  RAIL_RANKED,
  RANK_ROOM,
  RANK_ROOM_WIDE,
} from "./card-layout";

// Community content past the first screen, loaded as it nears the screen,
// all that does so at once in one request
// (app/(app)/(home)/community/actions.tsx): the overview's lower rows of
// cards, and the "Made with QRdx" wall's later rows. Until then each shows
// a placeholder of its exact size.

const loader = createChunkLoader(loadCommunityChunks);

/** A chunk of the wall's rows. */
export function DeferredWallRows({
  chunkKey,
  shape,
  labels,
}: {
  /** "<band>:<index>" (lib/landing/showcase-wall.ts, wallChunkKey) */
  chunkKey: string;
  shape: WallShapeRow[];
  labels: DeferredLabels;
}) {
  return (
    <Deferred
      chunkKey={`wall:${chunkKey}`}
      labels={labels}
      loader={loader}
      placeholder={<WallPlaceholder shape={shape} />}
    />
  );
}

/**
 * A card before it loads: its design's box and its two lines, laid out as
 * the card's (components/community/item-card.tsx), so it has the card's
 * height to the pixel.
 */
function CardPlaceholder({ rank }: { rank?: number }) {
  return (
    <li
      className={
        rank === undefined
          ? RAIL_CARD
          : cn(RAIL_RANKED, rank >= 10 ? RANK_ROOM_WIDE : RANK_ROOM)
      }
    >
      <div className={CARD_FRAME}>
        <div className={CARD_ART} />
        <div className={CARD_TEXT}>
          <div className="h-5" />
          <div className="h-5" />
        </div>
      </div>
    </li>
  );
}

/** One of the overview's rows (lib/community/home.ts). */
export function DeferredRow({
  row,
  count,
  kind,
  labels,
}: {
  row: string;
  /** How many cards the row has, for the placeholder */
  count: number;
  kind: "cards" | "ranked" | "makers";
  labels: DeferredLabels;
}) {
  return (
    <Deferred
      chunkKey={`row:${row}`}
      labels={labels}
      loader={loader}
      placeholder={
        <ol aria-hidden className={RAIL}>
          {Array.from({ length: count }, (_, index) =>
            kind === "makers" ? (
              <li className={RAIL_MAKER} key={index}>
                <div className={MAKER_CARD} />
              </li>
            ) : (
              <CardPlaceholder
                key={index}
                rank={kind === "ranked" ? index + 1 : undefined}
              />
            ),
          )}
        </ol>
      }
    />
  );
}
