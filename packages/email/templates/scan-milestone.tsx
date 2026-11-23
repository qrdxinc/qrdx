import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel } from "./parts";

export interface ScanMilestoneEmailProps {
  code: { title: string | null; slug: string };
  milestone: number;
  analyticsUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

export function ScanMilestoneEmail({
  code,
  milestone,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  recipient,
  intl,
}: ScanMilestoneEmailProps) {
  const { t } = intl;
  const reached = t("scanMilestone.reached", {
    code: codeLabel(code),
    count: milestone,
  });
  return (
    <EmailLayout
      intl={intl}
      preview={reached}
      recipient={recipient}
      reason={t("alerts.milestoneReason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{reached}</EmailHeading>
      <EmailText>{t("scanMilestone.body", { count: milestone })}</EmailText>
      <EmailButton href={analyticsUrl}>{t("alerts.viewAnalytics")}</EmailButton>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
ScanMilestoneEmail.PreviewProps = {
  code: { title: "Spring menu", slug: "aB3dE5f" },
  milestone: 100,
  analyticsUrl: "https://qrdx.dev/dashboard/acme/codes/aB3dE5f",
  workspaceName: "Acme",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "alex@example.com",
} satisfies Omit<ScanMilestoneEmailProps, "intl">;
