import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

export const PAYOUT_EMAIL_NOTICE_SUBJECT =
  "Your QRdx affiliate payouts now go to a new PayPal address";

/** The subject line in the recipient's language. */
export const payoutEmailNoticeSubject = (intl: EmailIntl = ENGLISH_EMAIL) =>
  intl.t("payoutEmailNotice.subject");

export interface PayoutEmailNoticeProps {
  /** The PayPal address payouts go to from now on */
  paypalEmail: string;
  /** Whether there was an address before (a change, not the first one) */
  replaced: boolean;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  /** The recipient's language */
  intl?: EmailIntl;
}

/**
 * Transactional security notice after the affiliate payout address is set
 * or changed (Settings → Affiliate program), with where and when it
 * happened. Whoever controls that address receives the affiliate's money,
 * so the account holder hears about every change. Nothing in it changes the
 * account.
 */
export function PayoutEmailNoticeEmail({
  paypalEmail,
  replaced,
  details,
  intl = ENGLISH_EMAIL,
}: PayoutEmailNoticeProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("payoutEmailNotice.preview", { paypalEmail })}
      reason={t("payoutEmailNotice.reason")}
    >
      <EmailHeading>{payoutEmailNoticeSubject(intl)}</EmailHeading>
      <EmailText>
        {t.rich("payoutEmailNotice.body", {
          replaced: replaced ? "yes" : "no",
          paypalEmail,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </EmailText>
      <SecurityDetails details={details} intl={intl} />
      <EmailText>{t("security.nothingElse")}</EmailText>
      <EmailDivider />
      <MutedText>
        {t.rich("payoutEmailNotice.notYou", supportLinkArgs)}
      </MutedText>
    </EmailLayout>
  );
}
