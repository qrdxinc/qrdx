import { HairlineFigure } from "@repo/design-system/components/hairline/hairline";
import type { Metadata } from "next";
import Link from "next/link";
import { BrowseLayout } from "@/components/community/browse-layout";
import {
  GALLERY_GRID,
  SidebarLink,
  SidebarSection,
} from "@/components/community/browse-sidebar";
import { CommunityContent } from "@/components/community/community-content";
import { GALLERY_FRAME } from "@/components/community/community-skeletons";
import { cardKey, ItemCard } from "@/components/community/item-card";
import { readsDatabaseWhileRendering } from "@/lib/build-without-database";
import type { RankPeriod } from "@/lib/community/home-sections";
import { createMetadata } from "@/lib/metadata";
import {
  type AllFrom,
  type AllQuery,
  type AllSort,
  allCards,
  allHref,
  isRanking,
  parseAllQuery,
} from "./browse";

export const metadata: Metadata = createMetadata({
  title: "Everything | Community",
  description:
    "Every QR code frame, theme, collection and page template in the QRdx community, ranked by saves or newest first. Free under CC0.",
  path: "/community/all",
});

const SORTS: { value: AllSort; label: string }[] = [
  { value: "saved", label: "Most saved" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
];

const PERIODS: { value: RankPeriod; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

const FROM: { value: AllFrom; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "community", label: "Members" },
  { value: "official", label: "QRdx" },
  { value: "picks", label: "Staff picks" },
];

const PERIOD_WORDS: Record<RankPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  all: "of all time",
};

/** What the list shows, in a few words ("Most saved this week"). */
function headingOf(query: AllQuery): string {
  if (query.q) return `Results for “${query.q}”`;
  const who =
    query.from === "picks"
      ? "Staff picks"
      : query.from === "official"
        ? "From QRdx"
        : query.from === "community"
          ? "From members"
          : null;
  const what =
    query.sort === "newest"
      ? "Newest"
      : query.sort === "trending"
        ? query.period === "all"
          ? "Trending, all time"
          : `Trending ${PERIOD_WORDS[query.period]}`
        : `Most saved ${PERIOD_WORDS[query.period]}`;
  return who ? `${who}: ${what.toLowerCase()}` : what;
}

/** Cards whose designs are in the HTML: the first row. */
const EAGER_CARDS = 3;

export default async function CommunityAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await readsDatabaseWhileRendering();
  const query = parseAllQuery(await searchParams);
  const cards = await allCards(query);
  const ranked = isRanking(query);
  const link = (next: Partial<AllQuery>) => allHref(query, next);

  const sidebar = (
    <>
      {query.q ? (
        <SidebarLink active={false} href={link({ q: null })} strong>
          Clear the search
        </SidebarLink>
      ) : (
        SORTS.map((option) => (
          <SidebarLink
            active={option.value === query.sort}
            href={link({ sort: option.value })}
            key={option.value}
            strong
          >
            {option.label}
          </SidebarLink>
        ))
      )}
      {ranked && (
        <SidebarSection title="Period">
          {PERIODS.map((option) => (
            <SidebarLink
              active={option.value === query.period}
              href={link({ period: option.value })}
              key={option.value}
            >
              {option.label}
            </SidebarLink>
          ))}
        </SidebarSection>
      )}
      <SidebarSection title="From">
        {FROM.filter((option) => !(query.q && option.value === "picks")).map(
          (option) => (
            <SidebarLink
              active={option.value === query.from}
              href={link({ from: option.value })}
              key={option.value}
            >
              {option.label}
            </SidebarLink>
          ),
        )}
      </SidebarSection>
    </>
  );

  // The header (with the search), tabs and licence line are the shared
  // community frame (../layout.tsx); the placeholder while this loads is
  // ./loading.tsx.
  return (
    <CommunityContent className={GALLERY_FRAME}>
      <BrowseLayout
        activeFilters={
          (query.q ? 1 : 0) +
          (query.sort !== "saved" ? 1 : 0) +
          (ranked && query.period !== "all" ? 1 : 0) +
          (query.from !== "all" ? 1 : 0)
        }
        sheetTitle="Everything"
        sidebar={sidebar}
        toolbar={
          <h2 className="text-lg font-semibold tracking-tight">
            {headingOf(query)}
          </h2>
        }
      >
        {cards.length > 0 ? (
          <ol className={GALLERY_GRID}>
            {cards.map((card, index) => (
              <li key={cardKey(card)}>
                <ItemCard
                  card={card}
                  eager={index < EAGER_CARDS}
                  rank={ranked ? index + 1 : undefined}
                  rankAs="badge"
                />
              </li>
            ))}
          </ol>
        ) : (
          <Empty query={query} />
        )}
      </BrowseLayout>
    </CommunityContent>
  );
}

function Empty({ query }: { query: AllQuery }) {
  const [title, body, action] = query.q
    ? [
        "Nothing matches that",
        "Try fewer or shorter words, or browse everything.",
        { href: allHref(query, { q: null }), label: "Clear the search" },
      ]
    : query.sort === "newest"
      ? [
          "Nothing here yet",
          "Nothing has been published here yet.",
          { href: allHref(query, { from: "all" }), label: "Show everyone's" },
        ]
      : [
          query.period === "all"
            ? "Nothing saved yet"
            : `Nothing saved ${PERIOD_WORDS[query.period]} yet`,
          "Items people save in this time show up here.",
          {
            href: allHref(query, { period: "all", from: "all" }),
            label: "Show all time",
          },
        ];
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <HairlineFigure className="aspect-square w-36" figure="Palette" />
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">
        {body}
      </p>
      <Link className="text-sm underline underline-offset-2" href={action.href}>
        {action.label}
      </Link>
    </div>
  );
}
