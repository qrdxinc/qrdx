import type { EmailIntl } from "../intl";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

export const PAYOUT_EMAIL_NOTICE_SUBJECT =
  "Your QRdx affiliate payouts now go to a new PayPal address";

/** The subject line in the recipient's language. */
export const payoutEmailNoticeSubject = (intl: EmailIntl) =>
  intl.t("payoutEmailNotice.subject");

export interface PayoutEmailNoticeProps {
  /** The PayPal address payouts go to from now on */
  paypalEmail: string;
  /** Whether there was an address before (a change, not the first one) */
  replaced: boolean;
  /** Where and when; the sender always passes it */
  details?: SecurityEventDetails;
  /** The account's address, where this goes */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
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
  recipient,
  intl,
}: PayoutEmailNoticeProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("payoutEmailNotice.preview", { paypalEmail })}
      reason={t("payoutEmailNotice.reason")}
      recipient={recipient}
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
      <MutedText>
        {t.rich("payoutEmailNotice.notYou", supportLinkArgs)}
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
PayoutEmailNoticeEmail.PreviewProps = {
  paypalEmail: "payouts@example.com",
  replaced: true,
  details: {
    device: "Chrome on macOS",
    location: "Mumbai, India",
    ip: "203.0.113.24",
    time: "Nov 19, 2026, 3:04 PM GMT+5:30",
  },
  recipient: "alex@example.com",
} satisfies Omit<PayoutEmailNoticeProps, "intl">;
