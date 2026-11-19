import type { EmailIntl } from "../intl";
import { baseUrl } from "../origin";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, formatEmailDateTime, MutedText } from "./parts";

export interface AbuseReportAckEmailProps {
  /** Reported link or code, as the reporter entered it */
  reported: string | null;
  reason: string;
  reportedAt: Date | string;
  reportId: string;
  /** The layout's language (the body is English) */
  intl: EmailIntl;
}

/**
 * Transactional: confirms an abuse report to the address the reporter gave.
 * Never echoes their free-text details back (keeps it from being a relay).
 */
export function AbuseReportAckEmail({
  reported,
  reason,
  reportedAt,
  reportId,
  intl,
}: AbuseReportAckEmailProps) {
  return (
    <EmailLayout
      intl={intl}
      preview="We received your report"
      reason="You got this email because this address was entered on the QRdx abuse report form."
    >
      <EmailHeading>We received your report</EmailHeading>
      <EmailText>
        Thanks for telling us. Our team reviews every report, and QR codes or
        pages that break our rules are disabled.
      </EmailText>
      <DetailsTable
        rows={[
          ...(reported ? [{ label: "Reported", value: reported }] : []),
          { label: "Reason", value: reason },
          { label: "Received", value: formatEmailDateTime(reportedAt) },
          { label: "Reference", value: reportId },
        ]}
      />
      <MutedText>
        We may not be able to reply to every report individually. Our rules are
        in the terms of service:{" "}
        {new URL("/legal/terms-of-service", baseUrl).toString()}
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
AbuseReportAckEmail.PreviewProps = {
  reported: "https://qrdx.dev/q/aB3dE5f",
  reason: "Phishing",
  reportedAt: new Date("2026-11-19T09:30:00Z"),
  reportId: "rep_7f3k2m9x",
} satisfies Omit<AbuseReportAckEmailProps, "intl">;
