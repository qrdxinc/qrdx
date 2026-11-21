// Public creator handles (/community/@handle). Opt-in: a person claims one
// in Settings; nothing is derived from the email address. The official
// QRdx profile holds "qrdx", and no one else can take it or a lookalike.
import {
  COMMUNITY_CHECK_MESSAGES,
  type CommunityCheckMessages,
} from "./messages";
import { type CommunityItemType, TYPE_SEGMENTS } from "./types";

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

/** 3 to 30 of a-z, 0-9, "_" and "-", starting with a letter or digit. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/** The official profile's handle. */
export const OFFICIAL_HANDLE = "qrdx";

export const RESERVED_HANDLES = [
  "qrdx",
  "official",
  "admin",
  "administrator",
  "team",
  "staff",
  "support",
  "help",
  "community",
  "templates",
  "template",
  "frames",
  "frame",
  "themes",
  "theme",
  "collections",
  "collection",
  "kits",
  "api",
  "app",
  "about",
  "settings",
  "dashboard",
  "account",
  "billing",
  "pricing",
  "docs",
  "blog",
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "me",
  "u",
  "moderator",
  "mod",
  "security",
  "abuse",
  "legal",
  "privacy",
  "terms",
  "root",
  "system",
  "null",
  "undefined",
  "anonymous",
  "everyone",
  "here",
  "new",
  "edit",
] as const;

const RESERVED = new Set<string>(RESERVED_HANDLES);

/** "@Ana_Ruiz " → "ana_ruiz": what a person typed, as a handle. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

/**
 * A handle that reads as "qrdx" once separators are dropped and look-alike
 * digits read as letters ("qr-dx", "qrd_x", "0fficial-qrdx").
 */
export function looksLikeQrdx(handle: string): boolean {
  const plain = handle
    .replace(/[-_]/g, "")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "l")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
  return plain.includes("qrdx");
}

/**
 * Why `handle` can't be claimed by a person, or null when it can. In English
 * unless `messages` is another language's set (./messages.ts).
 */
export function handleProblem(
  handle: string,
  messages: CommunityCheckMessages = COMMUNITY_CHECK_MESSAGES,
): string | null {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH ||
    !HANDLE_PATTERN.test(handle)
  ) {
    return messages.handleFormat({
      min: HANDLE_MIN_LENGTH,
      max: HANDLE_MAX_LENGTH,
    });
  }
  if (RESERVED.has(handle) || looksLikeQrdx(handle)) {
    return messages.handleReserved;
  }
  return null;
}

/** "/community/@ana" */
export const profilePath = (handle: string) => `/community/@${handle}`;

/**
 * A profile's link with a type's tab ("/community/@ana?type=templates")
 * and a page after the first. The tab is the type's gallery segment, the
 * one the profile reads back.
 */
export function profileHref(
  handle: string,
  { tab = null, page = 1 }: { tab?: CommunityItemType | null; page?: number },
): string {
  const params = new URLSearchParams();
  if (tab) params.set("type", TYPE_SEGMENTS[tab]);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${profilePath(handle)}?${search}` : profilePath(handle);
}

/**
 * A profile page's canonical URL: each page of the full list is its own,
 * so search engines reach the items past the first page; a tab points at
 * the full list's first page.
 */
export const profileCanonical = (
  handle: string,
  tab: CommunityItemType | null,
  page: number,
) => profileHref(handle, { page: tab ? 1 : page });
