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

describe("ranked row numerals", () => {
  it("number the cards from 1, each figure drawn twice in SVG", () => {
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
      // The faint fill and the outline: the same figure, anchored the same.
      const texts = [...markup.matchAll(/<text[^>]*>(\d+)<\/text>/g)];
      expect(texts.map((t) => t[1])).toEqual([rank, rank]);
      expect(markup.match(/text-anchor="end" x="100%"/g)).toHaveLength(2);
    }
  });

  it("are left out of grids, which show a badge instead", () => {
    const html = renderIntl(
      <ItemCard card={card(1)} rank={1} rankAs="badge" />,
    );
    expect(numerals(html)).toEqual([]);
    expect(html).not.toContain("<text");
  });

  it("only draw the outline in when motion is welcome", () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        "../../components/community/rank-numeral.module.css",
      ),
      "utf8",
    );
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain("stroke-dashoffset: 0;");
    expect(reduced).not.toMatch(/transition:[^;]*stroke-dashoffset/);
  });
});
