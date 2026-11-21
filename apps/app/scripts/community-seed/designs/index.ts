// The official designs QRdx publishes as @qrdx community themes, beyond the
// built-in presets (../preset-themes.ts): full looks made for the gallery,
// in groups by mood and use. packages/database/scripts/seed-community.mjs
// reads them from community-seed-designs.json, which ../generate.ts writes
// from this module; tests/database/seed-designs.test.ts fails while that
// file is stale, and holds every design to the gallery's bar: no two
// alike, no scan-risk flag, enough contrast, decodes with every decoder
// the repo tests with, and Great with the publish gate. A design is tagged
// "accessible" only at 7:1 contrast or more (the enhanced level) between
// every code color and its ground, and never takes the name of an
// official frame it doesn't sit on.
//
// To add designs, append to a group (or add a group file and list it
// below), then run `bun x tsx scripts/community-seed/generate.ts` in
// apps/app. Items already seeded never change (published versions are
// immutable), so an edit only reaches a design that isn't seeded yet.

import { MAX_TAGS_PER_THEME } from "@repo/config";
import {
  type ThemePayload,
  themePayloadFromStyle,
} from "@/lib/community/payloads";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { BRAND_DESIGNS } from "./brand";
import { CATALOGUE_DESIGNS } from "./catalogue";
import { EARTHY_DESIGNS } from "./earthy";
import { ICON_DESIGNS } from "./icons";
import { LUXURY_DESIGNS } from "./luxury";
import { MONO_DESIGNS } from "./mono";
import { NEON_DESIGNS } from "./neon";
import { PASTEL_DESIGNS } from "./pastel";
import { PLAYFUL_DESIGNS } from "./playful";
import { RETRO_DESIGNS } from "./retro";
import { SEASONAL_DESIGNS } from "./seasonal";
import type { OfficialFrameRef, SeedDesign } from "./shared";
import { USE_DESIGNS } from "./uses";

export type { OfficialFrameRef, SeedDesign } from "./shared";

/** Every official design, in gallery order (newest groups last). */
export const OFFICIAL_DESIGNS: readonly SeedDesign[] = [
  ...MONO_DESIGNS,
  ...BRAND_DESIGNS,
  ...PASTEL_DESIGNS,
  ...NEON_DESIGNS,
  ...EARTHY_DESIGNS,
  ...LUXURY_DESIGNS,
  ...RETRO_DESIGNS,
  ...PLAYFUL_DESIGNS,
  ...SEASONAL_DESIGNS,
  ...USE_DESIGNS,
  ...CATALOGUE_DESIGNS,
  ...ICON_DESIGNS,
];

/** A design as community-seed-designs.json stores it. */
export interface SeedDesignTheme {
  /** The design's id: the item is ci_official_theme_<id> */
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  /** What a publish stores, minus the official frame (put in by the seed) */
  payload: ThemePayload;
  /** The official frame the seed script puts into payload.style.frame */
  frame?: { official: string } & Omit<OfficialFrameRef, "id">;
}

const VOCABULARY: readonly string[] = COMMUNITY_THEME_TAGS;

/** Every design as the seed publishes it, from the design files alone. */
export function buildSeedDesigns(): SeedDesignTheme[] {
  const seen = new Set<string>();
  return OFFICIAL_DESIGNS.map((design) => {
    if (seen.has(design.id)) throw new Error(`${design.id}: listed twice`);
    seen.add(design.id);
    if (design.frame && design.style.frame) {
      throw new Error(`${design.id}: both an official and a built-in frame`);
    }
    const style = design.logoIcon
      ? { ...design.style, showLogo: true }
      : design.style;
    const built = themePayloadFromStyle(style);
    if (!built) throw new Error(`${design.id}: the community can't store it`);
    if (built.removed.length > 0) {
      throw new Error(
        `${design.id}: publishing drops its ${built.removed.join(", ")}`,
      );
    }
    const unknown = design.tags.filter((tag) => !VOCABULARY.includes(tag));
    if (unknown.length > 0) {
      throw new Error(`${design.id}: unknown tags ${unknown.join(", ")}`);
    }
    const payload: ThemePayload = {
      ...built.payload,
      ...(design.logoIcon ? { logoIcon: design.logoIcon } : {}),
    };
    const frame = design.frame
      ? (() => {
          const { id, ...rest } = design.frame;
          return { official: id, ...rest };
        })()
      : undefined;
    return {
      id: design.id,
      slug: design.id,
      name: design.name,
      description: design.description,
      tags: [...new Set(design.tags)].slice(0, MAX_TAGS_PER_THEME),
      payload,
      ...(frame ? { frame } : {}),
    };
  });
}
