// What actions/community.ts and actions/community-themes.ts answer with
// themselves, in English. The actions say them in the language of the page
// that asked (./action-text.ts), from communityActions.community and
// communityActions.communityThemes in messages/en.json; a test keeps the
// catalog's English equal to these. What the checks they run say is in
// ./messages.ts.
import type { Translator } from "@/lib/i18n/translator";

export const COMMUNITY_ACTION_MESSAGES = {
  signIn: "Sign in to continue.",
  failed: "Something went wrong. Please try again.",
  checkDetails: "Check the details.",
  themeNotInWorkspace: "This theme isn't in this workspace.",
  noCustomFrame: "This theme has no custom frame.",
  pageNotFound: "Page not found.",
  pageChanged:
    "This page changed since you reviewed it. Review it again before publishing.",
  svgTooLarge: "SVG files can be up to 200 KB.",
  tooManyImports: "Too many imports. Try again in an hour.",
  tooManyChanges: "Too many changes. Try again later.",
};

export type CommunityActionMessages = typeof COMMUNITY_ACTION_MESSAGES;

/** COMMUNITY_ACTION_MESSAGES in the catalog's language. */
export function communityActionMessages(
  t: Translator<"communityActions.community">,
): CommunityActionMessages {
  return {
    signIn: t("signIn"),
    failed: t("failed"),
    checkDetails: t("checkDetails"),
    themeNotInWorkspace: t("themeNotInWorkspace"),
    noCustomFrame: t("noCustomFrame"),
    pageNotFound: t("pageNotFound"),
    pageChanged: t("pageChanged"),
    svgTooLarge: t("svgTooLarge"),
    tooManyImports: t("tooManyImports"),
    tooManyChanges: t("tooManyChanges"),
  };
}

export const COMMUNITY_THEME_ACTION_MESSAGES = {
  alreadyPublished: "This theme is already published to the community.",
  workspaceAdminsOnly:
    "Only owners and admins of this workspace can publish its themes.",
  workspaceUnavailable:
    "Publishing workspace themes isn't available on this deployment yet.",
  tooFast: "You're publishing too fast. Please try again later.",
};

export type CommunityThemeActionMessages =
  typeof COMMUNITY_THEME_ACTION_MESSAGES;

/** COMMUNITY_THEME_ACTION_MESSAGES in the catalog's language. */
export function communityThemeActionMessages(
  t: Translator<"communityActions.communityThemes">,
): CommunityThemeActionMessages {
  return {
    alreadyPublished: t("alreadyPublished"),
    workspaceAdminsOnly: t("workspaceAdminsOnly"),
    workspaceUnavailable: t("workspaceUnavailable"),
    tooFast: t("tooFast"),
  };
}
