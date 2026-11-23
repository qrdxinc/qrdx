import { SUPPORT_EMAIL } from "@repo/config";
import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import type { EmailIntl } from "../intl";
import { baseUrl } from "../origin";

// Base layout for every QRdx email: a white page with one bordered card
// holding the logo, the email and a quiet footer. Templates render
// <EmailLayout preview="…">…</EmailLayout> and use the helpers below so all
// emails share one look.

/** The one accent: plain links and copy-paste URLs only. */
export const EMAIL_ACCENT = "#155DFC";
export const EMAIL_TEXT = "#0a0a0a";
export const EMAIL_MUTED = "#737373";
/** Borders and dividers. */
export const EMAIL_LINE = "#e5e5e5";
export const EMAIL_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Postal address shown in the footer (required by CAN-SPAM for marketing
 * email). Fill in before sending digests or announcements.
 */
export const EMAIL_POSTAL_ADDRESS: string | null = null;

/** The logo (mark and wordmark), 2× of its 32 px height, served by the app. */
export const emailLogoUrl = () =>
  new URL("/email/qrdx-logo.png", baseUrl).toString();

/** The logo PNG's size at 1× (apps/app/public/email/qrdx-logo.png is 218 × 64). */
const LOGO = { width: 109, height: 32 };

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Letter spacing (not spaces) keeps a code copyable as one word.
const CODE_SPACING = 0.25;
const CODE_SIZE = 28;

const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily: FONT,
    margin: 0,
    padding: "0 12px",
  },
  container: {
    backgroundColor: "#ffffff",
    border: `1px solid ${EMAIL_LINE}`,
    borderRadius: "8px",
    margin: "40px auto",
    maxWidth: "600px",
    padding: "20px 40px",
  },
  header: { marginTop: "32px" },
  logo: { display: "block", border: 0, outline: "none" },
  senderName: {
    color: EMAIL_TEXT,
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: "32px",
    margin: 0,
  },
  heading: {
    color: EMAIL_TEXT,
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: "28px",
    margin: "28px 0 16px",
    padding: 0,
  },
  text: {
    color: EMAIL_TEXT,
    fontSize: "14px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  buttonSection: { margin: "32px 0" },
  button: {
    backgroundColor: EMAIL_TEXT,
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "12px 24px",
    textAlign: "center",
    textDecoration: "none",
  },
  fallbackLabel: {
    color: EMAIL_MUTED,
    fontSize: "13px",
    lineHeight: "22px",
    margin: "0 0 4px",
  },
  fallbackText: {
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 16px",
    wordBreak: "break-all",
  },
  fallbackLink: {
    color: EMAIL_ACCENT,
    fontWeight: 500,
    textDecoration: "none",
    wordBreak: "break-all",
  },
  codeBox: {
    border: `1px solid ${EMAIL_LINE}`,
    borderRadius: "8px",
    margin: "32px 0",
    textAlign: "center",
  },
  code: {
    color: EMAIL_TEXT,
    fontFamily: EMAIL_MONO,
    fontSize: `${CODE_SIZE}px`,
    fontWeight: 600,
    letterSpacing: `${CODE_SPACING}em`,
    lineHeight: "36px",
    margin: 0,
    // The spacing after the last character, added on the left too, so the
    // code sits centred.
    padding: `14px 24px 14px ${24 + CODE_SIZE * CODE_SPACING}px`,
  },
  hr: {
    border: "none",
    borderTop: `1px solid ${EMAIL_LINE}`,
    margin: "24px 0",
    width: "100%",
  },
  footerText: {
    color: EMAIL_MUTED,
    fontSize: "12px",
    lineHeight: "20px",
    margin: "0 0 8px",
  },
  footerStrong: { color: EMAIL_TEXT, fontWeight: 400 },
  footerLink: { color: EMAIL_MUTED, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;

export interface EmailLayoutProps {
  /** Inbox preview line (keep under ~90 characters) */
  preview: string;
  children: ReactNode;
  /**
   * The address this email is sent to. The footer says who it was meant
   * for, so someone who got it by mistake can tell.
   */
  recipient?: string;
  /** Why the recipient gets this email, e.g. "You're an owner of Acme on QRdx." */
  reason?: string;
  /** Shows an Unsubscribe link; pass the same URL to sendEmail's `unsubscribeUrl` */
  unsubscribeUrl?: string;
  /**
   * Where the recipient turns this kind of email off (a notification
   * settings page). Shown when there's no `unsubscribeUrl`.
   */
  settingsUrl?: string;
  /**
   * Sent on a workspace's behalf (agency tools: client-portal invitations on
   * Business): its name heads the email instead of the QRdx logo, and
   * the footer only names the host that sends it.
   */
  sender?: { name: string };
  /** The recipient's language (../intl.ts) */
  intl: EmailIntl;
}

export function EmailLayout({
  preview,
  children,
  recipient,
  reason,
  unsubscribeUrl,
  settingsUrl,
  sender,
  intl,
}: EmailLayoutProps) {
  const origin = baseUrl.origin;
  const { t } = intl;
  const footerLink = (href: string) => (chunks: ReactNode) => (
    <Link href={href} style={styles.footerLink}>
      {chunks}
    </Link>
  );
  return (
    <Html lang={intl.locale}>
      <Head>
        <meta content="light" name="color-scheme" />
        <meta content="light" name="supported-color-schemes" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            {sender ? (
              <Text style={styles.senderName}>{sender.name}</Text>
            ) : (
              // Skipped in the plain-text body, where it'd be a bare URL.
              <Link data-skip-in-text="true" href={origin}>
                <Img
                  alt="QRdx"
                  height={LOGO.height}
                  src={emailLogoUrl()}
                  style={styles.logo}
                  width={LOGO.width}
                />
              </Link>
            )}
          </Section>
          {children}
          <Hr style={styles.hr} />
          {recipient ? (
            <Text style={styles.footerText}>
              {t.rich("layout.meantFor", {
                email: recipient,
                strong: (chunks) => (
                  <span style={styles.footerStrong}>{chunks}</span>
                ),
                link: footerLink(`mailto:${SUPPORT_EMAIL}`),
              })}
            </Text>
          ) : null}
          {reason ? <Text style={styles.footerText}>{reason}</Text> : null}
          {unsubscribeUrl || settingsUrl ? (
            <Text style={styles.footerText}>
              {unsubscribeUrl ? (
                <Link href={unsubscribeUrl} style={styles.footerLink}>
                  {t("layout.unsubscribe")}
                </Link>
              ) : (
                <Link href={settingsUrl} style={styles.footerLink}>
                  {t("layout.settings")}
                </Link>
              )}
            </Text>
          ) : null}
          <Text style={styles.footerText}>
            {sender
              ? t.rich("layout.sentFor", {
                  name: sender.name,
                  link: footerLink(origin),
                  host: baseUrl.host,
                })
              : t.rich("layout.sentBy", {
                  link: footerLink(origin),
                  host: baseUrl.host,
                })}
          </Text>
          {EMAIL_POSTAL_ADDRESS ? (
            <Text style={styles.footerText}>{EMAIL_POSTAL_ADDRESS}</Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.heading}>
      {children}
    </Heading>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

/** The black button, left aligned, with room above and below. */
export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={styles.buttonSection}>
      <Button href={href} style={styles.button}>
        {children}
      </Button>
    </Section>
  );
}

/**
 * After a button: "or copy and paste this link into your browser:" and the
 * URL (shown without https://), for mail apps that break buttons.
 */
export function EmailLinkFallback({
  url,
  intl,
}: {
  url: string;
  intl: EmailIntl;
}) {
  return (
    <>
      <Text style={styles.fallbackLabel}>{intl.t("layout.copyLink")}</Text>
      <Text style={styles.fallbackText}>
        <Link href={url} style={styles.fallbackLink}>
          {url.replace(/^https?:\/\//, "")}
        </Link>
      </Text>
    </>
  );
}

/** A one-time code, large, monospaced and centred in a bordered box. */
export function EmailCode({ code }: { code: string }) {
  return (
    <Section style={styles.codeBox}>
      <Text style={styles.code}>{code}</Text>
    </Section>
  );
}

export function EmailDivider() {
  return <Hr style={styles.hr} />;
}
