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
import { baseUrl } from "../origin";
import { EMAIL_LINE, EMAIL_MUTED, EMAIL_TEXT } from "./layout";

// The frame of a note a person on the team writes (personal-note.tsx, sent
// from the console): it should read like a short letter from them, so no logo,
// card or buttons, just their text in the same type as QRdx's other emails,
// their name, and a small footer saying who it was meant for, why it came,
// that replying reaches them, how to stop these emails, and QRdx's line.

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily: FONT,
    margin: 0,
    padding: "24px 12px",
  },
  container: { maxWidth: "600px", margin: "0" },
  text: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  hr: {
    border: "none",
    borderTop: `1px solid ${EMAIL_LINE}`,
    margin: "32px 0 16px",
    width: "100%",
  },
  footerText: {
    color: EMAIL_MUTED,
    fontSize: "12px",
    lineHeight: "20px",
    margin: "0 0 4px",
  },
  footerStrong: { color: EMAIL_TEXT, fontWeight: 400 },
  footerLink: { color: EMAIL_MUTED, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;

export interface PersonalLayoutProps {
  /** Inbox preview line */
  preview: string;
  children: ReactNode;
  /** The address this email is sent to, named in the footer */
  recipient?: string;
  /** Why the recipient gets this email */
  reason: string;
  /** Who a reply reaches, e.g. "Ritesh from QRdx" */
  replyTo: string;
  /** Turns these emails off in one click (pass it to sendEmail too) */
  unsubscribeUrl: string;
  /** The recipient's language (../intl.ts): the footer's */
  intl: EmailIntl;
  /**
   * The whole email's language, when it's all in the recipient's. A note
   * is in its writer's language, which isn't known, so only its footer
   * says it's in the recipient's.
   */
  lang?: string;
}

export function PersonalLayout({
  preview,
  children,
  recipient,
  reason,
  replyTo,
  unsubscribeUrl,
  intl,
  lang,
}: PersonalLayoutProps) {
  const { t } = intl;
  return (
    <Html lang={lang}>
      <Head>
        <meta content="light" name="color-scheme" />
        <meta content="light" name="supported-color-schemes" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {children}
          <Hr style={styles.hr} />
          <div lang={intl.locale}>
            <Text style={styles.footerText}>
              {recipient
                ? t.rich("personal.meantFor", {
                    email: recipient,
                    strong: (chunks) => (
                      <span style={styles.footerStrong}>{chunks}</span>
                    ),
                  })
                : null}
              {recipient ? " " : null}
              {reason}
            </Text>
            <Text style={styles.footerText}>
              {t("personal.reply", { name: replyTo })}{" "}
              <Link href={unsubscribeUrl} style={styles.footerLink}>
                {t("personal.stop")}
              </Link>
            </Text>
            <Text style={styles.footerText}>
              {t.rich("layout.sentBy", {
                link: (chunks) => (
                  <Link
                    data-text-only="true"
                    href={baseUrl.origin}
                    style={styles.footerLink}
                  >
                    {chunks}
                  </Link>
                ),
                host: baseUrl.host,
              })}
            </Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

/** A paragraph of the email's text. */
export function PersonalText({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}
