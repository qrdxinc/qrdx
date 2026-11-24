import type { EmailIntl } from "../intl";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, MutedText } from "./parts";

// To QRdx (agency tools): someone asked to pay Business yearly by invoice.
// Polar's checkout only takes cards and wallets, so the invoice is arranged
// by hand; replying to this email reaches the requester.

export interface InvoiceRequestEmailProps {
  company: string;
  billingEmail: string;
  accountEmail: string;
  accountId: string;
  workspace: { name: string; slug: string } | null;
  country: string;
  taxId: string | null;
  address: string | null;
  notes: string | null;
  plan: string;
  /**
   * Who it was meant for, in the footer. The app leaves it out: this goes
   * to the QRdx team, and that line speaks to an account holder.
   */
  recipient?: string;
  /** The email's language (English: it goes to the QRdx team) */
  intl: EmailIntl;
}

export const invoiceRequestSubject = (company: string, plan: string) =>
  `Invoice request: ${plan} for ${company}`;

export function InvoiceRequestEmail(props: InvoiceRequestEmailProps) {
  const rows = [
    { label: "Plan", value: props.plan },
    { label: "Company", value: props.company },
    { label: "Billing email", value: props.billingEmail },
    { label: "Country", value: props.country },
    ...(props.taxId ? [{ label: "Tax ID", value: props.taxId }] : []),
    ...(props.address
      ? [{ label: "Billing address", value: props.address }]
      : []),
    {
      label: "Workspace",
      value: props.workspace
        ? `${props.workspace.name} (${props.workspace.slug})`
        : "Not signed in to one",
    },
    { label: "Account", value: `${props.accountEmail} (${props.accountId})` },
    ...(props.notes ? [{ label: "Notes", value: props.notes }] : []),
  ];
  return (
    <EmailLayout
      intl={props.intl}
      preview={invoiceRequestSubject(props.company, props.plan)}
      reason="Sent by the pay-by-invoice form on the pricing page."
      recipient={props.recipient}
    >
      <EmailHeading>Invoice request</EmailHeading>
      <EmailText>
        {props.company} would like to pay for {props.plan} by invoice. Reply to
        this email to reach {props.billingEmail}.
      </EmailText>
      <DetailsTable rows={rows} />
      <MutedText>
        Nothing was charged and no plan changed. The invoice and the plan are
        arranged by hand.
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
InvoiceRequestEmail.PreviewProps = {
  company: "Acme",
  billingEmail: "billing@example.com",
  accountEmail: "sam@example.com",
  accountId: "usr_preview",
  workspace: { name: "Acme", slug: "acme" },
  country: "Germany",
  taxId: "DE123456789",
  address: "1 Example Street, Berlin",
  notes: null,
  plan: "Business (yearly)",
} satisfies Omit<InvoiceRequestEmailProps, "intl">;
