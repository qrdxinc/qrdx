// What the ⌘K palette's workspace search (./search-actions.ts) says, in
// English. The app's pages call it, so it answers in the app's language
// (lib/i18n/app-locale.ts), from communityActions.search in
// messages/en.json; a test keeps the catalog's English equal to these.
import type { Translator } from "@/lib/i18n/translator";

export const SEARCH_MESSAGES = {
  untitledPage: "Untitled page",
  landingPage: "Landing page",
  tooMany: "Too many searches. Wait a moment.",
  signInAgain: "Sign in again to search.",
  notWorking: "Search isn't working right now.",
};

export type SearchMessages = typeof SEARCH_MESSAGES;

/** SEARCH_MESSAGES in the catalog's language. */
export function searchMessages(
  t: Translator<"communityActions.search">,
): SearchMessages {
  return {
    untitledPage: t("untitledPage"),
    landingPage: t("landingPage"),
    tooMany: t("tooMany"),
    signInAgain: t("signInAgain"),
    notWorking: t("notWorking"),
  };
}
