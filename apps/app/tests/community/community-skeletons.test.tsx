// What a community view shows while it loads (components/community/
// community-skeletons.tsx): the view's own frame, with placeholders built
// from the classes the real cards, rows and galleries use
// (card-layout.ts, browse-geometry.ts), so nothing moves when the view
// arrives. Hidden from screen readers but for one "Loading" status.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BROWSE_ASIDE,
  BROWSE_MAIN,
  BROWSE_ROOT,
  BROWSE_TOOLBAR,
} from "@/components/community/browse-geometry";
import { GALLERY_GRID } from "@/components/community/browse-sidebar";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  RAIL,
  RAIL_CARD,
  RAIL_RANKED,
} from "@/components/community/card-layout";
import {
  GALLERY_FRAME,
  GallerySkeleton,
  OVERVIEW_ROWS,
  OverviewSkeleton,
  RowCardsShape,
  ViewSkeleton,
} from "@/components/community/community-skeletons";
import en from "@/messages/en.json";

const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
  );

/** How many elements carry exactly this class string. */
const count = (markup: string, classes: string) =>
  markup.split(`class="${classes}"`).length - 1;

describe("a gallery's placeholder", () => {
  it("has the gallery's frame: sidebar, toolbar, grid", () => {
    const markup = html(<GallerySkeleton view="frames" />);
    expect(markup.startsWith(`<div class="${GALLERY_FRAME}">`)).toBe(true);
    for (const classes of [
      BROWSE_ROOT,
      BROWSE_ASIDE,
      BROWSE_MAIN,
      BROWSE_TOOLBAR,
      GALLERY_GRID,
    ]) {
      expect(markup).toContain(`class="${classes}"`);
    }
  });

  it("holds cards shaped like the gallery's own, from their classes", () => {
    const markup = html(<GallerySkeleton view="frames" />);
    expect(count(markup, CARD_FRAME)).toBe(6);
    expect(count(markup, CARD_ART)).toBe(6);
    expect(count(markup, CARD_TEXT)).toBe(6);
  });

  it("holds the themes gallery's own loading cards on Themes", () => {
    const markup = html(<GallerySkeleton view="themes" />);
    expect(count(markup, CARD_ART)).toBe(0);
    expect(markup.split("h-44").length - 1).toBe(6);
  });

  it("is hidden from screen readers but for one status", () => {
    for (const view of ["frames", "themes", "all"] as const) {
      const markup = html(<GallerySkeleton view={view} />);
      expect(markup.match(/role="status"/g)).toHaveLength(1);
      expect(markup).toContain(`>${en.community.more.loading}</span>`);
      expect(markup.match(/aria-hidden="true"/g)?.length).toBeGreaterThan(1);
    }
  });
});

describe("the overview's placeholder", () => {
  it("is the overview's rows, ranked rows first, on the rows' rails", () => {
    const markup = html(<OverviewSkeleton />);
    expect(markup.startsWith(`<div class="${OVERVIEW_ROWS}">`)).toBe(true);
    expect(count(markup, RAIL)).toBe(3);
    expect(markup.split(RAIL_RANKED).length - 1).toBe(12);
    expect(count(markup, RAIL_CARD)).toBe(6);
  });

  it("is what ViewSkeleton draws for the overview, and a gallery's for the rest", () => {
    expect(html(<ViewSkeleton view="home" />)).toBe(html(<OverviewSkeleton />));
    expect(html(<ViewSkeleton view="kits" />)).toBe(
      html(<GallerySkeleton view="kits" />),
    );
  });

  it("shares its row placeholder with the rows that load later", () => {
    const markup = html(<RowCardsShape count={4} kind="cards" />);
    expect(markup.startsWith(`<ol aria-hidden="true" class="${RAIL}">`)).toBe(
      true,
    );
    expect(count(markup, RAIL_CARD)).toBe(4);
  });
});
