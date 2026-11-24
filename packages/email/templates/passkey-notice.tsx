import type { EmailIntl } from "../intl";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
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
export const passkeyNoticeSubject = (change: PasskeyChange, intl: EmailIntl) =>
  intl.t(`passkeyNotice.${change}.subject`);

export interface PasskeyNoticeEmailProps {
  change: PasskeyChange;
  /** The passkey's name, e.g. "Chrome on macOS" */
  passkeyName: string;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  /** The address it's sent to */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
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
  recipient,
  intl,
}: PasskeyNoticeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t(`passkeyNotice.${change}.preview`, { name: passkeyName })}
      reason={t("passkeyNotice.reason")}
      recipient={recipient}
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
      <MutedText>{t.rich("passkeyNotice.notYou", supportLinkArgs)}</MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
PasskeyNoticeEmail.PreviewProps = {
  change: "added",
  passkeyName: "Chrome on macOS",
  details: {
    device: "Chrome on macOS",
    location: "Mumbai, India",
    ip: "203.0.113.24",
    time: "Nov 19, 2026, 3:04 PM GMT+5:30",
  },
  recipient: "alex@example.com",
} satisfies Omit<PasskeyNoticeEmailProps, "intl">;
