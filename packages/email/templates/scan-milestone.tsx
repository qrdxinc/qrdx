import type { ReactNode } from "react";
import type { EmailIntl } from "../intl";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import {
  codeLabel,
  type EmailInvite,
  EmailTextLink,
  InviteLine,
} from "./parts";

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
  /**
   * Free's one scan-milestone email (apps/app/lib/email/
   * free-scan-milestone.tsx): says why it came and adds one line on Pro.
   */
  free?: {
    pricingUrl: string;
    /** The next scan milestones Pro emails at: "500", "1,000" */
    milestones: [string, string];
  };
  /** The invite offer, under the Pro line and the button */
  invite?: EmailInvite;
}

export function ScanMilestoneEmail({
  code,
  milestone,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  recipient,
  intl,
  free,
  invite,
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
      reason={
        free
          ? t("scanMilestone.freeReason", { count: milestone })
          : t("alerts.milestoneReason", { workspace: workspaceName })
      }
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{reached}</EmailHeading>
      <EmailText>{t("scanMilestone.body", { count: milestone })}</EmailText>
      {free ? (
        <EmailText>
          {t.rich("scanMilestone.pro", {
            first: free.milestones[0],
            second: free.milestones[1],
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
ScanMilestoneEmail.PreviewProps = {
  code: { title: "Spring menu", slug: "aB3dE5f" },
  milestone: 100,
  analyticsUrl: "https://qrdx.dev/dashboard/acme/codes/aB3dE5f",
  workspaceName: "Acme",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  invite: { url: "https://qrdx.dev/settings/invite", count: 5, both: false },
  recipient: "alex@example.com",
} satisfies Omit<ScanMilestoneEmailProps, "intl">;

export type FreeScanMilestoneEmailProps = ScanMilestoneEmailProps &
  Required<Pick<ScanMilestoneEmailProps, "free">>;

/**
 * Free's one scan-milestone email, sent once per account when one of its
 * codes reaches 100 scans (apps/app/lib/email/free-scan-milestone.tsx):
 * the milestone email with its Pro line. One of the notes from the QRdx
 * team, so its footer can turn them off.
 */
export function FreeScanMilestoneEmail(props: FreeScanMilestoneEmailProps) {
  return <ScanMilestoneEmail {...props} />;
}

/** What the preview app (apps/email) renders. */
FreeScanMilestoneEmail.PreviewProps = {
  ...ScanMilestoneEmail.PreviewProps,
  workspaceName: "",
  free: {
    pricingUrl: "https://qrdx.dev/pricing",
    milestones: ["500", "1,000"],
  },
  invite: { url: "https://qrdx.dev/settings/invite", count: 5, both: true },
} satisfies Omit<FreeScanMilestoneEmailProps, "intl">;
