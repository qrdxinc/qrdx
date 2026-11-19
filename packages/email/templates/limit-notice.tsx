import type { EmailIntl } from "../intl";
import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { DetailsTable, MutedText } from "./parts";

export interface LimitNoticeEmailProps {
  /** "Acme" */
  workspaceName: string;
  /** "Dynamic QR codes" */
  limitLabel: string;
  /** "dynamic QR codes" */
  noun: string;
  level: "near" | "full";
  /** "9 of 10", "48 MB of 50 MB" */
  value: string;
  /** "Free" */
  planName: string;
  /**
   * What Plan & usage says about the limit (apps/app/lib/limit-notices/copy.ts), with
   * the reset date for monthly allowances
   */
  reason: string;
  /** Plan & usage for the workspace */
  usageUrl: string;
  /** Why this person gets it */
  recipientReason: string;
  /** The recipients' language; the strings above come in it too */
  intl: EmailIntl;
}

/**
 * Account notice: sent once when a workspace reaches 90% of a plan limit
 * and once at 100%, per limit and calendar month (apps/app/lib/limit-notices).
 */
export function LimitNoticeEmail({
  workspaceName,
  limitLabel,
  noun,
  level,
  value,
  planName,
  reason,
  usageUrl,
  recipientReason,
  intl,
}: LimitNoticeEmailProps) {
  const { t } = intl;
  const words = { level, workspace: workspaceName, noun, value };
  const rows = [
    { label: limitLabel, value },
    { label: t("limitNotice.plan"), value: planName },
  ];
  return (
    <EmailLayout
      intl={intl}
      preview={t("limitNotice.preview", words)}
      reason={recipientReason}
    >
      <EmailHeading>{t("limitNotice.heading", words)}</EmailHeading>
      <EmailText>
        {t("limitNotice.body", words)} {reason}
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={usageUrl}>{t("limitNotice.button")}</EmailButton>
      <EmailDivider />
      <MutedText>{t("limitNotice.howOften")}</MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
LimitNoticeEmail.PreviewProps = {
  workspaceName: "Acme",
  limitLabel: "Dynamic QR codes",
  noun: "dynamic QR codes",
  level: "near",
  value: "9 of 10",
  planName: "Free",
  reason: "Free includes 10 dynamic QR codes.",
  usageUrl: "https://qrdx.dev/settings/usage",
  recipientReason: "You're an owner of Acme on QRdx.",
} satisfies Omit<LimitNoticeEmailProps, "intl">;
