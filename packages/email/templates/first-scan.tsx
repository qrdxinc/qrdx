import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel, DetailsTable, formatEmailDateTime } from "./parts";

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
  /** The recipient's language */
  intl: EmailIntl;
}

export function FirstScanEmail({
  code,
  scannedAt,
  location,
  device,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  intl,
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
      reason={t("alerts.milestoneReason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("firstScan.heading")}</EmailHeading>
      <EmailText>{t("firstScan.body", { code: codeLabel(code) })}</EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={analyticsUrl}>{t("alerts.viewAnalytics")}</EmailButton>
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
} satisfies Omit<FirstScanEmailProps, "intl">;
