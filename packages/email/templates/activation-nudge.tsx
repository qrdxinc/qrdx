import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";

// Sent once, about two days after someone makes an account, only while they
// haven't made a dynamic code (apps/app/lib/email/activation-nudge.tsx): a
// short note from a person on the team saying what a dynamic code is for,
// with one button to make one and an invitation to reply. One of the notes
// from the QRdx team, so its footer can turn them off.

export interface ActivationNudgeEmailProps {
  /** "Sam"; "there" when the account has no name */
  firstName: string;
  /** Who it's from and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** Where to make a dynamic code (absolute) */
  newCodeUrl: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** The subject line in the recipient's language. */
export const activationNudgeSubject = (intl: EmailIntl) =>
  intl.t("activationNudge.subject");

export function ActivationNudgeEmail({
  firstName,
  senderName,
  newCodeUrl,
  unsubscribeUrl,
  recipient,
  intl,
}: ActivationNudgeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("activationNudge.what")}
      reason={t("activationNudge.reason")}
      recipient={recipient}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("activationNudge.subject")}</EmailHeading>
      <EmailText>{t("activationNudge.greeting", { name: firstName })}</EmailText>
      <EmailText>{t("activationNudge.what")}</EmailText>
      <EmailButton href={newCodeUrl}>{t("activationNudge.button")}</EmailButton>
      <EmailText>{t("activationNudge.reply")}</EmailText>
      <EmailText>{senderName}</EmailText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
ActivationNudgeEmail.PreviewProps = {
  firstName: "Sam",
  senderName: "Ritesh from QRdx",
  newCodeUrl: "https://qrdx.dev/playground",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "sam@example.com",
} satisfies Omit<ActivationNudgeEmailProps, "intl">;
