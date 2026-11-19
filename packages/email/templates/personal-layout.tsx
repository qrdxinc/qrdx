import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "react-email";
import type { EmailIntl } from "../intl";

// The frame of an email a person on the team writes (a personal note, the
// welcome email): it should read like an email from them, so no wordmark,
// card or buttons, just the text and a short footer saying why it came,
// that replying reaches them, and how to stop these emails.

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily: FONT,
    margin: 0,
    padding: "24px 12px",
  },
  container: { maxWidth: "560px", margin: "0" },
  text: {
    color: "#171717",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  hr: { borderColor: "#e5e5e5", margin: "28px 0 16px" },
  footerText: {
    color: "#737373",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 4px",
  },
  footerLink: { color: "#737373", textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;

export interface PersonalLayoutProps {
  /** Inbox preview line */
  preview: string;
  children: ReactNode;
  /** Why the recipient gets this email */
  reason: string;
  /** Who a reply reaches, e.g. "Ritesh from QRdx" */
  replyTo: string;
  /** Turns these emails off in one click (pass it to sendEmail too) */
  unsubscribeUrl: string;
  /** The recipient's language (../intl.ts) */
  intl: EmailIntl;
}

export function PersonalLayout({
  preview,
  children,
  reason,
  replyTo,
  unsubscribeUrl,
  intl,
}: PersonalLayoutProps) {
  const { t } = intl;
  return (
    <Html lang={intl.locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {children}
          <Hr style={styles.hr} />
          <Text style={styles.footerText}>{reason}</Text>
          <Text style={styles.footerText}>
            {t("personal.reply", { name: replyTo })}
          </Text>
          <Text style={styles.footerText}>
            <Link href={unsubscribeUrl} style={styles.footerLink}>
              {t("personal.stop")}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** A paragraph of the email's text. */
export function PersonalText({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}
