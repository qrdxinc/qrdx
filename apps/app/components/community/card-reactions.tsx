"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { cn } from "@repo/design-system/lib/utils";
import { Archive, Heart } from "iconsax-reactjs";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  communityReactions,
  toggleCommunityLike,
  toggleCommunitySave,
} from "@/actions/community";
import type { CommunityItemType } from "@/lib/community/types";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";

// A card's like and bookmark buttons. The cards are drawn on the server and
// cached for everyone, so what the visitor liked and bookmarked is looked up
// here: every card on the page asks at once, in one request, and the answer
// is kept for the visit. Bookmarks are stored as saves (toggleCommunitySave).

interface Mine {
  liked: boolean;
  bookmarked: boolean;
  /** The counts now, once looked up or changed (else the card's own) */
  likes?: number;
  bookmarks?: number;
}

const NONE: Mine = { liked: false, bookmarked: false };

/** What the visitor did to each item, once looked up or changed. */
const known = new Map<string, Mine>();
const listeners = new Set<() => void>();
/** Bumped on every change, for useSyncExternalStore. */
let version = 0;
let waiting = new Set<string>();
/** A lookup is due (the cards drawn in the same moment wait for it). */
let scheduled = false;
/** The account the answers belong to (they're dropped when it changes). */
let owner: string | null = null;

/** Most ids one request asks about (the action's own limit). */
const BATCH = 120;

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function lookUp() {
  scheduled = false;
  const ids = [...waiting];
  waiting = new Set();
  const asked = owner;
  for (let start = 0; start < ids.length; start += BATCH) {
    const batch = ids.slice(start, start + BATCH);
    const answer = await communityReactions(batch).catch(() => null);
    // Signed out or switched account meanwhile: the answer is someone else's
    if (owner !== asked) return;
    const liked = new Set(answer?.liked);
    const bookmarked = new Set(answer?.bookmarked);
    for (const id of batch) {
      const counts = answer?.counts[id];
      known.set(id, {
        liked: liked.has(id),
        bookmarked: bookmarked.has(id),
        ...(counts && { likes: counts.likes, bookmarks: counts.bookmarks }),
      });
    }
  }
  changed();
}

/** Asks about an item with the others drawn in the same moment. */
function ask(id: string) {
  if (known.has(id) || waiting.has(id)) return;
  waiting.add(id);
  if (scheduled) return;
  scheduled = true;
  setTimeout(lookUp, 40);
}

/** Starts over for another account (or none). */
function ownedBy(userId: string | null) {
  if (owner === userId) return;
  owner = userId;
  known.clear();
  waiting = new Set();
  changed();
}

/**
 * Records a like or bookmark (and the count it left), from a card or from
 * an item's own buttons, so every card of the item shows it.
 */
export function rememberReaction(id: string, patch: Partial<Mine>) {
  known.set(id, { ...(known.get(id) ?? NONE), ...patch });
  changed();
}

/** What the visitor did to an item: nothing until it's known. */
function useMine(id: string): Mine {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    ownedBy(userId);
    if (userId) ask(id);
  }, [id, userId]);
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return userId ? (known.get(id) ?? NONE) : NONE;
}

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * A small round button with its count, as tall as the caption's line, so
 * it adds no height. The caption above the card's link lets clicks through
 * everywhere but here (./item-card.tsx).
 */
const BUTTON =
  "pointer-events-auto relative -my-1 flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-1.5 text-xs tabular-nums transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none";

export function CardReactions({
  id,
  type,
  likeCount,
  bookmarkCount,
}: {
  id: string;
  type: CommunityItemType;
  likeCount: number;
  bookmarkCount: number;
}) {
  const t = useTranslations("community.itemCard");
  const said = useTranslations("community.itemActions");
  // The server answers in this page's language (lib/i18n/action-locale.ts).
  const locale = useLocale();
  const { checkValidSession } = useSessionGuard();
  const mine = useMine(id);
  // The card was drawn from a list cached for a minute: the counts looked up
  // for the visitor (or left by their own changes) are newer
  const likes = mine.likes ?? likeCount;
  const bookmarks = mine.bookmarks ?? bookmarkCount;
  const [busy, setBusy] = useState<"like" | "bookmark" | null>(null);

  // Each toggle shows its result at once, then takes the server's answer
  // (or puts things back and says why).
  const like = async () => {
    if (!checkValidSession("community_action")) return;
    const before = { liked: mine.liked, likes };
    setBusy("like");
    rememberReaction(id, {
      liked: !before.liked,
      likes: Math.max(0, likes + (before.liked ? -1 : 1)),
    });
    const result = await toggleCommunityLike(id, locale);
    setBusy(null);
    if (!result.ok) {
      rememberReaction(id, before);
      toast.error(result.message);
      return;
    }
    rememberReaction(id, {
      liked: result.data.liked,
      likes: result.data.likeCount,
    });
  };

  const bookmark = async () => {
    if (!checkValidSession("community_action")) return;
    const before = { bookmarked: mine.bookmarked, bookmarks };
    setBusy("bookmark");
    rememberReaction(id, {
      bookmarked: !before.bookmarked,
      bookmarks: Math.max(0, bookmarks + (before.bookmarked ? -1 : 1)),
    });
    const result = await toggleCommunitySave(id);
    setBusy(null);
    if (!result.ok) {
      rememberReaction(id, before);
      toast.error(result.message);
      return;
    }
    rememberReaction(id, {
      bookmarked: result.data.saved,
      bookmarks: result.data.saveCount,
    });
    toast.success(
      result.data.saved
        ? type === "frame"
          ? said("savedItsInTheEditors")
          : said("saved2")
        : said("removedFromSaved"),
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        aria-pressed={mine.liked}
        className={cn(
          BUTTON,
          mine.liked ? "text-foreground" : "text-muted-foreground",
        )}
        data-reaction="like"
        disabled={busy === "like"}
        onClick={like}
        type="button"
      >
        <Heart
          aria-hidden
          className="size-4"
          variant={mine.liked ? "Bold" : "Linear"}
        />
        <span className="sr-only">{mine.liked ? t("unlike") : t("like")}</span>
        {likes > 0 && COUNT.format(likes)}
      </button>
      <button
        aria-pressed={mine.bookmarked}
        className={cn(
          BUTTON,
          mine.bookmarked ? "text-foreground" : "text-muted-foreground",
        )}
        data-reaction="bookmark"
        disabled={busy === "bookmark"}
        onClick={bookmark}
        type="button"
      >
        <Archive
          aria-hidden
          className="size-4"
          variant={mine.bookmarked ? "Bold" : "Linear"}
        />
        <span className="sr-only">
          {mine.bookmarked ? t("removeBookmark") : t("bookmark")}
        </span>
        {bookmarks > 0 && COUNT.format(bookmarks)}
      </button>
    </div>
  );
}
