// The /community overview's rows: each one's title, grey line, "View all"
// page and cards, shared by the page (which draws the first rows) and the
// server action that loads the rest as they near the screen
// (app/(app)/(home)/community/actions.tsx). A server module.

import { Verify } from "iconsax-reactjs";
import type { ReactNode } from "react";
import type { CommunityHome } from "@/lib/community/home";
import { type HomeSectionId, TOP_TITLES } from "@/lib/community/home-sections";
import { ItemRowCards, RankedRowCards } from "./item-card";
import { MakerRowCards } from "./maker-card";

export interface HomeRow {
  title: string;
  sub: string;
  href?: string;
  badge?: ReactNode;
  /** How many cards it has (for its placeholder) */
  count: number;
  /** How its placeholder is shaped */
  kind: "cards" | "ranked" | "makers";
  /** Its cards; the first `eager` draw their designs on the server */
  cards: (eager: number) => ReactNode;
}

/** The link to /community/all for a ranking or list. */
const allHref = (params: Record<string, string>) =>
  `/community/all?${new URLSearchParams(params).toString()}`;

export function homeRow(id: HomeSectionId, home: CommunityHome): HomeRow {
  switch (id) {
    case "top": {
      const period = home.top?.period ?? "day";
      const cards = home.top?.items.map((item) => item.card) ?? [];
      return {
        ...TOP_TITLES[period],
        href: allHref({ period }),
        count: cards.length,
        kind: "ranked",
        cards: (eager) => (
          <RankedRowCards
            cards={cards}
            eager={eager}
            label={TOP_TITLES[period].title}
          />
        ),
      };
    }
    case "trending": {
      const cards = home.trending.map((item) => item.card);
      return {
        title: "Trending this week",
        sub: "Bookmarked, used and remixed most in the last 7 days",
        href: allHref({ sort: "trending", period: "week" }),
        count: cards.length,
        kind: "ranked",
        cards: (eager) => (
          <RankedRowCards
            cards={cards}
            eager={eager}
            label="Trending this week"
          />
        ),
      };
    }
    case "picks":
      return cardsRow({
        title: "Staff picks",
        sub: "Chosen by the QRdx team",
        href: allHref({ sort: "newest", from: "picks" }),
        cards: home.picks,
      });
    case "fresh":
      return cardsRow({
        title: home.fresh.thisWeek ? "New this week" : "New from the community",
        sub: home.fresh.thisWeek
          ? "Published by members in the last 7 days"
          : "The latest frames, themes and pages members published",
        href: allHref({ sort: "newest", from: "community" }),
        cards: home.fresh.cards,
      });
    case "official":
      return cardsRow({
        title: "From QRdx",
        sub: "Frames made by the QRdx team for everyday uses",
        href: "/community/frames?from=official",
        badge: (
          <Verify aria-label="Verified" className="size-4" variant="Bold" />
        ),
        cards: home.official,
      });
    case "themes":
      return cardsRow({
        title: "Popular themes",
        sub: "Colors and shapes people like most",
        href: "/community/themes",
        cards: home.themes,
      });
    case "templates":
      return cardsRow({
        title: "Page templates",
        sub: "Hosted pages shared as a place to start",
        href: "/community/templates",
        cards: home.templates,
      });
    case "collections":
      return cardsRow({
        title: "Collections",
        sub: "Frames, themes and pages grouped by what they're for",
        href: "/community/collections",
        cards: home.collections,
      });
    case "makers":
      return {
        title: "Top makers",
        sub: "Members whose work gets bookmarked most",
        count: home.makers.length,
        kind: "makers",
        cards: () => <MakerRowCards label="Top makers" makers={home.makers} />,
      };
  }
}

function cardsRow({
  title,
  sub,
  href,
  badge,
  cards,
}: Pick<HomeRow, "title" | "sub" | "href" | "badge"> & {
  cards: CommunityHome["picks"];
}): HomeRow {
  return {
    title,
    sub,
    href,
    badge,
    count: cards.length,
    kind: "cards",
    cards: (eager) => (
      <ItemRowCards cards={cards} eager={eager} label={title} />
    ),
  };
}
