"use client";

import { loadCommunityChunks } from "@/app/(app)/(home)/community/actions";
import {
  createChunkLoader,
  Deferred,
  type DeferredLabels,
} from "@/components/infinite/deferred";
import { WallPlaceholder } from "@/components/showcase/wall-placeholder";
import type { WallShapeRow } from "@/lib/landing/showcase-wall";
import { RowCardsShape } from "./community-skeletons";

// Community content past the first screen, loaded as it nears the screen,
// all that does so at once in one request
// (app/(app)/(home)/community/actions.tsx): the overview's lower rows of
// cards, and the "Made with QRdx" wall's later rows. Until then each shows
// a placeholder of its exact size (a row's is ./community-skeletons.tsx,
// shared with the overview's loading placeholder).

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
      placeholder={<RowCardsShape count={count} kind={kind} />}
    />
  );
}
