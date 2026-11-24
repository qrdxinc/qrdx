import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";

// Sent once when a subscription's payment fails and Polar marks it past_due
// (apps/app/lib/email/payment-failed.tsx, from the Polar webhook): the
// codes keep working, the plan's features stay on for a few days, and one
// button to update the card. From a person on the team, with replies to
// them. One of the notes from the QRdx team, so its footer can turn them
// off.

export interface PaymentFailedEmailProps {
  /** "Sam"; "there" when the account has no name */
  firstName: string;
  /** Who it's from and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** The plan that failed to renew: "Pro" or "Business" */
  planName: string;
  /** When its features stop if the payment hasn't gone through */
  graceEndsAt: Date | string;
  /** Opens the billing portal (absolute; /settings/portal) */
  billingUrl: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** The subject line in the recipient's language. */
export const paymentFailedSubject = (intl: EmailIntl) =>
  intl.t("paymentFailed.subject");

const longDate = (value: Date | string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));

export function PaymentFailedEmail({
  firstName,
  senderName,
  planName,
  graceEndsAt,
  billingUrl,
  unsubscribeUrl,
  recipient,
  intl,
}: PaymentFailedEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("paymentFailed.body", { plan: planName })}
      reason={t("paymentFailed.reason", { plan: planName })}
      recipient={recipient}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("paymentFailed.heading")}</EmailHeading>
      <EmailText>{t("paymentFailed.greeting", { name: firstName })}</EmailText>
      <EmailText>{t("paymentFailed.body", { plan: planName })}</EmailText>
      <EmailText>
        {t("paymentFailed.grace", {
          plan: planName,
          date: longDate(graceEndsAt, intl.locale),
        })}
      </EmailText>
      <EmailButton href={billingUrl}>{t("paymentFailed.button")}</EmailButton>
      <EmailText>{t("paymentFailed.reply")}</EmailText>
      <EmailText>{senderName}</EmailText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
PaymentFailedEmail.PreviewProps = {
  firstName: "Sam",
  senderName: "Ritesh from QRdx",
  planName: "Pro",
  graceEndsAt: new Date("2026-12-09T10:00:00Z"),
  billingUrl: "https://qrdx.dev/settings/portal",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "sam@example.com",
} satisfies Omit<PaymentFailedEmailProps, "intl">;
