"use server";

// Everything the code builder reads as it opens, in one round trip. Server
// actions from a page run one after another, so the five separate reads it
// started with (settings, themes, folders, tags, domains) held the form
// back by several round trips. Read-only; each part fails on its own and the
// failure is reported, never hidden, in the language of the page the builder
// opens on: the dashboard or the playground (/es/playground), which sends
// its own (`pageLocale`, lib/i18n/action-locale.ts).

import { getTranslations } from "next-intl/server";
import { getUserSettings } from "@/actions/user-settings";
import {
  listFolders,
  listTags,
  type TagRow,
} from "@/app/(app)/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import {
  type DomainOptions,
  getDomainOptions,
} from "@/app/(app)/dashboard/domains/_lib/domains";
import { listVisibleThemes } from "@/app/(app)/dashboard/themes/_lib/queries";
import type { SavedTheme } from "@/app/(app)/dashboard/themes/_lib/theme";
import { actionText } from "@/lib/i18n/action-locale";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import {
  CODE_BUILDER_DATA_MESSAGES,
  type CodeBuilderDataMessages,
  codeBuilderDataMessages,
} from "./action-messages";

export interface CodeBuilderData {
  /** Saved themes the workspace can use; null when they couldn't load */
  themes: SavedTheme[] | null;
  folders: FolderRow[] | null;
  tags: TagRow[] | null;
  /** Custom domains and back-half rights; null when they couldn't load */
  domains: DomainOptions | null;
  /** user.settings.keyboardShortcuts (on unless switched off) */
  keyboardShortcuts: boolean;
  /** What couldn't load, in words for the form */
  problems: string[];
}

export type CodeBuilderDataResult =
  | { success: true; data: CodeBuilderData }
  | { success: false; error: { message: string } };

function settled<T>(
  result: PromiseSettledResult<T>,
  part: string,
  problems: string[],
  message: string,
): T | null {
  if (result.status === "fulfilled") return result.value;
  logError(result.reason as Error, { action: "getCodeBuilderData", part });
  problems.push(message);
  return null;
}

/** The messages in the page's language; English, logged, if unreadable. */
const builderText = (pageLocale: unknown) =>
  actionText<CodeBuilderDataMessages>(
    CODE_BUILDER_DATA_MESSAGES,
    async (locale) =>
      codeBuilderDataMessages(
        await getTranslations({
          locale,
          namespace: "communityActions.codeBuilder",
        }),
      ),
    { pageLocale, action: "getCodeBuilderData" },
  );

export async function getCodeBuilderData(
  pageLocale?: string,
): Promise<CodeBuilderDataResult> {
  let scope: Awaited<ReturnType<typeof getActiveScope>>;
  try {
    scope = await getActiveScope();
  } catch (error) {
    const m = await builderText(pageLocale);
    if (error instanceof UnauthorizedError) {
      return { success: false, error: { message: m.signInAgain } };
    }
    logError(error as Error, { action: "getCodeBuilderData" });
    return { success: false, error: { message: m.loadFailed } };
  }

  const [themes, folders, tags, domains, settings] = await Promise.allSettled([
    listVisibleThemes(scope),
    listFolders(scope),
    listTags(scope),
    getDomainOptions(scope),
    getUserSettings(),
  ] as const);
  const problems: string[] = [];
  const failed = [themes, folders, tags, domains].some(
    (part) => part.status === "rejected",
  );
  // Read only when a part failed: most opens say nothing.
  const m = failed ? await builderText(pageLocale) : CODE_BUILDER_DATA_MESSAGES;
  return {
    success: true,
    data: {
      themes: settled(themes, "themes", problems, m.themesFailed),
      folders: settled(folders, "folders", problems, m.foldersFailed),
      tags: settled(tags, "tags", problems, m.tagsFailed),
      domains: settled(domains, "domains", problems, m.domainsFailed),
      keyboardShortcuts:
        settings.status === "fulfilled"
          ? (settings.value?.keyboardShortcuts ?? true)
          : true,
      problems,
    },
  };
}
