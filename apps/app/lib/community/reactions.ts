import "server-only";

import {
  communityItem,
  communityLike,
  communitySave,
  database as db,
} from "@repo/database";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { CheckError } from "./messages";
import { COMMUNITY_TAG, guarded, guardedRead } from "./store";

// Likes (public appreciation) and bookmarks on items. Each toggle checks the
// item is published, flips the row and moves the count. Bookmarks are stored
// as saves (community_save, saveCount); people only ever see "bookmark".

export class ItemNotFoundError extends CheckError {
  constructor() {
    super((m) => m.itemNotFound);
    this.name = "ItemNotFoundError";
  }
}

async function publishedItem(itemId: string) {
  const [item] = await db
    .select({ id: communityItem.id, type: communityItem.type })
    .from(communityItem)
    .where(
      and(eq(communityItem.id, itemId), eq(communityItem.status, "published")),
    )
    .limit(1);
  if (!item) throw new ItemNotFoundError();
  return item;
}

export async function toggleItemLike(
  userId: string,
  itemId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  return guarded(async () => {
    const item = await publishedItem(itemId);
    const removed = await db
      .delete(communityLike)
      .where(
        and(eq(communityLike.userId, userId), eq(communityLike.itemId, itemId)),
      )
      .returning({ itemId: communityLike.itemId });
    let liked: boolean;
    if (removed.length > 0) {
      liked = false;
      await db
        .update(communityItem)
        .set({ likeCount: sql`${communityItem.likeCount} - 1` })
        .where(
          and(eq(communityItem.id, itemId), gt(communityItem.likeCount, 0)),
        );
    } else {
      const added = await db
        .insert(communityLike)
        .values({ userId, itemId, createdAt: new Date() })
        .onConflictDoNothing()
        .returning({ itemId: communityLike.itemId });
      liked = true;
      if (added.length > 0) {
        await db
          .update(communityItem)
          .set({ likeCount: sql`${communityItem.likeCount} + 1` })
          .where(eq(communityItem.id, itemId));
      }
    }
    const [row] = await db
      .select({ likeCount: communityItem.likeCount })
      .from(communityItem)
      .where(eq(communityItem.id, itemId))
      .limit(1);
    revalidateTag(COMMUNITY_TAG, "max");
    if (item.type === "theme") revalidateTag("community-themes", "max");
    return { liked, likeCount: Number(row?.likeCount ?? 0) };
  });
}

export async function toggleItemSave(
  userId: string,
  itemId: string,
): Promise<{ saved: boolean; saveCount: number }> {
  return guarded(async () => {
    await publishedItem(itemId);
    const count = async () => {
      const [row] = await db
        .select({ saveCount: communityItem.saveCount })
        .from(communityItem)
        .where(eq(communityItem.id, itemId))
        .limit(1);
      return Number(row?.saveCount ?? 0);
    };
    const removed = await db
      .delete(communitySave)
      .where(
        and(eq(communitySave.userId, userId), eq(communitySave.itemId, itemId)),
      )
      .returning({ itemId: communitySave.itemId });
    if (removed.length > 0) {
      await db
        .update(communityItem)
        .set({ saveCount: sql`${communityItem.saveCount} - 1` })
        .where(
          and(eq(communityItem.id, itemId), gt(communityItem.saveCount, 0)),
        );
      revalidateTag(COMMUNITY_TAG, "max");
      return { saved: false, saveCount: await count() };
    }
    const added = await db
      .insert(communitySave)
      .values({ userId, itemId, createdAt: new Date() })
      .onConflictDoNothing()
      .returning({ itemId: communitySave.itemId });
    if (added.length > 0) {
      await db
        .update(communityItem)
        .set({ saveCount: sql`${communityItem.saveCount} + 1` })
        .where(eq(communityItem.id, itemId));
    }
    revalidateTag(COMMUNITY_TAG, "max");
    return { saved: true, saveCount: await count() };
  });
}

/** Most items one lookup answers for (a gallery page's cards and more). */
export const REACTIONS_LOOKUP_MAX = 120;

export interface ItemReactions {
  liked: string[];
  bookmarked: string[];
  /**
   * The items' counts as they are now: the cards' own come from a list
   * cached for a minute, which can miss the account's latest like
   */
  counts: Record<string, { likes: number; bookmarks: number }>;
}

/**
 * Which of these items an account liked and bookmarked, with their counts,
 * for the cards' buttons (the cards themselves are cached for everyone).
 */
export async function itemReactionsOf(
  userId: string,
  itemIds: string[],
): Promise<ItemReactions> {
  const ids = [...new Set(itemIds)].slice(0, REACTIONS_LOOKUP_MAX);
  const none: ItemReactions = { liked: [], bookmarked: [], counts: {} };
  if (ids.length === 0) return none;
  // A read: without the community tables, nothing is liked or bookmarked
  return guardedRead(async () => {
    const [likes, saves, items] = await Promise.all([
      db
        .select({ itemId: communityLike.itemId })
        .from(communityLike)
        .where(
          and(
            eq(communityLike.userId, userId),
            inArray(communityLike.itemId, ids),
          ),
        ),
      db
        .select({ itemId: communitySave.itemId })
        .from(communitySave)
        .where(
          and(
            eq(communitySave.userId, userId),
            inArray(communitySave.itemId, ids),
          ),
        ),
      db
        .select({
          id: communityItem.id,
          likeCount: communityItem.likeCount,
          saveCount: communityItem.saveCount,
        })
        .from(communityItem)
        .where(inArray(communityItem.id, ids)),
    ]);
    return {
      liked: likes.map((row) => row.itemId),
      bookmarked: saves.map((row) => row.itemId),
      counts: Object.fromEntries(
        items.map((row) => [
          row.id,
          { likes: Number(row.likeCount), bookmarks: Number(row.saveCount) },
        ]),
      ),
    };
  }, none);
}
