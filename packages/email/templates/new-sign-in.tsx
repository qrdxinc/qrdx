import type { CSSProperties } from "react";
import type { EmailIntl } from "../intl";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  supportLinkArgs,
} from "./security-parts";

export const NEW_SIGN_IN_SUBJECT = "New sign-in to your QRdx account";

/** The subject line in the recipient's language. */
export const newSignInSubject = (intl: EmailIntl) =>
  intl.t("newSignIn.subject");

const styles = {
  list: {
    color: "#737373",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 16px",
    paddingLeft: "20px",
  },
  item: { margin: "0 0 4px" },
} satisfies Record<string, CSSProperties>;

export interface NewSignInEmailProps {
  details: SecurityEventDetails;
  /** How they signed in: "Google", "Email code, then a passkey" */
  method: string | null;
  /** The recipient's language */
  intl: EmailIntl;
}

/**
 * Transactional, to the account's address when a browser or device signs in
 * for the first time. The only links go to the security settings and
 * support; nothing in it changes the account.
 */
export function NewSignInEmail({ details, method, intl }: NewSignInEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("newSignIn.preview", {
        device: details.device ?? t("newSignIn.newDevice"),
        hasLocation: details.location ? "yes" : "no",
        location: details.location ?? "",
      })}
      reason={t("newSignIn.reason")}
    >
      <EmailHeading>{t("newSignIn.subject")}</EmailHeading>
      <EmailText>{t("newSignIn.body")}</EmailText>
      <SecurityDetails
        details={details}
        extra={
          method ? [{ label: t("newSignIn.signedInWith"), value: method }] : []
        }
        intl={intl}
      />
      <EmailText>{t("newSignIn.nothingToDo")}</EmailText>
      <ReviewSecurityButton intl={intl} />
      <EmailDivider />
      <MutedText>{t("newSignIn.notYou")}</MutedText>
      <ol style={styles.list}>
        <li style={styles.item}>{t("newSignIn.signOut")}</li>
        <li style={styles.item}>{t("newSignIn.turnOn")}</li>
        <li style={styles.item}>
          {t.rich("newSignIn.contact", supportLinkArgs)}
        </li>
      </ol>
    </EmailLayout>
  );
}

/** What the preview app (apps/email) renders. */
NewSignInEmail.PreviewProps = {
  details: {
    device: "Chrome on macOS",
    location: "Mumbai, India",
    ip: "203.0.113.24",
    time: "Nov 19, 2026, 3:04 PM GMT+5:30",
  },
  method: "Google",
} satisfies Omit<NewSignInEmailProps, "intl">;
