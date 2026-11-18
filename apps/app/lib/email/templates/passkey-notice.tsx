import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

export type PasskeyChange = "added" | "removed";

export const PASSKEY_NOTICE_SUBJECTS: Record<PasskeyChange, string> = {
  added: "A passkey was added to your QRdx account",
  removed: "A passkey was removed from your QRdx account",
};

/** The subject line in the recipient's language. */
export const passkeyNoticeSubject = (
  change: PasskeyChange,
  intl: EmailIntl = ENGLISH_EMAIL,
) => intl.t(`passkeyNotice.${change}.subject`);

export interface PasskeyNoticeEmailProps {
  change: PasskeyChange;
  /** The passkey's name, e.g. "Chrome on macOS" */
  passkeyName: string;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  /** The recipient's language */
  intl?: EmailIntl;
}

/**
 * Transactional security notice after a passkey is added or removed, with
 * where and when it happened. The only links go to the security settings and
 * support; nothing in it changes the account.
 */
export function PasskeyNoticeEmail({
  change,
  passkeyName,
  details,
  intl = ENGLISH_EMAIL,
}: PasskeyNoticeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t(`passkeyNotice.${change}.preview`, { name: passkeyName })}
      reason={t("passkeyNotice.reason")}
    >
      <EmailHeading>{passkeyNoticeSubject(change, intl)}</EmailHeading>
      <EmailText>
        {t.rich(`passkeyNotice.${change}.body`, {
          name: passkeyName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </EmailText>
      <SecurityDetails details={details} intl={intl} />
      <EmailText>{t("security.nothingElse")}</EmailText>
      <ReviewSecurityButton intl={intl} />
      <EmailDivider />
      <MutedText>{t.rich("passkeyNotice.notYou", supportLinkArgs)}</MutedText>
    </EmailLayout>
  );
}
