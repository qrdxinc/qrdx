import type { CSSProperties, ReactNode } from "react";
import type { EmailIntl } from "../intl";
import {
  EMAIL_TEXT,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { EmailTextLink, formatCount } from "./parts";

// Sent once, right after someone makes an account
// (apps/app/lib/email/welcome.tsx): a short note from a person on the team
// about what QRdx is for and what to try first, signed by them, in the
// frame every QRdx email shares. One of the notes from the QRdx team, so
// its footer can turn them off.

const styles = {
  list: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    lineHeight: "24px",
    margin: "0 0 16px",
    paddingLeft: "20px",
  },
  item: { margin: "0 0 8px", paddingLeft: "4px" },
} satisfies Record<string, CSSProperties>;

export interface WelcomeEmailProps {
  /** "Sam"; "there" when the account has no name */
  firstName: string;
  /** Who it's from and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** Where to make a dynamic code (absolute URLs) */
  newCodeUrl: string;
  /** Where its scans show */
  scansUrl: string;
  /** Free's dynamic codes (lib/plans.ts) */
  freeDynamicCodes: number;
  /** Pro's custom domains (lib/plans.ts) */
  proCustomDomains: number;
  /** Pro's prices in the person's currency: "$5", "$48" */
  proMonthly: string;
  proYearly: string;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** The subject line in the recipient's language. */
export const welcomeSubject = (intl: EmailIntl) => intl.t("welcome.subject");

export function WelcomeEmail({
  firstName,
  senderName,
  newCodeUrl,
  scansUrl,
  freeDynamicCodes,
  proCustomDomains,
  proMonthly,
  proYearly,
  unsubscribeUrl,
  recipient,
  intl,
}: WelcomeEmailProps) {
  const { t } = intl;
  const link = (href: string) => (chunks: ReactNode) => (
    <EmailTextLink href={href}>{chunks}</EmailTextLink>
  );
  return (
    <EmailLayout
      intl={intl}
      preview={t("welcome.intro")}
      reason={t("welcome.reason")}
      recipient={recipient}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("welcome.subject")}</EmailHeading>
      <EmailText>{t("welcome.greeting", { name: firstName })}</EmailText>
      <EmailText>{t("welcome.intro")}</EmailText>
      <EmailText>{t("welcome.try")}</EmailText>
      <ol style={styles.list}>
        <li style={styles.item}>
          {t.rich("welcome.makeCode", { link: link(newCodeUrl) })}
        </li>
        <li style={styles.item}>
          {t.rich("welcome.seeScans", { link: link(scansUrl) })}
        </li>
        <li style={styles.item}>{t("welcome.changeLink")}</li>
      </ol>
      <EmailButton href={newCodeUrl}>{t("welcome.button")}</EmailButton>
      <EmailText>
        {t("welcome.free", {
          count: formatCount(freeDynamicCodes, intl.locale),
        })}
      </EmailText>
      <EmailText>
        {t("welcome.pro", {
          monthly: proMonthly,
          yearly: proYearly,
          domains: formatCount(proCustomDomains, intl.locale),
        })}{" "}
        {t("welcome.taxes")}
      </EmailText>
      <EmailText>{t("welcome.reply")}</EmailText>
      <EmailText>{senderName}</EmailText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
WelcomeEmail.PreviewProps = {
  firstName: "Sam",
  senderName: "Ritesh from QRdx",
  newCodeUrl: "https://qrdx.dev/playground",
  scansUrl: "https://qrdx.dev/dashboard?to=analytics",
  freeDynamicCodes: 10,
  proCustomDomains: 5,
  proMonthly: "$5",
  proYearly: "$48",
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "sam@example.com",
} satisfies Omit<WelcomeEmailProps, "intl">;
