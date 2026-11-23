import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailLinkFallback,
  EmailText,
} from "@repo/email/templates/layout";
import { MutedText } from "@repo/email/templates/parts";
import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";

// Agency tools: a workspace on Business shared some of its folders with a
// client. Sent in the workspace's name (EmailLayout `sender`).

export interface PortalInviteEmailProps {
  /** The portal's name (its branding, else the workspace's name) */
  portalName: string;
  inviterName: string;
  portalUrl: string;
  /** The folders shared, by name */
  folders: string[];
  /** The client's address (the footer names it) */
  recipient?: string;
  /** The client's language (./manage.tsx picks it) */
  intl?: EmailIntl;
}

export const portalInviteSubject = (
  portalName: string,
  intl: EmailIntl = ENGLISH_EMAIL,
) => intl.t("portalInvite.subject", { portal: portalName });

/** "Menus", "Menus and Flyers", "Menus, Flyers and Posters" */
function folderList(folders: string[], intl: EmailIntl): string {
  // English keeps the list it always had (no comma before "and").
  if (intl.locale !== "en") {
    return new Intl.ListFormat(intl.locale, { type: "conjunction" }).format(
      folders,
    );
  }
  return folders.length === 1
    ? (folders[0] as string)
    : `${folders.slice(0, -1).join(", ")} and ${folders.at(-1)}`;
}

export function PortalInviteEmail({
  portalName,
  inviterName,
  portalUrl,
  folders,
  recipient,
  intl = ENGLISH_EMAIL,
}: PortalInviteEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={portalInviteSubject(portalName, intl)}
      reason={t("portalInvite.reason", {
        inviter: inviterName,
        portal: portalName,
      })}
      recipient={recipient}
      sender={{ name: portalName }}
    >
      <EmailHeading>{t("portalInvite.heading")}</EmailHeading>
      <EmailText>
        {t("portalInvite.body", {
          hasFolders: folders.length > 0 ? "yes" : "no",
          inviter: inviterName,
          portal: portalName,
          folders: folders.length > 0 ? folderList(folders, intl) : "",
        })}
      </EmailText>
      <EmailButton href={portalUrl}>{t("portalInvite.open")}</EmailButton>
      <EmailLinkFallback intl={intl} url={portalUrl} />
      <MutedText>{t("portalInvite.signIn")}</MutedText>
    </EmailLayout>
  );
}

export default PortalInviteEmail;
