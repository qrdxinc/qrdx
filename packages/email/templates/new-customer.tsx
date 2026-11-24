import type { CSSProperties, ReactNode } from "react";
import type { EmailIntl } from "../intl";
import {
  EMAIL_TEXT,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { EmailTextLink, formatCount } from "./parts";

// Sent once after someone's first payment for a paid plan
// (apps/app/lib/email/new-customer.tsx, from the Polar webhook): thanks,
// three things to set up on the plan they bought (only what that plan and
// this deployment have), the money-back guarantee in plain words, and an
// invitation to reply. From a person on the team, with replies to them. One
// of the notes from the QRdx team, so its footer can turn them off.

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

/** Something to set up, and where (absolute URL). */
export type NewCustomerStep =
  /** Connect a custom domain: `count` the plan includes */
  | { kind: "domain"; url: string; count: number }
  /** Choose a code's back-half */
  | { kind: "backHalf"; url: string }
  /** Scan alerts are on by default: where to change them */
  | { kind: "alerts"; url: string }
  /** Invite the team: `count` members, null for no limit */
  | { kind: "team"; url: string; count: number | null };

export interface NewCustomerEmailProps {
  /** "Sam"; "there" when the account has no name */
  firstName: string;
  /** Who it's from and whom a reply reaches, e.g. "Ritesh from QRdx" */
  senderName: string;
  /** "Pro" or "Business" */
  planName: string;
  /** Up to three, in order */
  steps: NewCustomerStep[];
  /** Days to ask for the first payment back (apps/app/lib/pricing.ts) */
  moneyBackDays: number;
  /** Turns notes from the team off in one click */
  unsubscribeUrl: string;
  /** The address it's sent to (the footer names it) */
  recipient?: string;
  /** The recipient's language */
  intl: EmailIntl;
}

/** The subject line in the recipient's language. */
export const newCustomerSubject = (
  intl: EmailIntl,
  { planName }: { planName: string },
) => intl.t("newCustomer.subject", { plan: planName });

function StepLine({ step, intl }: { step: NewCustomerStep; intl: EmailIntl }) {
  const { t } = intl;
  const link = (chunks: ReactNode) => (
    <EmailTextLink href={step.url}>{chunks}</EmailTextLink>
  );
  switch (step.kind) {
    case "domain":
      return t.rich("newCustomer.domain", {
        count: formatCount(step.count, intl.locale),
        link,
      });
    case "backHalf":
      return t.rich("newCustomer.backHalf", { link });
    case "alerts":
      return t.rich("newCustomer.alerts", { link });
    default:
      return step.count === null
        ? t.rich("newCustomer.teamUnlimited", { link })
        : t.rich("newCustomer.team", {
            count: formatCount(step.count, intl.locale),
            link,
          });
  }
}

export function NewCustomerEmail({
  firstName,
  senderName,
  planName,
  steps,
  moneyBackDays,
  unsubscribeUrl,
  recipient,
  intl,
}: NewCustomerEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("newCustomer.thanks", { plan: planName })}
      reason={t("newCustomer.reason", { plan: planName })}
      recipient={recipient}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("newCustomer.subject", { plan: planName })}</EmailHeading>
      <EmailText>{t("newCustomer.greeting", { name: firstName })}</EmailText>
      <EmailText>{t("newCustomer.thanks", { plan: planName })}</EmailText>
      {steps.length > 0 ? (
        <>
          <EmailText>
            {t("newCustomer.setUp", { count: steps.length })}
          </EmailText>
          <ol style={styles.list}>
            {steps.map((step) => (
              <li key={step.kind} style={styles.item}>
                <StepLine intl={intl} step={step} />
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <EmailText>
        {t("newCustomer.moneyBack", { plan: planName, days: moneyBackDays })}
      </EmailText>
      <EmailText>{t("newCustomer.reply")}</EmailText>
      <EmailText>{senderName}</EmailText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
NewCustomerEmail.PreviewProps = {
  firstName: "Sam",
  senderName: "Ritesh from QRdx",
  planName: "Pro",
  steps: [
    {
      kind: "domain",
      url: "https://qrdx.dev/dashboard?to=settings/domains",
      count: 5,
    },
    { kind: "backHalf", url: "https://qrdx.dev/dashboard?to=codes" },
    { kind: "alerts", url: "https://qrdx.dev/settings/notifications" },
  ],
  moneyBackDays: 30,
  unsubscribeUrl: "https://qrdx.dev/api/email/unsubscribe?token=preview.token",
  recipient: "sam@example.com",
} satisfies Omit<NewCustomerEmailProps, "intl">;
