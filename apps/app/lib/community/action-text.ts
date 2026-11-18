import "server-only";

import { getTranslations } from "next-intl/server";
import { actionText } from "@/lib/i18n/action-locale";
import {
  COMMUNITY_ACTION_MESSAGES,
  COMMUNITY_THEME_ACTION_MESSAGES,
  type CommunityActionMessages,
  type CommunityThemeActionMessages,
  communityActionMessages,
  communityThemeActionMessages,
} from "./action-messages";
import {
  COMMUNITY_CHECK_MESSAGES,
  type CommunityCheckMessages,
  communityCheckMessages,
  PAGE_CHANGE_MESSAGES,
  type PageChangeMessages,
  pageChangeMessages,
} from "./messages";

/** Everything the community's server actions say, in one language. */
export interface CommunityActionText {
  actions: CommunityActionMessages;
  themes: CommunityThemeActionMessages;
  checks: CommunityCheckMessages;
  pageChanges: PageChangeMessages;
}

/** CommunityActionText in English, for the pages that are English only. */
export const ENGLISH_COMMUNITY_TEXT: CommunityActionText = {
  actions: COMMUNITY_ACTION_MESSAGES,
  themes: COMMUNITY_THEME_ACTION_MESSAGES,
  checks: COMMUNITY_CHECK_MESSAGES,
  pageChanges: PAGE_CHANGE_MESSAGES,
};

/**
 * CommunityActionText in the language of the page that called `action`
 * (lib/i18n/action-locale.ts: `pageLocale` when it names a language, else
 * the app's); English, logged, when that can't be read.
 */
export function communityActionText(
  pageLocale: unknown,
  action: string,
): Promise<CommunityActionText> {
  return actionText(
    ENGLISH_COMMUNITY_TEXT,
    async (locale) => {
      const [actions, themes, checks, pageChanges] = await Promise.all([
        getTranslations({ locale, namespace: "communityActions.community" }),
        getTranslations({
          locale,
          namespace: "communityActions.communityThemes",
        }),
        getTranslations({ locale, namespace: "communityActions.checks" }),
        getTranslations({ locale, namespace: "communityActions.pageChanges" }),
      ]);
      return {
        actions: communityActionMessages(actions),
        themes: communityThemeActionMessages(themes),
        checks: communityCheckMessages(checks),
        pageChanges: pageChangeMessages(pageChanges),
      };
    },
    { pageLocale, action: `community.${action}` },
  );
}

/**
 * communityActionText() for one action call, read the first time the call
 * needs it (most calls succeed without saying anything).
 */
export function lazyCommunityText(
  pageLocale: unknown,
  action: string,
): () => Promise<CommunityActionText> {
  let text: Promise<CommunityActionText> | undefined;
  return () => {
    text ??= communityActionText(pageLocale, action);
    return text;
  };
}
