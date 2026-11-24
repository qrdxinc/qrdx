import type { EmailIntl } from "../intl";
import { EmailCode, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  NeverAskForCode,
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

export const CONFIRMATION_CODE_SUBJECT = "Your QRdx confirmation code";

/** The subject line in the recipient's language. */
export const confirmationCodeSubject = (intl: EmailIntl) =>
  intl.t("confirmationCode.subject");

export interface ConfirmationCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes: number;
  /** Where the code was asked for */
  details: SecurityEventDetails;
  /** The address it's sent to */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/**
 * Transactional, to the account's address: the code for "Confirm it's you"
 * before a change to the account's security (accounts without two-step
 * verification). Nothing in it changes the account by itself.
 */
export function ConfirmationCodeEmail({
  code,
  expiresInMinutes,
  details,
  recipient,
  intl,
}: ConfirmationCodeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("confirmationCode.preview", { minutes: expiresInMinutes })}
      reason={t("confirmationCode.reason")}
      recipient={recipient}
    >
      <EmailHeading>{t("confirmationCode.heading")}</EmailHeading>
      <EmailText>{t("confirmationCode.enter")}</EmailText>
      <EmailCode code={code} />
      <EmailText>{t("codes.expires", { minutes: expiresInMinutes })}</EmailText>
      <NeverAskForCode intl={intl} />
      <SecurityDetails details={details} intl={intl} />
      <ReviewSecurityButton intl={intl} />
      <MutedText>
        {t.rich("confirmationCode.notYou", supportLinkArgs)}
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
ConfirmationCodeEmail.PreviewProps = {
  code: "482913",
  expiresInMinutes: 10,
  details: {
    device: "Chrome on macOS",
    location: "Mumbai, India",
    ip: "203.0.113.24",
    time: "Nov 19, 2026, 3:04 PM GMT+5:30",
  },
  recipient: "alex@example.com",
} satisfies Omit<ConfirmationCodeEmailProps, "intl">;
