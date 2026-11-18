import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  NeverAskForCode,
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";
import { EmailCodeBox } from "./sign-in-code";

export const CONFIRMATION_CODE_SUBJECT = "Your QRdx confirmation code";

/** The subject line in the recipient's language. */
export const confirmationCodeSubject = (intl: EmailIntl = ENGLISH_EMAIL) =>
  intl.t("confirmationCode.subject");

export interface ConfirmationCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes: number;
  /** Where the code was asked for */
  details: SecurityEventDetails;
  /** The recipient's language */
  intl?: EmailIntl;
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
  intl = ENGLISH_EMAIL,
}: ConfirmationCodeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("confirmationCode.preview", { minutes: expiresInMinutes })}
      reason={t("confirmationCode.reason")}
    >
      <EmailHeading>{t("confirmationCode.heading")}</EmailHeading>
      <EmailText>{t("confirmationCode.enter")}</EmailText>
      <EmailCodeBox code={code} />
      <EmailText>{t("codes.expires", { minutes: expiresInMinutes })}</EmailText>
      <NeverAskForCode intl={intl} />
      <SecurityDetails details={details} intl={intl} />
      <ReviewSecurityButton intl={intl} />
      <EmailDivider />
      <MutedText>
        {t.rich("confirmationCode.notYou", supportLinkArgs)}
      </MutedText>
    </EmailLayout>
  );
}
