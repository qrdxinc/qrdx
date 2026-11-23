import type { EmailIntl } from "../intl";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, MutedText } from "./parts";

// To QRdx: someone filled in the contact form on /enterprise. Replying to
// this email reaches them (reply-to is their work email).

export interface EnterpriseRequestEmailProps {
  name: string;
  email: string;
  company: string;
  /** How the form's team size reads, e.g. "51 to 200 people" */
  teamSize: string;
  need: string;
  /** The language of the page they wrote from, e.g. "ja" */
  locale: string;
  /**
   * Who it was meant for, in the footer. The app leaves it out: this goes
   * to the QRdx team, and that line speaks to an account holder.
   */
  recipient?: string;
  /** The email's language (English: it goes to the QRdx team) */
  intl: EmailIntl;
}

export const enterpriseRequestSubject = (company: string, teamSize: string) =>
  `Enterprise: ${company} (${teamSize})`;

export function EnterpriseRequestEmail(props: EnterpriseRequestEmailProps) {
  const rows = [
    { label: "Name", value: props.name },
    { label: "Work email", value: props.email },
    { label: "Company", value: props.company },
    { label: "Team size", value: props.teamSize },
    { label: "Page language", value: props.locale },
    { label: "What they need", value: props.need },
  ];
  return (
    <EmailLayout
      intl={props.intl}
      preview={enterpriseRequestSubject(props.company, props.teamSize)}
      reason="Sent by the contact form on the Enterprise page."
      recipient={props.recipient}
    >
      <EmailHeading>Enterprise inquiry</EmailHeading>
      <EmailText>
        {props.name} at {props.company} wrote from the Enterprise page. Reply to
        this email to reach {props.email}.
      </EmailText>
      <DetailsTable rows={rows} />
      <MutedText>
        Nothing was set up or charged. Contracts, invoices and plans are
        arranged by hand.
      </MutedText>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
EnterpriseRequestEmail.PreviewProps = {
  name: "Sam Lee",
  email: "sam@example.com",
  company: "Acme",
  teamSize: "51 to 200 people",
  need: "Codes on every product label, with our own domain and SSO.",
  locale: "en",
} satisfies Omit<EnterpriseRequestEmailProps, "intl">;
