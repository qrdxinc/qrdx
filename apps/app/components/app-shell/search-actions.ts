"use server";

import { database as db, landingPage } from "@repo/database";
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { listCodes } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { actionText } from "@/lib/i18n/action-locale";
import { localizeContent } from "@/lib/i18n/content-server";
import { getTemplate } from "@/lib/landing/templates";
import { type ActiveScope, getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { workspaceHref } from "@/lib/workspace-paths";
import { UnauthorizedError } from "@/types/errors";
import {
  SEARCH_MESSAGES,
  type SearchMessages,
  searchMessages,
} from "./search-messages";

/** One row of the ⌘K palette's workspace results. */
export interface SearchHit {
  id: string;
  href: string;
  title: string;
  /** Short link, destination or page type */
  detail: string;
  archived?: boolean;
}

export type WorkspaceSearchResult =
  | { ok: true; codes: SearchHit[]; pages: SearchHit[] }
  | { ok: false; error: string };

const RESULTS_PER_GROUP = 5;
const MAX_QUERY = 100;

// Typing sends at most one request per pause (the palette debounces), so
// this only stops scripted scraping of a workspace.
const searchLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

function pageScopeWhere(scope: ActiveScope): SQL {
  return eq(landingPage.organizationId, scope.organizationId);
}

interface SearchText {
  locale: Locale;
  messages: SearchMessages;
}

/**
 * What the palette says, in the app's language (only app pages search);
 * English, logged, if it can't be read. Page types' names come from the
 * templates' translations (lib/i18n/content-server.ts). `userId`: who's
 * searching, when known (no second session read on every search).
 */
const searchText = (userId?: string) =>
  actionText<SearchText>(
    { locale: DEFAULT_LOCALE, messages: SEARCH_MESSAGES },
    async (locale) => ({
      locale,
      messages: searchMessages(
        await getTranslations({ locale, namespace: "communityActions.search" }),
      ),
    }),
    { userId, action: "app-shell.searchText" },
  );

/** A page type's name, e.g. "Menu", in `text`'s language. */
async function pageTypeName(type: string, text: SearchText): Promise<string> {
  const label = getTemplate(type)?.label;
  return label
    ? await localizeContent(label, text.locale)
    : text.messages.landingPage;
}

async function searchPages(
  scope: ActiveScope,
  slug: string,
  term: string,
): Promise<SearchHit[]> {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({
      id: landingPage.id,
      title: landingPage.title,
      type: landingPage.type,
    })
    .from(landingPage)
    .where(and(pageScopeWhere(scope), ilike(landingPage.title, pattern)))
    .orderBy(desc(landingPage.updatedAt), desc(landingPage.id))
    .limit(RESULTS_PER_GROUP);
  if (rows.length === 0) return [];
  const text = await searchText(scope.userId);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      href: workspaceHref(slug, `/pages/${encodeURIComponent(row.id)}`),
      title: row.title?.trim() || text.messages.untitledPage,
      detail: await pageTypeName(row.type, text),
    })),
  );
}

/**
 * Codes (title, destination, notes, tags or short link: the same match as
 * the codes list) and landing pages (title) of the active workspace. Only
 * what the codes and pages screens already show this person.
 */
export async function searchWorkspace(
  query: string,
): Promise<WorkspaceSearchResult> {
  const term =
    typeof query === "string" ? query.trim().slice(0, MAX_QUERY) : "";
  if (term.length < 2) return { ok: true, codes: [], pages: [] };

  try {
    const { scope, workspace } = await getActiveWorkspace();
    const { success } = await searchLimiter.limit(`app-search:${scope.userId}`);
    if (!success) {
      return {
        ok: false,
        error: (await searchText(scope.userId)).messages.tooMany,
      };
    }
    const [{ codes }, pages] = await Promise.all([
      listCodes(scope, { q: term, status: "all", limit: RESULTS_PER_GROUP }),
      searchPages(scope, workspace.slug, term),
    ]);
    return {
      ok: true,
      codes: codes.map((code) => ({
        id: code.id,
        href: workspaceHref(
          workspace.slug,
          `/codes/${encodeURIComponent(code.id)}`,
        ),
        title: code.title?.trim() || code.destinationUrl,
        detail: code.shortLink.replace(/^https?:\/\//, ""),
        archived: code.archivedAt !== null,
      })),
      pages,
    };
  } catch (error) {
    const { messages } = await searchText();
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: messages.signInAgain };
    }
    logError(error as Error, { action: "app-shell.searchWorkspace" });
    return { ok: false, error: messages.notWorking };
  }
}
