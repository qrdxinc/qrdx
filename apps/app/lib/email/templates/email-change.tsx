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

export const EMAIL_CHANGE_CODE_SUBJECT = "Confirm your new email for QRdx";

/** The code email's subject in the recipient's language. */
export const emailChangeCodeSubject = (intl: EmailIntl = ENGLISH_EMAIL) =>
  intl.t("emailChangeCode.subject");
export const EMAIL_CHANGED_SUBJECT = "Your QRdx email was changed";

/** The "your address was changed" notice's subject in the recipient's language. */
export const emailChangedSubject = (intl: EmailIntl = ENGLISH_EMAIL) =>
  intl.t("emailChanged.subject");

const _plural = (minutes: number) =>
  `${minutes} minute${minutes === 1 ? "" : "s"}`;

export interface EmailChangeCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
  /** The recipient's language */
  intl?: EmailIntl;
}

/**
 * Transactional, to the NEW address: the code that confirms it. No links, so
 * nothing in it changes the account by itself.
 */
export function EmailChangeCodeEmail({
  code,
  expiresInMinutes = 5,
  intl = ENGLISH_EMAIL,
}: EmailChangeCodeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("emailChangeCode.preview", { minutes: expiresInMinutes })}
      reason={t("emailChangeCode.reason")}
    >
      <EmailHeading>{t("emailChangeCode.heading")}</EmailHeading>
      <EmailText>{t("emailChangeCode.enter")}</EmailText>
      <EmailCodeBox code={code} />
      <EmailText>{t("codes.expires", { minutes: expiresInMinutes })}</EmailText>
      <NeverAskForCode intl={intl} />
      <EmailDivider />
      <MutedText>{t("emailChangeCode.ignore")}</MutedText>
    </EmailLayout>
  );
}

export interface EmailChangedEmailProps {
  /** The account's address from now on */
  newEmail: string;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  /** The recipient's language */
  intl?: EmailIntl;
}

/**
 * Transactional, to the OLD address after the change, with where and when it
 * happened. Deliberately no link that undoes it: a reply to support (from
 * this address) is the way back.
 */
export function EmailChangedEmail({
  newEmail,
  details,
  intl = ENGLISH_EMAIL,
}: EmailChangedEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("emailChanged.preview", { newEmail })}
      reason={t("emailChanged.reason")}
    >
      <EmailHeading>{emailChangedSubject(intl)}</EmailHeading>
      <EmailText>
        {t.rich("emailChanged.body", {
          newEmail,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </EmailText>
      <SecurityDetails details={details} intl={intl} />
      <EmailText>{t("security.nothingElse")}</EmailText>
      <ReviewSecurityButton intl={intl} />
      <EmailDivider />
      <MutedText>{t.rich("emailChanged.notYou", supportLinkArgs)}</MutedText>
    </EmailLayout>
  );
}
