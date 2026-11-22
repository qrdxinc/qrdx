import "server-only";

import {
  OFFICIAL_FRAME_COLLECTIONS,
  OFFICIAL_FRAMES,
  type OfficialFrame,
} from "qrdx";
import type { FrameSpec } from "qrdx/types";
import {
  findOfficialFrame,
  officialFrameOfSpec,
} from "@/lib/community/catalog";
import type { StyleSources } from "./style";

// QRdx's official frames for the AI chat: a design names one by id
// (frame { style: "official", id }), and the spec is looked up here, so the
// catalogue never reaches the browser bundle through ./style.ts. Every
// official frame is checked to decode at phone distances and to score Great
// (tests/official-frames/), which is why the chat offers these and not
// member frames.

/** How many official frames there are (counts come from code). */
export const OFFICIAL_FRAME_COUNT = OFFICIAL_FRAMES.length;

/** An official frame's spec by id (StyleSources.officialFrame). */
export const officialFrameSpec = (id: string): FrameSpec | undefined =>
  findOfficialFrame(id)?.spec;

export const isOfficialFrame = (id: string) => Boolean(findOfficialFrame(id));

/** The official frame a custom frame's spec is an unchanged copy of. */
export const officialFrameId = (spec: FrameSpec) =>
  officialFrameOfSpec(spec)?.id;

export const OFFICIAL_FRAME_SOURCES: Pick<StyleSources, "officialFrame"> = {
  officialFrame: officialFrameSpec,
};

const COLLECTION_LABELS = new Map<string, string>(
  OFFICIAL_FRAME_COLLECTIONS.map((collection) => [
    collection.id,
    collection.label,
  ]),
);

/** What the chat agent reads about a frame. */
export interface OfficialFrameMatch {
  id: string;
  name: string;
  description: string;
  collection: string;
  occasion?: string;
  /** The frame's own label texts, by slot (a design can replace them) */
  labels: { primary?: string; secondary?: string };
}

function labelsOf(frame: OfficialFrame): OfficialFrameMatch["labels"] {
  const labels: OfficialFrameMatch["labels"] = {};
  for (const label of frame.spec.labels ?? []) {
    if (label.type !== "text") continue;
    if (label.slot === "primary" && !labels.primary)
      labels.primary = label.text;
    if (label.slot === "secondary" && !labels.secondary) {
      labels.secondary = label.text;
    }
  }
  return labels;
}

const toMatch = (frame: OfficialFrame): OfficialFrameMatch => ({
  id: frame.id,
  name: frame.name,
  description: frame.description,
  collection: COLLECTION_LABELS.get(frame.collection) ?? frame.collection,
  ...(frame.occasion ? { occasion: frame.occasion } : {}),
  labels: labelsOf(frame),
});

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);

/** How well `frame` matches the query words (0: not at all). */
function relevance(frame: OfficialFrame, terms: string[]): number {
  const name = words(frame.name);
  const tags = frame.tags.flatMap(words);
  const extra = [
    ...words(frame.id),
    ...words(frame.collection),
    ...words(COLLECTION_LABELS.get(frame.collection) ?? ""),
    ...words(frame.occasion ?? ""),
  ];
  const description = words(frame.description);
  const has = (list: string[], term: string) =>
    list.some((word) => word === term || word.startsWith(term));
  return terms.reduce(
    (total, term) =>
      total +
      (has(name, term) ? 5 : 0) +
      (has(tags, term) ? 3 : 0) +
      (has(extra, term) ? 2 : 0) +
      (has(description, term) ? 1 : 0),
    0,
  );
}

export const OFFICIAL_FRAME_SEARCH_LIMIT = 8;

/**
 * Official frames for a description ("coffee", "diwali", "wifi card"),
 * best first; frames that suit `contentType` win ties. Without a match, the
 * call-to-action frames that suit it.
 */
export function searchOfficialFrames(
  query: string,
  {
    contentType,
    limit = OFFICIAL_FRAME_SEARCH_LIMIT,
  }: { contentType?: string; limit?: number } = {},
): OfficialFrameMatch[] {
  const terms = words(query).slice(0, 12);
  const suits = (frame: OfficialFrame) =>
    !contentType ||
    frame.contentTypes.length === 0 ||
    frame.contentTypes.includes(contentType);
  const scored = OFFICIAL_FRAMES.map((frame, order) => ({
    frame,
    order,
    score: relevance(frame, terms) + (suits(frame) ? 0.5 : 0),
  })).filter(({ score }) => score >= 1);
  const picked =
    scored.length > 0
      ? scored.sort((a, b) => b.score - a.score || a.order - b.order)
      : OFFICIAL_FRAMES.filter(
          (frame) => frame.collection === "call-to-action" && suits(frame),
        ).map((frame, order) => ({ frame, order, score: 0 }));
  return picked.slice(0, limit).map(({ frame }) => toMatch(frame));
}
