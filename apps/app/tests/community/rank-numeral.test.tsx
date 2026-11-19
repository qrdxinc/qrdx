// A ranked row's numerals: hidden from screen readers, sized by an invisible
// figure, drawn as two SVG layers (a faint fill and an outline that draws in
// on hover or focus), and still when the reader asks for reduced motion.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

// next/font only works inside Next's compiler (page template previews).
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
// The card rail is a client component with a ResizeObserver; the numerals
// don't need it.
vi.mock("@/components/community/card-rail", () => ({
  CardRail: ({ children }: { children: React.ReactNode }) => (
    <ol>{children}</ol>
  ),
}));

import { ItemCard, RankedRowCards } from "@/components/community/item-card";
import type { CommunityItemCard } from "@/lib/community/types";

const card = (n: number): CommunityItemCard => ({
  id: `it_${n}`,
  type: "theme",
  slug: `theme-${n}`,
  name: `Theme ${n}`,
  description: null,
  creator: {
    profileId: "pr_1",
    handle: "ana",
    displayName: "Ana Ruiz",
    avatarUrl: null,
    official: false,
    verified: false,
  },
  isOfficial: false,
  version: 1,
  likeCount: 0,
  saveCount: 0,
  useCount: 0,
  tags: [],
  publishedAt: null,
  preview: {},
});

/** Each numeral's markup: the aria-hidden span that holds the SVG. */
const numerals = (html: string) =>
  [
    ...html.matchAll(
      /<span aria-hidden="true" class="[^"]*"><span class="invisible">(\d+)<\/span><svg[\s\S]*?<\/svg><\/span>/g,
    ),
  ].map((match) => ({ rank: match[1], markup: match[0] }));

/** The ids a numeral defines, and the ids its url(#…) references point at. */
const ids = (markup: string) => ({
  defined: [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]),
  used: [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
});

describe("ranked row numerals", () => {
  it("number the cards from 1, every layer the same figure in SVG", () => {
    const html = renderIntl(
      RankedRowCards({
        cards: Array.from({ length: 10 }, (_, i) => card(i + 1)),
        label: "Top today",
      }),
    );
    const found = numerals(html);
    expect(found.map((n) => n.rank)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1)),
    );
    for (const { rank, markup } of found) {
      // The clip, the faint fill, the inner edge, the highlight and the rim:
      // the same figure, anchored the same, so the layers line up.
      const texts = [...markup.matchAll(/<text[^>]*>(\d+)<\/text>/g)];
      expect(texts.map((t) => t[1])).toEqual([rank, rank, rank, rank, rank]);
      expect(markup.match(/text-anchor="end" x="100%"/g)).toHaveLength(5);
      // The liquid inside is clipped to the figure.
      expect(markup).toMatch(
        /<g class="[^"]*" clip-path="url\(#[^)]+-shape\)">/,
      );
    }
  });

  it("give each numeral its own clip, gradients and filters", () => {
    const html = renderIntl(
      RankedRowCards({
        cards: Array.from({ length: 3 }, (_, i) => card(i + 1)),
        label: "Top today",
      }),
    );
    const all: string[] = [];
    for (const { markup } of numerals(html)) {
      const { defined, used } = ids(markup);
      expect(defined).toHaveLength(5);
      // Every reference points at something this numeral defines.
      expect(used.every((id) => defined.includes(id))).toBe(true);
      all.push(...defined);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it("are left out of grids, which show a badge instead", () => {
    const html = renderIntl(
      <ItemCard card={card(1)} rank={1} rankAs="badge" />,
    );
    expect(numerals(html)).toEqual([]);
    expect(html).not.toContain("<text");
  });

  it("drift the currents only while hovered, and never with reduced motion", () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        "../../components/community/rank-numeral.module.css",
      ),
      "utf8",
    );
    expect(css).toMatch(/\.current \{[^}]*animation: [^;]*paused;/);
    expect(css).toMatch(
      /\.card:hover \.current,[^{]*\{\s*animation-play-state: running;/,
    );
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toMatch(/\.current \{\s*animation: none;/);
  });
});
