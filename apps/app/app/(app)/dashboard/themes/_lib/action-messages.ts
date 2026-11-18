// What actions/qr-themes.ts answers with, in English. The actions say them in
// the language of the page that asked (lib/i18n/action-locale.ts), from
// communityActions.qrThemes in messages/en.json; a test keeps the catalog's
// English equal to these.
import type { Translator } from "@/lib/i18n/translator";

export const QR_THEME_MESSAGES = {
  signIn: "Sign in to manage themes.",
  failed: "Something went wrong. Please try again.",
  tooMany: "Too many changes. Please wait a minute and try again.",
  themeLimit: ({ limit }: { limit: number }) =>
    `You have reached the limit of ${limit} saved themes on the Free plan. Upgrade to Pro for unlimited themes.`,
  notFound: "Theme not found.",
  defaultAdminsOnly:
    "Only workspace owners and admins can change its default theme.",
  openAnotherWorkspace: "Open another workspace to share themes with it.",
  shareAdminsOnly: "Only workspace owners and admins can share themes here.",
  sharedThemesPlan: ({ plan }: { plan: string }) =>
    `Shared themes are part of the ${plan} plan (based on the workspace owner's plan).`,
  workspaceThemeLimit: ({ count }: { count: number }) =>
    `This workspace's plan includes ${count} themes.`,
};

export type QrThemeMessages = typeof QR_THEME_MESSAGES;

/** QR_THEME_MESSAGES in the catalog's language. */
export function qrThemeMessages(
  t: Translator<"communityActions.qrThemes">,
): QrThemeMessages {
  return {
    signIn: t("signIn"),
    failed: t("failed"),
    tooMany: t("tooMany"),
    themeLimit: (values) => t("themeLimit", values),
    notFound: t("notFound"),
    defaultAdminsOnly: t("defaultAdminsOnly"),
    openAnotherWorkspace: t("openAnotherWorkspace"),
    shareAdminsOnly: t("shareAdminsOnly"),
    sharedThemesPlan: (values) => t("sharedThemesPlan", values),
    workspaceThemeLimit: (values) => t("workspaceThemeLimit", values),
  };
}
