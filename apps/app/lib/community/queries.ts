import "server-only";

import {
  communityCollectionEntry,
  communityItem,
  communityItemTag,
  communityLike,
  communityProfile,
  communitySave,
  communityTheme,
  communityUse,
  database as db,
  qrPreset,
  user as userTable,
} from "@repo/database";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { OFFICIAL_FRAME_COUNT } from "qrdx";
import { customFrameSchema, type QRCustomFrame } from "qrdx/types";
import { decodeKeyset, encodeKeyset } from "@/lib/keyset-cursor";
import {
  type KeysetDirection,
  keysetAfter,
  keysetOrder,
} from "@/lib/keyset-sql";
import type {
  CommunityTheme,
  CommunityThemesResponse,
} from "@/types/community";
import type { ThemeStyles } from "@/types/theme";
import {
  findOfficialFrame,
  officialFrameCard,
  officialFrameCards,
  officialFrameDetail,
} from "./catalog";
import { OFFICIAL_HANDLE } from "./handles";
import { readPageTemplate } from "./page-template";
import { framePreviewStyle } from "./payloads";
import { publicStyleFromSaved, toPublicStyle } from "./public-style-server";
import { SEARCH_DOCUMENT } from "./search";
import type { SitemapItem } from "./sitemap";
import { guardedRead } from "./store";
import {
  COMMUNITY_TYPES,
  type CommunityCreator,
  type CommunityItemCard,
  type CommunityItemDetail,
  type CommunityItemType,
  type CommunityMaker,
  type CommunityProfileView,
  type RankedCard,
} from "./types";
import { authorNotBanned } from "./visibility";

// Reads for the community pages. Every query joins the creator's profile
// and account and keeps only published items by active, unbanned creators.
// A missing community table reads as "nothing yet", and the
// official frames come from the engine's catalogue until they are seeded.

const ROW = {
  id: communityItem.id,
  type: communityItem.type,
  slug: communityItem.slug,
  name: communityItem.name,
  description: communityItem.description,
  isOfficial: communityItem.isOfficial,
  version: communityItem.currentVersion,
  likeCount: communityItem.likeCount,
  saveCount: communityItem.saveCount,
  useCount: communityItem.useCount,
  publishedAt: communityItem.publishedAt,
  payload: communityItem.payload,
  scanScore: communityItem.scanScore,
  facets: communityItem.facets,
  remixedFromLabel: communityItem.remixedFromLabel,
  remixedFromItemId: communityItem.remixedFromItemId,
  remixCount: communityItem.remixCount,
  sourceId: communityItem.sourceId,
  createdBy: communityItem.createdBy,
  profileId: communityProfile.id,
  profileKind: communityProfile.kind,
  handle: communityProfile.handle,
  displayName: communityProfile.displayName,
  avatarUrl: communityProfile.avatarUrl,
  verifiedAt: communityProfile.verifiedAt,
  bio: communityProfile.bio,
  userId: communityProfile.userId,
};

interface ItemRow {
  id: string;
  type: string;
  slug: string;
  name: string;
  description: string | null;
  isOfficial: boolean;
  version: number;
  likeCount: number;
  saveCount: number;
  useCount: number;
  publishedAt: Date;
  payload: Record<string, unknown>;
  scanScore: number | null;
  facets: Record<string, unknown> | null;
  remixedFromLabel: string | null;
  remixedFromItemId: string | null;
  remixCount: number;
  sourceId: string | null;
  createdBy: string | null;
  profileId: string;
  profileKind: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  verifiedAt: Date | null;
  bio: string | null;
  userId: string | null;
}

/** Published items by active, unbanned creators. */
function visible(now = new Date()): SQL {
  return and(
    eq(communityItem.status, "published"),
    eq(communityProfile.status, "active"),
    authorNotBanned(now),
  ) as SQL;
}

function itemsQuery() {
  return db
    .select(ROW)
    .from(communityItem)
    .innerJoin(
      communityProfile,
      eq(communityProfile.id, communityItem.profileId),
    )
    .leftJoin(userTable, eq(userTable.id, communityProfile.userId));
}

function creatorOf(
  row: Pick<
    ItemRow,
    | "profileId"
    | "profileKind"
    | "handle"
    | "displayName"
    | "avatarUrl"
    | "verifiedAt"
  >,
): CommunityCreator {
  const official = row.profileKind === "official";
  return {
    profileId: row.profileId,
    handle: row.handle,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    official,
    verified: official || row.verifiedAt != null,
  };
}

function frameOf(payload: Record<string, unknown>): QRCustomFrame | null {
  const parsed = customFrameSchema.safeParse(payload.frame);
  return parsed.success ? parsed.data : null;
}

/** A kit's parts (item ids), or empty when its payload isn't one. */
function kitPartsOf(
  payload: Record<string, unknown>,
): NonNullable<CommunityItemCard["kit"]> {
  const kit = (payload.kit ?? {}) as Record<string, unknown>;
  const id = (value: unknown) =>
    typeof value === "string" && value.length <= 64 ? value : undefined;
  return { page: id(kit.page), theme: id(kit.theme), frame: id(kit.frame) };
}

/** The design a theme or frame item renders, as everyone sees it. */
export function applyStyleOf(row: {
  type: string;
  payload: Record<string, unknown>;
}): ThemeStyles | null {
  if (row.type === "theme") {
    return toPublicStyle(
      (row.payload.style ?? {}) as ThemeStyles,
      row.payload.logoIcon,
    );
  }
  if (row.type === "frame") {
    const frame = frameOf(row.payload);
    return frame ? { frame } : null;
  }
  return null;
}

function previewOf(row: ItemRow): ThemeStyles {
  if (row.type === "frame") {
    const frame = frameOf(row.payload);
    return frame ? framePreviewStyle(frame) : {};
  }
  return applyStyleOf(row) ?? {};
}

function toCard(row: ItemRow, tags: string[] = []): CommunityItemCard {
  const page =
    row.type === "page-template" ? readPageTemplate(row.payload)?.page : null;
  return {
    id: row.id,
    type: row.type as CommunityItemType,
    slug: row.slug,
    name: row.name,
    description: row.description,
    creator: creatorOf(row),
    isOfficial: row.isOfficial,
    version: row.version,
    likeCount: Number(row.likeCount),
    saveCount: Number(row.saveCount),
    useCount: Number(row.useCount),
    tags,
    publishedAt: row.publishedAt
      ? new Date(row.publishedAt).toISOString()
      : null,
    preview: previewOf(row),
    ...(page ? { page } : {}),
  };
}

async function tagsFor(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ itemId: communityItemTag.itemId, tag: communityItemTag.tag })
    .from(communityItemTag)
    .where(inArray(communityItemTag.itemId, ids));
  for (const row of rows) {
    map.set(row.itemId, [...(map.get(row.itemId) ?? []), row.tag].sort());
  }
  return map;
}

/** Collections: their visible items' cards, in order. */
async function entriesFor(
  collectionIds: string[],
): Promise<Map<string, CommunityItemCard[]>> {
  const map = new Map<string, CommunityItemCard[]>();
  if (collectionIds.length === 0) return map;
  const entries = await db
    .select({
      collectionId: communityCollectionEntry.collectionId,
      itemId: communityCollectionEntry.itemId,
      position: communityCollectionEntry.position,
    })
    .from(communityCollectionEntry)
    .where(inArray(communityCollectionEntry.collectionId, collectionIds))
    .orderBy(asc(communityCollectionEntry.position));
  const itemIds = [...new Set(entries.map((entry) => entry.itemId))];
  if (itemIds.length === 0) return map;
  const rows = (await itemsQuery().where(
    and(visible(), inArray(communityItem.id, itemIds)),
  )) as ItemRow[];
  const cards = new Map(rows.map((row) => [row.id, toCard(row)]));
  for (const entry of entries) {
    const card = cards.get(entry.itemId);
    if (!card) continue;
    map.set(entry.collectionId, [...(map.get(entry.collectionId) ?? []), card]);
  }
  return map;
}

/**
 * Whether a card may be listed: a kit needs its page template and a
 * collection at least 2 visible items, once removed items stop showing.
 */
const listable = (card: CommunityItemCard) =>
  card.type === "kit"
    ? Boolean(card.page)
    : card.type === "collection"
      ? (card.itemCount ?? 0) >= 2
      : true;

async function toCards(rows: ItemRow[]): Promise<CommunityItemCard[]> {
  return (await buildCards(rows)).filter(listable);
}

/** How many of a collection's items its card shows. */
export const STACK_SIZE = 3;

async function buildCards(rows: ItemRow[]): Promise<CommunityItemCard[]> {
  const ids = rows.map((row) => row.id);
  const collectionIds = rows
    .filter((row) => row.type === "collection" || row.type === "kit")
    .map((row) => row.id);
  const [tags, entries] = await Promise.all([
    tagsFor(ids),
    entriesFor(collectionIds),
  ]);
  return rows.map((row) => {
    const card = toCard(row, tags.get(row.id));
    if (row.type !== "collection" && row.type !== "kit") return card;
    const items = entries.get(row.id) ?? [];
    if (row.type === "kit") {
      const parts = kitPartsOf(row.payload);
      const theme = items.find((item) => item.type === "theme");
      const frame = items.find((item) => item.type === "frame");
      const page = items.find((item) => item.type === "page-template");
      // The look: the theme with the frame on it (or either alone).
      const look: ThemeStyles = {
        ...(theme?.preview ?? frame?.preview ?? {}),
        ...(theme && frame?.preview.frame
          ? { frame: frame.preview.frame }
          : {}),
      };
      return {
        ...card,
        kit: parts,
        itemCount: items.length,
        preview: look,
        ...(page?.page ? { page: page.page } : { unavailable: true }),
      };
    }
    return {
      ...card,
      itemCount: items.length,
      stack: items.slice(0, STACK_SIZE).map((item) => ({
        type: item.type,
        preview: item.preview,
        ...(item.page ? { page: item.page } : {}),
      })),
      preview: items[0]?.preview ?? {},
    };
  });
}

export type ListSort = "popular" | "newest" | "oldest";

export interface ListOptions {
  /** One type, or every type when left out */
  type?: CommunityItemType;
  sort?: ListSort;
  official?: boolean;
  featured?: boolean;
  profileId?: string;
  /** Items this account published */
  createdBy?: string;
  /** Items this account saved */
  savedBy?: string;
  /** Items published since this moment */
  since?: Date;
  limit?: number;
  offset?: number;
}

function orderOf(options: Pick<ListOptions, "featured" | "sort">) {
  if (options.featured) return [desc(communityItem.featuredAt)];
  if (options.sort === "newest") {
    return [desc(communityItem.publishedAt), asc(communityItem.id)];
  }
  if (options.sort === "oldest") {
    return [asc(communityItem.publishedAt), asc(communityItem.id)];
  }
  return [
    desc(communityItem.likeCount),
    desc(communityItem.useCount),
    desc(communityItem.publishedAt),
    asc(communityItem.id),
  ];
}

/** Published items of a type, or of every type (database only). */
export async function listItems(
  options: ListOptions,
): Promise<CommunityItemCard[]> {
  return guardedRead(async () => {
    const conditions: SQL[] = [visible()];
    if (options.type) conditions.push(eq(communityItem.type, options.type));
    if (options.since) {
      conditions.push(gte(communityItem.publishedAt, options.since));
    }
    if (options.official === true) {
      conditions.push(eq(communityItem.isOfficial, true));
    }
    if (options.official === false) {
      conditions.push(eq(communityItem.isOfficial, false));
    }
    if (options.featured) conditions.push(isNotNull(communityItem.featuredAt));
    if (options.profileId) {
      conditions.push(eq(communityItem.profileId, options.profileId));
    }
    if (options.createdBy) {
      conditions.push(eq(communityItem.createdBy, options.createdBy));
    }
    if (options.savedBy) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(communitySave)
            .where(
              and(
                eq(communitySave.itemId, communityItem.id),
                eq(communitySave.userId, options.savedBy),
              ),
            ),
        ),
      );
    }
    const rows = (await itemsQuery()
      .where(and(...conditions))
      .orderBy(...orderOf(options))
      .limit(options.limit ?? 48)
      .offset(options.offset ?? 0)) as ItemRow[];
    return toCards(rows);
  }, []);
}

/**
 * Frames: the database's, plus the official catalogue frames the seed
 * hasn't put there yet (same slugs), so @qrdx's frames always show.
 */
export async function listFrames(
  options: Omit<ListOptions, "type"> = {},
): Promise<CommunityItemCard[]> {
  if (
    options.official === false ||
    options.featured ||
    options.profileId ||
    options.createdBy ||
    options.savedBy
  ) {
    return listItems({ ...options, type: "frame", limit: 200 });
  }
  // Official and member frames apart: the official library is long enough
  // to crowd members' frames out of one list.
  const [official, others] = await Promise.all([
    seededOfficialFrames(options.sort),
    options.official
      ? Promise.resolve([])
      : listItems({ ...options, type: "frame", official: false, limit: 200 }),
  ]);
  const seeded = new Set(official.map((card) => card.slug));
  const missing = officialFrameCards().filter((card) => !seeded.has(card.slug));
  return [...official, ...missing, ...others];
}

// ─── Sitemap (app/(app)/(home)/community/sitemap.ts) ───────────────────────

/**
 * Every item the galleries list: visible items, less the collections and
 * kits the lists leave out (listable). The official frames the seed hasn't
 * stored yet are added by ./sitemap.ts.
 */
export async function sitemapItems(): Promise<SitemapItem[]> {
  return guardedRead(async () => {
    const rows = await db
      .select({
        id: communityItem.id,
        type: communityItem.type,
        slug: communityItem.slug,
        handle: communityProfile.handle,
        publishedAt: communityItem.publishedAt,
        updatedAt: communityItem.updatedAt,
      })
      .from(communityItem)
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(visible());
    const grouped = (type: string) => type === "collection" || type === "kit";
    const groupIds = rows.filter((row) => grouped(row.type)).map((r) => r.id);
    const listed = new Set(
      groupIds.length > 0
        ? (
            await toCards(
              (await itemsQuery().where(
                and(visible(), inArray(communityItem.id, groupIds)),
              )) as ItemRow[],
            )
          ).map((card) => card.id)
        : [],
    );
    return rows.flatMap((row) => {
      const type = row.type as CommunityItemType;
      if (!COMMUNITY_TYPES.includes(type)) return [];
      if (grouped(type) && !listed.has(row.id)) return [];
      const changed = Math.max(
        row.updatedAt.getTime(),
        row.publishedAt.getTime(),
      );
      return [
        {
          type,
          slug: row.slug,
          handle: row.handle,
          lastModified: new Date(changed).toISOString(),
        },
      ];
    });
  }, []);
}

// ─── Rankings (the overview's rows and /community/top) ─────────────────────

// Collections and kits that turn out unlistable (./queries.ts, listable)
// are dropped after the query, so rankings read a few rows more than asked.
const rankLimit = (limit: number) => limit + Math.ceil(limit / 4);

/** Narrows a ranking: QRdx's items or members', staff picks only. */
export interface RankFilter {
  official?: boolean;
  featured?: boolean;
}

function rankFilter(filter: RankFilter = {}): SQL {
  return and(
    visible(),
    ...(filter.official === undefined
      ? []
      : [eq(communityItem.isOfficial, filter.official)]),
    ...(filter.featured ? [isNotNull(communityItem.featuredAt)] : []),
  ) as SQL;
}

/** Items ordered by a count per item (`counts`), most first. */
async function rankedBy(
  counts: ReturnType<typeof rankedSubquery>,
  limit: number,
  filter: RankFilter = {},
): Promise<RankedCard[]> {
  const rows = (await db
    .select({ ...ROW, count: counts.n })
    .from(communityItem)
    .innerJoin(counts, eq(counts.itemId, communityItem.id))
    .innerJoin(
      communityProfile,
      eq(communityProfile.id, communityItem.profileId),
    )
    .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
    .where(rankFilter(filter))
    .orderBy(
      desc(counts.n),
      desc(communityItem.saveCount),
      desc(communityItem.likeCount),
      desc(communityItem.publishedAt),
      asc(communityItem.id),
    )
    .limit(rankLimit(limit))) as (ItemRow & { count: number })[];
  return withCounts(rows, limit);
}

/** Cards for ranked rows, each with its row's count. */
async function withCounts(
  rows: (ItemRow & { count: number })[],
  limit: number,
): Promise<RankedCard[]> {
  const counted = new Map(rows.map((row) => [row.id, Number(row.count)]));
  const cards = await toCards(rows);
  return cards
    .slice(0, limit)
    .map((card) => ({ card, count: counted.get(card.id ?? "") ?? 0 }));
}

/** Per item id, how many rows `from` has (an aggregate to join). */
function rankedSubquery(
  name: string,
  from: ReturnType<typeof savesSince> | ReturnType<typeof activitySince>,
) {
  const all = from.as(`${name}_rows`);
  return db
    .select({ itemId: all.itemId, n: count().as("n") })
    .from(all)
    .groupBy(all.itemId)
    .as(name);
}

const savesSince = (since: Date) =>
  db
    .select({ itemId: communitySave.itemId })
    .from(communitySave)
    .where(gte(communitySave.createdAt, since));

/** Saves, uses (copies, counted once a day) and published remixes. */
const activitySince = (since: Date) =>
  unionAll(
    savesSince(since),
    db
      .select({ itemId: communityUse.itemId })
      .from(communityUse)
      .where(
        and(
          eq(communityUse.kind, "copy"),
          gte(communityUse.day, Math.floor(since.getTime() / 86_400_000)),
        ),
      ),
    db
      .select({ itemId: sql<string>`${communityItem.remixedFromItemId}` })
      .from(communityItem)
      .where(
        and(
          isNotNull(communityItem.remixedFromItemId),
          eq(communityItem.status, "published"),
          gte(communityItem.publishedAt, since),
        ),
      ),
  );

/** Items ordered by a column or sum of columns, most first. */
async function rankedByColumns(
  total: SQL<number>,
  limit: number,
  filter: RankFilter = {},
): Promise<RankedCard[]> {
  const rows = (await db
    .select({ ...ROW, count: total })
    .from(communityItem)
    .innerJoin(
      communityProfile,
      eq(communityProfile.id, communityItem.profileId),
    )
    .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
    .where(and(rankFilter(filter), gt(total, 0)))
    .orderBy(
      desc(total),
      desc(communityItem.likeCount),
      desc(communityItem.publishedAt),
      asc(communityItem.id),
    )
    .limit(rankLimit(limit))) as (ItemRow & { count: number })[];
  return withCounts(rows, limit);
}

/**
 * The items saved most since `since`, with how many saves each got then;
 * with no `since`, of all time (each item's save count).
 */
export async function mostSavedItems({
  since,
  limit,
  filter,
}: {
  since: Date | null;
  limit: number;
  filter?: RankFilter;
}): Promise<RankedCard[]> {
  return guardedRead(
    () =>
      since
        ? rankedBy(
            rankedSubquery("window_saves", savesSince(since)),
            limit,
            filter,
          )
        : rankedByColumns(
            sql<number>`${communityItem.saveCount}`,
            limit,
            filter,
          ),
    [],
  );
}

/**
 * The items with the most activity since `since` (all time without one):
 * saves, uses and published remixes together, with that total.
 */
export async function trendingItems({
  since,
  limit,
  filter,
}: {
  since: Date | null;
  limit: number;
  filter?: RankFilter;
}): Promise<RankedCard[]> {
  return guardedRead(
    () =>
      since
        ? rankedBy(
            rankedSubquery("window_activity", activitySince(since)),
            limit,
            filter,
          )
        : rankedByColumns(
            sql<number>`${communityItem.saveCount} + ${communityItem.useCount} + ${communityItem.remixCount}`,
            limit,
            filter,
          ),
    [],
  );
}

/**
 * Members with a public handle, ranked by the saves on their published
 * items (the official profile has a row of its own).
 */
export async function topMakers(limit: number): Promise<CommunityMaker[]> {
  return guardedRead(async () => {
    const saves = sql<number>`coalesce(sum(${communityItem.saveCount}), 0)`;
    const rows = await db
      .select({
        profileId: communityProfile.id,
        profileKind: communityProfile.kind,
        handle: communityProfile.handle,
        displayName: communityProfile.displayName,
        avatarUrl: communityProfile.avatarUrl,
        verifiedAt: communityProfile.verifiedAt,
        items: count(communityItem.id),
        saves,
      })
      .from(communityItem)
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(
        and(
          visible(),
          eq(communityProfile.kind, "person"),
          isNotNull(communityProfile.handle),
        ),
      )
      .groupBy(communityProfile.id)
      .having(gt(saves, 0))
      .orderBy(
        desc(saves),
        desc(count(communityItem.id)),
        asc(communityProfile.displayName),
      )
      .limit(limit);
    return rows.map((row) => ({
      creator: creatorOf(row),
      itemCount: Number(row.items),
      saveCount: Number(row.saves),
    }));
  }, []);
}

// An official frame's row without its payload: its spec, name, description
// and tags are the engine's (the seed copies them), so listing the library
// reads a few fields a frame instead of every spec, and parses none.
const OFFICIAL_ROW = {
  id: communityItem.id,
  slug: communityItem.slug,
  version: communityItem.currentVersion,
  likeCount: communityItem.likeCount,
  saveCount: communityItem.saveCount,
  useCount: communityItem.useCount,
  publishedAt: communityItem.publishedAt,
  profileId: communityProfile.id,
  profileKind: communityProfile.kind,
  handle: communityProfile.handle,
  displayName: communityProfile.displayName,
  avatarUrl: communityProfile.avatarUrl,
  verifiedAt: communityProfile.verifiedAt,
};

type OfficialRow = Pick<
  ItemRow,
  | "id"
  | "slug"
  | "version"
  | "likeCount"
  | "saveCount"
  | "useCount"
  | "publishedAt"
  | "profileId"
  | "profileKind"
  | "handle"
  | "displayName"
  | "avatarUrl"
  | "verifiedAt"
>;

/** The seeded official frames, as cards built from the engine's catalogue. */
async function seededOfficialFrames(
  sort: ListSort | undefined,
): Promise<CommunityItemCard[]> {
  return guardedRead(async () => {
    const rows = (await db
      .select(OFFICIAL_ROW)
      .from(communityItem)
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(
        and(
          visible(),
          eq(communityItem.type, "frame"),
          eq(communityItem.isOfficial, true),
        ),
      )
      .orderBy(...orderOf({ sort }))
      .limit(OFFICIAL_FRAME_COUNT + 100)) as OfficialRow[];
    const cards: CommunityItemCard[] = [];
    const unknown: string[] = [];
    for (const row of rows) {
      const frame = findOfficialFrame(row.slug);
      if (!frame) {
        unknown.push(row.id);
        continue;
      }
      cards.push({
        ...officialFrameCard(frame),
        id: row.id,
        creator: creatorOf(row),
        version: row.version,
        likeCount: Number(row.likeCount),
        saveCount: Number(row.saveCount),
        useCount: Number(row.useCount),
        publishedAt: row.publishedAt
          ? new Date(row.publishedAt).toISOString()
          : null,
      });
    }
    if (unknown.length === 0) return cards;
    // A row the engine has no frame for (none today): read it whole
    const rest = (await itemsQuery().where(
      and(visible(), inArray(communityItem.id, unknown)),
    )) as ItemRow[];
    return [...cards, ...(await toCards(rest))];
  }, []);
}

/** One item page; frames fall back to the official catalogue. */
export async function getItem(
  type: CommunityItemType,
  slug: string,
  viewerId: string | null,
): Promise<CommunityItemDetail | null> {
  const stored = await guardedRead(async () => {
    const [row] = (await itemsQuery()
      .where(
        and(
          visible(),
          eq(communityItem.type, type),
          eq(communityItem.slug, slug),
        ),
      )
      .limit(1)) as ItemRow[];
    if (!row) return null;
    const [card] = await buildCards([row]);
    if (!card) return null;
    // Hidden once fewer than 2 of its items are still in the community.
    if (card.type === "collection" && (card.itemCount ?? 0) < 2) return null;
    const [liked, saved] = viewerId
      ? await Promise.all([
          db
            .select({ itemId: communityLike.itemId })
            .from(communityLike)
            .where(
              and(
                eq(communityLike.userId, viewerId),
                eq(communityLike.itemId, row.id),
              ),
            )
            .limit(1),
          db
            .select({ itemId: communitySave.itemId })
            .from(communitySave)
            .where(
              and(
                eq(communitySave.userId, viewerId),
                eq(communitySave.itemId, row.id),
              ),
            )
            .limit(1),
        ])
      : [[], []];
    const entries =
      type === "collection" || type === "kit"
        ? ((await entriesFor([row.id])).get(row.id) ?? [])
        : undefined;
    const facets = (row.facets ?? {}) as { contentTypes?: unknown };
    const detail: CommunityItemDetail = {
      ...card,
      apply: applyStyleOf(row) ?? {},
      contentTypes: Array.isArray(facets.contentTypes)
        ? facets.contentTypes.filter((t): t is string => typeof t === "string")
        : [],
      scanScore: row.scanScore,
      remixedFromLabel: row.remixedFromLabel,
      remixedFrom: row.remixedFromItemId
        ? await remixOriginal(row.remixedFromItemId)
        : null,
      remixCount: Number(row.remixCount ?? 0),
      isLikedByMe: liked.length > 0,
      isSavedByMe: saved.length > 0,
      isMine: viewerId !== null && row.createdBy === viewerId,
      ...(entries ? { entries } : {}),
    };
    return detail;
  }, null);
  if (stored) return stored;
  if (type === "frame") {
    const official = findOfficialFrame(slug);
    if (official) return officialFrameDetail(official);
  }
  return null;
}

/** The original a remix came from, while it's still in the community. */
async function remixOriginal(
  itemId: string,
): Promise<{ type: CommunityItemType; slug: string } | null> {
  const [row] = (await itemsQuery()
    .where(and(visible(), eq(communityItem.id, itemId)))
    .limit(1)) as ItemRow[];
  return row ? { type: row.type as CommunityItemType, slug: row.slug } : null;
}

/** Published remixes of an item, newest first (its item page). */
export async function remixesOf(
  itemId: string,
  limit = 8,
): Promise<CommunityItemCard[]> {
  return guardedRead(async () => {
    const rows = (await itemsQuery()
      .where(and(visible(), eq(communityItem.remixedFromItemId, itemId)))
      .orderBy(desc(communityItem.publishedAt), asc(communityItem.id))
      .limit(limit)) as ItemRow[];
    return toCards(rows);
  }, []);
}

/** More from the same creator, for an item page. */
export async function moreFromCreator(
  item: CommunityItemDetail,
  limit = 4,
): Promise<CommunityItemCard[]> {
  if (item.creator.profileId) {
    const cards = await listItems({
      type: item.type,
      profileId: item.creator.profileId,
      limit: limit + 1,
    });
    return cards.filter((card) => card.slug !== item.slug).slice(0, limit);
  }
  return officialFrameCards()
    .filter((card) => card.slug !== item.slug)
    .slice(0, limit);
}

/** A public profile by handle; @qrdx works before the seed (frames only). */
export async function getProfileByHandle(
  handle: string,
): Promise<CommunityProfileView | null> {
  const found = await guardedRead(async () => {
    const [profile] = await db
      .select({
        id: communityProfile.id,
        kind: communityProfile.kind,
        handle: communityProfile.handle,
        displayName: communityProfile.displayName,
        avatarUrl: communityProfile.avatarUrl,
        verifiedAt: communityProfile.verifiedAt,
        bio: communityProfile.bio,
      })
      .from(communityProfile)
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(
        and(
          eq(communityProfile.handle, handle),
          eq(communityProfile.status, "active"),
          authorNotBanned(),
        ),
      )
      .limit(1);
    if (!profile) return null;
    const official = profile.kind === "official";
    const types: CommunityItemType[] = [
      "frame",
      "theme",
      "collection",
      "page-template",
      "kit",
    ];
    const lists = await Promise.all(
      types.map((type) =>
        type === "frame" && official
          ? listFrames({ official: true })
          : listItems({ type, profileId: profile.id, limit: 200 }),
      ),
    );
    const items = lists.flat();
    const view: CommunityProfileView = {
      creator: {
        profileId: profile.id,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        official,
        verified: official || profile.verifiedAt != null,
      },
      bio: profile.bio,
      itemCount: items.length,
      likeCount: items.reduce((sum, item) => sum + item.likeCount, 0),
      useCount: items.reduce((sum, item) => sum + item.useCount, 0),
      items,
    };
    return view;
  }, null);
  if (found) return found;
  if (handle !== OFFICIAL_HANDLE) return null;
  const items = officialFrameCards();
  return {
    creator: items[0]?.creator ?? {
      profileId: null,
      handle: OFFICIAL_HANDLE,
      displayName: "QRdx",
      avatarUrl: null,
      official: true,
      verified: true,
    },
    bio: null,
    itemCount: items.length,
    likeCount: 0,
    useCount: 0,
    items,
  };
}

/**
 * Popular themes from community_theme, as cards (before the backfill):
 * cleaned like the legacy gallery, banned authors left out, and linking to
 * the gallery rather than to an item page.
 */
export async function legacyThemeCards(
  limit: number,
): Promise<CommunityItemCard[]> {
  const rows = await db
    .select({
      id: communityTheme.id,
      name: qrPreset.name,
      style: qrPreset.style,
      likeCount: communityTheme.likeCount,
      publishedAt: communityTheme.publishedAt,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(communityTheme)
    .innerJoin(qrPreset, eq(qrPreset.id, communityTheme.themeId))
    .innerJoin(userTable, eq(userTable.id, communityTheme.userId))
    .where(authorNotBanned())
    .orderBy(desc(communityTheme.likeCount), desc(communityTheme.publishedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    type: "theme",
    slug: "",
    name: row.name,
    description: null,
    creator: {
      profileId: null,
      handle: null,
      displayName: row.authorName,
      avatarUrl: row.authorImage,
      official: false,
      verified: false,
    },
    isOfficial: false,
    version: 1,
    likeCount: Number(row.likeCount),
    saveCount: 0,
    useCount: 0,
    tags: [],
    publishedAt: new Date(row.publishedAt).toISOString(),
    preview: publicStyleFromSaved(row.style as ThemeStyles),
  }));
}

// ─── The theme gallery (CommunityTheme shape) ──────────────────────────────

export interface ThemeFeedOptions {
  sort: string;
  cursor: string | number | null;
  limit: number;
  filter: string;
  tags: string[];
  userId: string | null;
  timeRange: string;
}

/**
 * The theme gallery read from community_item, in the shape the existing
 * gallery (and its likes, tags and sorting) already uses.
 */
export async function themeItemsFeed(
  options: ThemeFeedOptions,
): Promise<CommunityThemesResponse> {
  const { sort, cursor, limit, filter, tags, userId, timeRange } = options;
  const conditions: SQL[] = [visible(), eq(communityItem.type, "theme")];
  if (filter === "mine" && userId) {
    conditions.push(eq(communityProfile.userId, userId));
  }
  if (filter === "liked" && userId) {
    conditions.push(
      inArray(
        communityItem.id,
        db
          .select({ id: communityLike.itemId })
          .from(communityLike)
          .where(eq(communityLike.userId, userId)),
      ),
    );
  }
  if (tags.length > 0) {
    conditions.push(
      inArray(
        communityItem.id,
        db
          .select({ id: communityItemTag.itemId })
          .from(communityItemTag)
          .where(inArray(communityItemTag.tag, tags)),
      ),
    );
  }
  if (sort === "popular" && timeRange !== "all") {
    const days = timeRange === "weekly" ? 7 : 30;
    conditions.push(
      gt(communityItem.publishedAt, new Date(Date.now() - days * 86_400_000)),
    );
  }
  let rows: ItemRow[];
  if (sort === "popular") {
    const offset = typeof cursor === "number" ? cursor : 0;
    rows = (await itemsQuery()
      .where(and(...conditions))
      .orderBy(
        desc(communityItem.likeCount),
        desc(communityItem.publishedAt),
        asc(communityItem.id),
      )
      .limit(limit + 1)
      .offset(offset)) as ItemRow[];
  } else {
    // Keyed by published time to the millisecond and id (lib/keyset-sql.ts):
    // items published in one moment (a backfill, a batch) page in id order,
    // none repeated or skipped.
    const direction = sort === "newest" ? "desc" : "asc";
    const after = afterFeedCursor(cursor, direction);
    if (after) conditions.push(after);
    rows = (await itemsQuery()
      .where(and(...conditions))
      .orderBy(
        ...keysetOrder(communityItem.publishedAt, communityItem.id, direction),
      )
      .limit(limit + 1)) as ItemRow[];
  }
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const ids = page.map((row) => row.id);
  const [tagMap, likedRows] = await Promise.all([
    tagsFor(ids),
    userId && ids.length > 0
      ? db
          .select({ itemId: communityLike.itemId })
          .from(communityLike)
          .where(
            and(
              eq(communityLike.userId, userId),
              inArray(communityLike.itemId, ids),
            ),
          )
      : Promise.resolve([] as { itemId: string }[]),
  ]);
  const liked = new Set(likedRows.map((row) => row.itemId));
  const themes: CommunityTheme[] = page.map((row) => ({
    id: row.id,
    // The item's id, never the saved theme it came from (see CommunityTheme)
    themeId: row.id,
    name: row.name,
    styles: applyStyleOf(row) ?? {},
    author: {
      id: row.profileId,
      name: row.displayName,
      image: row.avatarUrl,
    },
    likeCount: Number(row.likeCount),
    isLikedByMe: liked.has(row.id),
    publishedAt: new Date(row.publishedAt).toISOString(),
    tags: tagMap.get(row.id) ?? [],
    slug: row.slug,
    handle: row.handle,
    official: row.profileKind === "official",
  }));
  let nextCursor: string | number | null = null;
  const last = page.at(-1);
  if (hasMore && last) {
    nextCursor =
      sort === "popular"
        ? (typeof cursor === "number" ? cursor : 0) + limit
        : encodeKeyset({ at: new Date(last.publishedAt), id: last.id });
  }
  return { themes, nextCursor };
}

/**
 * Where a newest/oldest page starts: after the cursor's item. A cursor from
 * before the id was added (an ISO time alone, still held by an open sheet)
 * pages by the time alone, as it did; one that doesn't parse starts over.
 */
function afterFeedCursor(
  cursor: string | number | null,
  direction: KeysetDirection,
): SQL | undefined {
  if (typeof cursor !== "string" || !cursor) return;
  const keyset = decodeKeyset(cursor);
  if (keyset) {
    return keysetAfter(
      communityItem.publishedAt,
      communityItem.id,
      keyset,
      direction,
    );
  }
  const at = new Date(cursor);
  if (Number.isNaN(at.getTime())) return;
  return direction === "desc"
    ? lt(communityItem.publishedAt, at)
    : gt(communityItem.publishedAt, at);
}

/** Tag counts over visible theme items. */
export async function themeItemTagCounts(): Promise<
  { tag: string; count: number }[]
> {
  const rows = await db
    .select({ itemId: communityItem.id, tag: communityItemTag.tag })
    .from(communityItemTag)
    .innerJoin(communityItem, eq(communityItem.id, communityItemTag.itemId))
    .innerJoin(
      communityProfile,
      eq(communityProfile.id, communityItem.profileId),
    )
    .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
    .where(and(visible(), eq(communityItem.type, "theme")));
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.tag, (counts.get(row.tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Saved theme ids the user published as items (still public). */
export async function myPublishedThemeSources(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ sourceId: communityItem.sourceId })
    .from(communityItem)
    .where(
      and(
        eq(communityItem.type, "theme"),
        eq(communityItem.createdBy, userId),
        eq(communityItem.sourceKind, "qr_preset"),
        ne(communityItem.status, "removed"),
      ),
    );
  return rows.flatMap((row) => (row.sourceId ? [row.sourceId] : []));
}

/** The viewer's saved frames, for the editor's frame picker. */
export async function savedFrames(
  userId: string,
): Promise<{ id: string; name: string; frame: QRCustomFrame }[]> {
  return guardedRead(async () => {
    const rows = (await itemsQuery()
      .where(
        and(
          visible(),
          eq(communityItem.type, "frame"),
          inArray(
            communityItem.id,
            db
              .select({ id: communitySave.itemId })
              .from(communitySave)
              .where(eq(communitySave.userId, userId)),
          ),
        ),
      )
      .orderBy(asc(communityItem.name))
      .limit(48)) as ItemRow[];
    return rows.flatMap((row) => {
      const frame = frameOf(row.payload);
      return frame ? [{ id: row.id, name: row.name, frame }] : [];
    });
  }, []);
}

export interface ReviewRow {
  id: string;
  type: CommunityItemType;
  slug: string;
  name: string;
  description: string | null;
  handle: string | null;
  displayName: string;
  createdBy: string | null;
  likeCount: number;
  useCount: number;
  publishedAt: Date;
}

/**
 * Post-moderation: members' items as they go live, newest first, for the
 * admin review queue (/admin/community). Official items aren't listed.
 * Banned or suspended creators' items are already hidden everywhere.
 */
export async function itemsForReview(options: {
  type?: CommunityItemType;
  limit: number;
  offset: number;
}): Promise<{ rows: ReviewRow[]; total: number }> {
  return guardedRead(
    async () => {
      const where = and(
        visible(),
        eq(communityItem.isOfficial, false),
        ...(options.type ? [eq(communityItem.type, options.type)] : []),
      );
      const [rows, [total]] = await Promise.all([
        db
          .select({
            id: communityItem.id,
            type: communityItem.type,
            slug: communityItem.slug,
            name: communityItem.name,
            description: communityItem.description,
            handle: communityProfile.handle,
            displayName: communityProfile.displayName,
            createdBy: communityItem.createdBy,
            likeCount: communityItem.likeCount,
            useCount: communityItem.useCount,
            publishedAt: communityItem.publishedAt,
          })
          .from(communityItem)
          .innerJoin(
            communityProfile,
            eq(communityProfile.id, communityItem.profileId),
          )
          .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
          .where(where)
          .orderBy(desc(communityItem.publishedAt), asc(communityItem.id))
          .limit(options.limit)
          .offset(options.offset),
        db
          .select({ n: count() })
          .from(communityItem)
          .innerJoin(
            communityProfile,
            eq(communityProfile.id, communityItem.profileId),
          )
          .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
          .where(where),
      ]);
      return {
        rows: rows.map((row) => ({
          ...row,
          type: row.type as CommunityItemType,
          likeCount: Number(row.likeCount),
          useCount: Number(row.useCount),
        })),
        total: Number(total?.n ?? 0),
      };
    },
    { rows: [], total: 0 },
  );
}

export interface FullTextSearch {
  /** A tsquery from toPrefixQuery */
  query: string;
  words: string[];
  type?: CommunityItemType;
  tag?: string;
  limit: number;
  offset: number;
}

/** The two queries of a full-text search, built but not run. */
export function fullTextSearchQueries(options: FullTextSearch) {
  const tsquery = sql`to_tsquery('simple'::regconfig, ${options.query})`;
  const tagged = (tag: string) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(communityItemTag)
        .where(
          and(
            eq(communityItemTag.itemId, communityItem.id),
            eq(communityItemTag.tag, tag),
          ),
        ),
    );
  const where = and(
    visible(),
    ...(options.type ? [eq(communityItem.type, options.type)] : []),
    ...(options.tag ? [tagged(options.tag)] : []),
    or(
      sql`${SEARCH_DOCUMENT} @@ ${tsquery}`,
      ...options.words.map((word) => tagged(word)),
      ...options.words.map((word) =>
        ilike(communityProfile.handle, `${word}%`),
      ),
    ),
  ) as SQL;
  return {
    rows: itemsQuery()
      .where(where)
      .orderBy(
        desc(sql`ts_rank(${SEARCH_DOCUMENT}, ${tsquery})`),
        desc(communityItem.likeCount),
        desc(communityItem.publishedAt),
        asc(communityItem.id),
      )
      .limit(options.limit)
      .offset(options.offset),
    total: db
      .select({ n: count() })
      .from(communityItem)
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(where),
  };
}

/**
 * Full-text search: published items whose name or
 * description matches every word as a prefix, or that carry one of the
 * words as a tag, or whose creator's handle starts with one; best match
 * first. Only called once the index exists (lib/community/search.ts).
 */
export async function searchItemsFullText(
  options: FullTextSearch,
): Promise<{ cards: CommunityItemCard[]; total: number }> {
  const queries = fullTextSearchQueries(options);
  const [rows, [total]] = await Promise.all([
    queries.rows as Promise<ItemRow[]>,
    queries.total,
  ]);
  return { cards: await toCards(rows), total: Number(total?.n ?? 0) };
}
