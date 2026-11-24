import type { ReactNode } from "react";
import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import {
  codeLabel,
  DetailsTable,
  type EmailInvite,
  EmailTextLink,
  formatEmailDateTime,
  InviteLine,
} from "./parts";

export interface FirstScanEmailProps {
  code: { title: string | null; slug: string };
  scannedAt: Date | string;
  /** "Berlin, DE" etc.; omitted when unknown */
  location?: string | null;
  /** "iOS · Safari" etc. */
  device?: string | null;
  analyticsUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
  /**
   * The Free plan's one first-scan email per code (apps/app/lib/email/
   * first-scan.tsx): says why it came and adds one line on what Pro sends.
   */
  free?: {
    pricingUrl: string;
    /** The next scan milestones Pro emails at: "10", "100", "500" */
    milestones: [string, string, string];
  };
  /** The invite offer, under the Pro line and the button */
  invite?: EmailInvite;
}

export function FirstScanEmail({
  code,
  scannedAt,
  location,
  device,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  recipient,
  intl,
  free,
  invite,
}: FirstScanEmailProps) {
  const { t } = intl;
  const rows = [
    {
      label: t("firstScan.when"),
      value: formatEmailDateTime(scannedAt, intl.locale),
    },
    ...(location ? [{ label: t("firstScan.where"), value: location }] : []),
    ...(device ? [{ label: t("firstScan.device"), value: device }] : []),
  ];
  return (
    <EmailLayout
      intl={intl}
      preview={t("firstScan.preview", { code: codeLabel(code) })}
      recipient={recipient}
      reason={
        free
          ? t("firstScan.freeReason")
          : t("alerts.milestoneReason", { workspace: workspaceName })
      }
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("firstScan.heading")}</EmailHeading>
      <EmailText>{t("firstScan.body", { code: codeLabel(code) })}</EmailText>
      <DetailsTable rows={rows} />
      {free ? (
        <EmailText>
          {t.rich("firstScan.pro", {
            first: free.milestones[0],
            second: free.milestones[1],
            third: free.milestones[2],
            link: (chunks: ReactNode) => (
              <EmailTextLink href={free.pricingUrl}>{chunks}</EmailTextLink>
            ),
          })}
        </EmailText>
      ) : null}
      <EmailButton href={analyticsUrl}>{t("alerts.viewAnalytics")}</EmailButton>
      {invite ? <InviteLine intl={intl} invite={invite} /> : null}
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
FirstScanEmail.PreviewProps = {
  code: { title: "Spring menu", slug: "aB3dE5f" },
  scannedAt: new Date("2026-11-19T09:30:00Z"),
  location: "Berlin, DE",
  device: "iOS · Safari",
  analyticsUrl: "https://qrdx.dev/dashboard/acme/codes/aB3dE5f",
  workspaceName: "Acme",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  invite: { url: "https://qrdx.dev/settings/invite", count: 5, both: false },
  recipient: "alex@example.com",
} satisfies Omit<FirstScanEmailProps, "intl">;
