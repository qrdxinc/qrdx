// What the code builder's data action (./actions.ts) says, in English. It
// answers in the language of the page the builder opens on
// (lib/i18n/action-locale.ts), from communityActions.codeBuilder in
// messages/en.json; a test keeps the catalog's English equal to these.
import type { Translator } from "@/lib/i18n/translator";

export const CODE_BUILDER_DATA_MESSAGES = {
  signInAgain: "Sign in again to create codes.",
  loadFailed: "Couldn't load the builder. Try again.",
  themesFailed: "Saved themes didn't load.",
  foldersFailed: "Folders didn't load.",
  tagsFailed: "Tags didn't load.",
  domainsFailed:
    "Custom domains didn't load, so codes use the default short link.",
};

export type CodeBuilderDataMessages = typeof CODE_BUILDER_DATA_MESSAGES;

/** CODE_BUILDER_DATA_MESSAGES in the catalog's language. */
export function codeBuilderDataMessages(
  t: Translator<"communityActions.codeBuilder">,
): CodeBuilderDataMessages {
  return {
    signInAgain: t("signInAgain"),
    loadFailed: t("loadFailed"),
    themesFailed: t("themesFailed"),
    foldersFailed: t("foldersFailed"),
    tagsFailed: t("tagsFailed"),
    domainsFailed: t("domainsFailed"),
  };
}
